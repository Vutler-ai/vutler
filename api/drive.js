/**
 * Vutler Drive API — S3 Storage (MinIO via Vaultbrix)
 * All new uploads → MinIO S3
 * Legacy files: falls back to DB (bytea) or Synology
 */
'use strict';
const express = require('express');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const pool = require('../lib/vaultbrix');
const s3 = require('../services/s3Storage');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const DEFAULT_USER_SCOPE = 'workspace';

// ── Synology config (legacy, for download fallback) ──
const SYNO_HOST = process.env.SYNO_HOST || 'c453.synology.infomaniak.ch';
const SYNO_PORT = Number(process.env.SYNO_PORT || 5001);
const SYNO_USER = process.env.SYNO_USER || 'administrateur';
const SYNO_PASS = process.env.SYNO_PASS || 'Roxanne1212**#';

let _sid = null;
let _sidTs = 0;
const SID_TTL = 10 * 60 * 1000;

function synoRequest(reqPath, qs) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams(qs).toString();
    const req = https.request({
      hostname: SYNO_HOST, port: SYNO_PORT,
      path: `${reqPath}?${params}`, method: 'GET',
      rejectUnauthorized: false,
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Synology parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Synology timeout')));
    req.end();
  });
}

async function getSid() {
  if (_sid && Date.now() - _sidTs < SID_TTL) return _sid;
  const r = await synoRequest('/webapi/auth.cgi', {
    api: 'SYNO.API.Auth', version: 3, method: 'login',
    account: SYNO_USER, passwd: SYNO_PASS,
    session: 'FileStation', format: 'sid',
  });
  if (!r.success) throw new Error('Synology auth failed');
  _sid = r.data.sid;
  _sidTs = Date.now();
  return _sid;
}

function getWorkspaceId(req) {
  return req.headers['x-workspace-id'] || req.workspaceId || DEFAULT_WORKSPACE;
}

function normalizePath(p) {
  return path.posix.normalize(p || '/').replace(/\/+/g, '/');
}


function getRequestUser(req) {
  const userId = req.user?.id || req.user?.user_id || req.headers['x-user-id'] || null;
  const role = (req.user?.role || req.user?.roles?.[0] || '').toString().toLowerCase();
  const isAdmin = role === 'admin' || req.user?.is_admin === true;
  return { userId, isAdmin };
}

function buildScopedS3Key(workspaceId, userId, virtualPath, fileName) {
  const baseScope = userId || DEFAULT_USER_SCOPE;
  const folder = normalizePath(virtualPath || '/').replace(/^\/+/, '');
  const leaf = folder ? `${folder}/${fileName}` : fileName;
  return `${workspaceId}/${baseScope}/${leaf}`.replace(/\/+/g, '/');
}

// ── GET /files — list files & folders ──
router.get('/files', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const reqPath = normalizePath(req.query.path || '/');
    const { userId, isAdmin } = getRequestUser(req);
    let r;
    try {
      r = await pool.query(
        `SELECT id, name, path, type, mime_type, size_bytes, storage_backend, created_at, updated_at, user_id
         FROM ${SCHEMA}.drive_files
         WHERE workspace_id = $1
           AND parent_path = $2
           AND ($3::boolean = true OR user_id = $4 OR user_id IS NULL)
         ORDER BY type DESC, name ASC`,
        [wsId, reqPath, isAdmin, userId]
      );
    } catch (dbErr) {
      if (dbErr.code !== '42703') throw dbErr;
      // Backward compatibility: no user_id column yet -> workspace-level listing
      r = await pool.query(
        `SELECT id, name, path, type, mime_type, size_bytes, storage_backend, created_at, updated_at
         FROM ${SCHEMA}.drive_files
         WHERE workspace_id = $1 AND parent_path = $2
         ORDER BY type DESC, name ASC`,
        [wsId, reqPath]
      );
    }
    const files = r.rows.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.type === 'file' ? Number(f.size_bytes || 0) : undefined,
      modified: (f.updated_at || f.created_at || new Date()).toISOString(),
      mime_type: f.type === 'file' ? (f.mime_type || 'application/octet-stream') : undefined,
      path: f.path,
      storage: f.storage_backend,
    }));
    res.json({ success: true, path: reqPath, files, count: files.length, total: files.length, limit: files.length, skip: 0 });
  } catch (err) {
    console.error('[Drive] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /folders — list folders only ──
router.get('/folders', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const reqPath = normalizePath(req.query.path || '/');
    const r = await pool.query(
      `SELECT id, name, path, updated_at FROM ${SCHEMA}.drive_files
       WHERE workspace_id = $1 AND parent_path = $2 AND type = 'folder'
       ORDER BY name ASC`,
      [wsId, reqPath]
    );
    const folders = r.rows.map(f => ({
      id: f.id, name: f.name, type: 'folder',
      modified: (f.updated_at || new Date()).toISOString(), path: f.path,
    }));
    res.json({ success: true, path: reqPath, folders, count: folders.length });
  } catch (err) {
    console.error('[Drive] Folders error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /folders/tree — recursive folder tree ──
router.get('/folders/tree', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const r = await pool.query(
      `SELECT name, path, parent_path FROM ${SCHEMA}.drive_files
       WHERE workspace_id = $1 AND type = 'folder' ORDER BY path`,
      [wsId]
    );
    const map = {};
    const roots = [];
    for (const f of r.rows) {
      map[f.path] = { name: f.name, path: f.path, children: [] };
    }
    for (const f of r.rows) {
      const node = map[f.path];
      const parentNode = map[f.parent_path];
      if (parentNode) parentNode.children.push(node);
      else roots.push(node);
    }
    res.json({ success: true, tree: roots });
  } catch (err) {
    console.error('[Drive] Tree error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /folders — create folder ──
router.post('/folders', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const parentPath = normalizePath(req.body.path || req.body.parent || '/');
    const name = req.body.name;
    if (!name || typeof name !== 'string' || /[\/\\]/.test(name)) {
      return res.status(400).json({ success: false, error: 'Invalid folder name' });
    }
    const folderPath = normalizePath(path.posix.join(parentPath, name));
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.drive_files (workspace_id, name, path, parent_path, type, storage_backend)
       VALUES ($1, $2, $3, $4, 'folder', 'db')
       ON CONFLICT (workspace_id, path) DO NOTHING
       RETURNING id, name, path, created_at`,
      [wsId, name, folderPath, parentPath]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Folder already exists' });
    }

    res.json({
      success: true,
      folder: { id: r.rows[0].id, name, type: 'folder', path: folderPath, modified: r.rows[0].created_at },
    });
  } catch (err) {
    console.error('[Drive] Create folder error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /upload — upload file → S3 (MinIO) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const destPath = normalizePath(req.body.path || '/');
    const { userId } = getRequestUser(req);
    const fileName = req.file.originalname || `upload-${Date.now()}`;
    const filePath = normalizePath(path.posix.join(destPath, fileName));
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype || 'application/octet-stream';
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // S3 key: {workspace_id}/{user_id|workspace}/{folder}/{filename}
    const s3Key = buildScopedS3Key(wsId, userId, destPath, fileName);

    // Upload to S3 (MinIO)
    await s3.uploadFile(wsId, s3Key, req.file.buffer, mimeType);

    // Insert metadata in PG (no file_data — stored in S3)
    let r;
    try {
      r = await pool.query(
        `INSERT INTO ${SCHEMA}.drive_files (workspace_id, user_id, name, path, parent_path, type, mime_type, size_bytes, storage_backend, s3_key, checksum)
         VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, 's3', $8, $9)
         ON CONFLICT (workspace_id, path) DO UPDATE SET
           user_id = COALESCE(${SCHEMA}.drive_files.user_id, EXCLUDED.user_id),
           size_bytes = EXCLUDED.size_bytes, checksum = EXCLUDED.checksum,
           storage_backend = 's3', s3_key = EXCLUDED.s3_key, file_data = NULL,
           updated_at = NOW()
         RETURNING id`,
        [wsId, userId, fileName, filePath, destPath, mimeType, fileSize, s3Key, checksum]
      );
    } catch (dbErr) {
      if (dbErr.code !== '42703') throw dbErr;
      // Backward compatibility: no user_id column yet
      r = await pool.query(
        `INSERT INTO ${SCHEMA}.drive_files (workspace_id, name, path, parent_path, type, mime_type, size_bytes, storage_backend, s3_key, checksum)
         VALUES ($1, $2, $3, $4, 'file', $5, $6, 's3', $7, $8)
         ON CONFLICT (workspace_id, path) DO UPDATE SET
           size_bytes = EXCLUDED.size_bytes, checksum = EXCLUDED.checksum,
           storage_backend = 's3', s3_key = EXCLUDED.s3_key, file_data = NULL,
           updated_at = NOW()
         RETURNING id`,
        [wsId, fileName, filePath, destPath, mimeType, fileSize, s3Key, checksum]
      );
    }

    console.log(`[Drive] Upload saved workspace=${wsId} user=${userId || DEFAULT_USER_SCOPE} path=${filePath} s3_key=${s3Key}`);

    res.json({
      success: true,
      file: {
        id: r.rows[0].id, name: fileName, type: 'file', size: fileSize,
        mime_type: mimeType, path: filePath, storage: 's3',
        modified: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Drive] Upload error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /download/:id — download file (S3 primary, DB/Synology fallback) ──
router.get('/download/:id', async (req, res) => {
  try {
    // Support token via query param (for direct browser open)
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = 'Bearer ' + req.query.token;
      // Re-run auth
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET || 'MISSING-SET-JWT_SECRET-ENV');
        req.user = decoded;
      } catch(e) { /* ignore, will fail on workspace check */ }
    }
    const wsId = getWorkspaceId(req);
    const { userId, isAdmin } = getRequestUser(req);
    let r;
    try {
      r = await pool.query(
        `SELECT name, mime_type, storage_backend, s3_key, synology_path, file_data, size_bytes, user_id
         FROM ${SCHEMA}.drive_files
         WHERE id = $1 AND workspace_id = $2 AND type = 'file'
           AND ($3::boolean = true OR user_id = $4 OR user_id IS NULL)`,
        [req.params.id, wsId, isAdmin, userId]
      );
    } catch (dbErr) {
      if (dbErr.code !== '42703') throw dbErr;
      // Backward compatibility: no user_id column yet
      r = await pool.query(
        `SELECT name, mime_type, storage_backend, s3_key, synology_path, file_data, size_bytes
         FROM ${SCHEMA}.drive_files WHERE id = $1 AND workspace_id = $2 AND type = 'file'`,
        [req.params.id, wsId]
      );
    }
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });

    const file = r.rows[0];
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    // Detect mime type from extension if stored as octet-stream
    const mimeMap = {
      pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
      gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
      txt:'text/plain', md:'text/plain', json:'application/json',
      js:'text/javascript', ts:'text/javascript', html:'text/html', css:'text/css',
      xml:'text/xml', csv:'text/csv', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const mimeType = (file.mime_type && file.mime_type !== 'application/octet-stream') ? file.mime_type : (mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${file.name}"`);

    // S3 backend
    if (file.storage_backend === 's3' && file.s3_key) {
      try {
        const { buffer } = await s3.downloadFile(wsId, file.s3_key);
        return res.send(buffer);
      } catch (s3Err) {
        console.error('[Drive] S3 download error:', s3Err.message);
        // Fall through to other backends
      }
    }

    // Legacy: DB backend
    if (file.file_data) {
      return res.send(file.file_data);
    }

    // Legacy: Synology backend
    if (file.storage_backend === 'synology' && file.synology_path) {
      const sid = await getSid();
      const url = `/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download&path=${encodeURIComponent(file.synology_path)}&mode=download&_sid=${sid}`;
      const hreq = https.request({
        hostname: SYNO_HOST, port: SYNO_PORT, path: url,
        method: 'GET', rejectUnauthorized: false,
      }, (hres) => { hres.pipe(res); });
      hreq.on('error', e => res.status(500).json({ success: false, error: e.message }));
      return hreq.end();
    }

    res.status(404).json({ success: false, error: 'File data not available' });
  } catch (err) {
    console.error('[Drive] Download error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /files/:id — delete file by ID ──
router.delete('/files/:id', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const r = await pool.query(
      `SELECT path, storage_backend, s3_key, synology_path, type FROM ${SCHEMA}.drive_files WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, wsId]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });
    const row = r.rows[0];
    if (row.storage_backend === 's3' && row.s3_key) {
      await s3.deleteFile(wsId, row.s3_key).catch(e => console.warn('[Drive] S3 delete warn:', e.message));
    }
    if (row.type === 'folder') {
      await pool.query(`DELETE FROM ${SCHEMA}.drive_files WHERE workspace_id = $1 AND (path = $2 OR path LIKE $3)`, [wsId, row.path, row.path + '/%']);
    } else {
      await pool.query(`DELETE FROM ${SCHEMA}.drive_files WHERE id = $1 AND workspace_id = $2`, [req.params.id, wsId]);
    }
    res.json({ success: true, deleted: row.path });
  } catch (err) {
    console.error('[Drive] Delete by ID error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /files — delete file or folder ──
router.delete('/files', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const filePath = normalizePath(req.query.path || req.body?.path);
    if (!filePath || filePath === '/') return res.status(400).json({ success: false, error: 'Cannot delete root' });

    // Get file info for cleanup
    const info = await pool.query(
      `SELECT storage_backend, s3_key, synology_path, type FROM ${SCHEMA}.drive_files WHERE workspace_id = $1 AND path = $2`,
      [wsId, filePath]
    );

    const row = info.rows[0];

    // Delete from S3 if needed
    if (row?.storage_backend === 's3' && row?.s3_key) {
      await s3.deleteFile(wsId, row.s3_key).catch(e => console.warn('[Drive] S3 delete warn:', e.message));
    }

    // Delete from Synology if needed (legacy)
    if (row?.storage_backend === 'synology' && row?.synology_path) {
      const sid = await getSid();
      await synoRequest('/webapi/entry.cgi', {
        api: 'SYNO.FileStation.Delete', version: 2, method: 'delete',
        path: row.synology_path, recursive: 'true', _sid: sid,
      }).catch(e => console.warn('[Drive] Synology delete warn:', e.message));
    }

    // Delete from DB (+ children if folder)
    await pool.query(
      `DELETE FROM ${SCHEMA}.drive_files WHERE workspace_id = $1 AND (path = $2 OR path LIKE $3)`,
      [wsId, filePath, filePath + '/%']
    );

    res.json({ success: true, deleted: filePath });
  } catch (err) {
    console.error('[Drive] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /storage — storage stats ──
router.get('/storage', async (req, res) => {
  try {
    const wsId = getWorkspaceId(req);
    const r = await pool.query(
      `SELECT storage_backend, COUNT(*) as file_count, COALESCE(SUM(size_bytes), 0) as total_bytes
       FROM ${SCHEMA}.drive_files WHERE workspace_id = $1 AND type = 'file'
       GROUP BY storage_backend`,
      [wsId]
    );
    const stats = { db: { files: 0, bytes: 0 }, synology: { files: 0, bytes: 0 }, s3: { files: 0, bytes: 0 } };
    for (const row of r.rows) {
      if (stats[row.storage_backend]) {
        stats[row.storage_backend] = { files: Number(row.file_count), bytes: Number(row.total_bytes) };
      }
    }
    stats.total_bytes = stats.db.bytes + stats.synology.bytes + stats.s3.bytes;
    stats.total_files = stats.db.files + stats.synology.files + stats.s3.files;
    res.json({ success: true, storage: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// ── Move file to another folder ──
router.put('/files/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { folder, path: targetPath } = req.body; // folder = folder name or null for root
    const ws = req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';

    if (folder === undefined && targetPath === undefined) {
      return res.status(400).json({ success: false, error: 'folder or path is required (use null for root)' });
    }

    // Build new path
    const newPath = folder ? '/' + folder.replace(/^\//, '') : '/';

    // Get current file
    const file = await pool.query(
      `SELECT * FROM ${SCHEMA}.drive_files WHERE id = $1 AND workspace_id = $2`,
      [id, ws]
    );
    if (file.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const f = file.rows[0];
    const oldFullPath = f.path;
    const fileName = f.name;
    const newFullPath = newPath === '/' ? '/' + fileName : newPath + '/' + fileName;

    // If S3, move the object
    if (f.storage === 's3' && f.s3_key) {
      const { S3Client, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT || 'https://s3.vaultbrix.com',
        region: 'us-east-1',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET || process.env.AWS_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
      });
      const bucket = process.env.S3_BUCKET || 'vutler-drive';
      const oldKey = f.s3_key;
      const newKey = oldKey.replace(oldFullPath.slice(1), newFullPath.slice(1));

      // Copy then delete
      await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: bucket + '/' + oldKey,
        Key: newKey,
      }));
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));

      // Update DB
      await pool.query(
        `UPDATE ${SCHEMA}.drive_files SET path = $1, s3_key = $2, updated_at = NOW() WHERE id = $3`,
        [newFullPath, newKey, id]
      );
    } else {
      // DB storage — just update path
      await pool.query(
        `UPDATE ${SCHEMA}.drive_files SET path = $1, updated_at = NOW() WHERE id = $2`,
        [newFullPath, id]
      );
    }

    console.log('[Drive] File moved:', fileName, oldFullPath, '->', newFullPath);
    res.json({ success: true, data: { id, name: fileName, oldPath: oldFullPath, newPath: newFullPath } });
  } catch (err) {
    console.error('[Drive] Move error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
