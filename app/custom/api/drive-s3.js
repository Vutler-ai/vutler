'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const s3 = require('../services/s3Driver');

const upload_mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Helper: get workspace bucket
async function _getWorkspaceBucket(req) {
  const pool = req.app.locals.pg;
  const wsId = req.user?.workspace_id || '00000000-0000-0000-0000-000000000001';
  const result = await pool.query(
    'SELECT storage_bucket, slug FROM tenant_vutler.workspaces WHERE id = $1',
    [wsId]
  );
  if (result.rows.length === 0) throw new Error('Workspace not found');
  const ws = result.rows[0];
  const bucket = ws.storage_bucket || s3.getBucketName(ws.slug || 'default');
  await s3.ensureBucket(bucket);
  return { bucket, wsId };
}

// GET /drive/files — list files (from PG metadata)
router.get('/files', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { bucket, wsId } = await _getWorkspaceBucket(req);
    const parentPath = req.query.path || '/';

    const result = await pool.query(
      `SELECT id, name, path, parent_path, type, mime_type, size_bytes, 
              storage_backend, created_at, updated_at, uploaded_by
       FROM tenant_vutler.drive_files 
       WHERE workspace_id = $1 AND parent_path = $2
       ORDER BY type DESC, name ASC`,
      [wsId, parentPath]
    );

    res.json({ success: true, data: result.rows, bucket });
  } catch (err) {
    console.error('[DriveAPI] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /drive/upload — upload file to S3
router.post('/upload', upload_mw.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const pool = req.app.locals.pg;
    const { bucket, wsId } = await _getWorkspaceBucket(req);
    const parentPath = req.body.path || '/';
    const fileName = req.file.originalname;
    const filePath = parentPath === '/' ? `/${fileName}` : `${parentPath}/${fileName}`;
    const s3Key = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fileId = uuidv4();

    // Upload to S3
    await s3.upload(bucket, s3Key, req.file.buffer, req.file.mimetype);

    // Save metadata to PG (no file_data blob)
    await pool.query(
      `INSERT INTO tenant_vutler.drive_files 
       (id, workspace_id, name, path, parent_path, type, mime_type, size_bytes, storage_backend, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, 's3', $8, NOW(), NOW())
       ON CONFLICT (workspace_id, path) DO UPDATE SET
         size_bytes = EXCLUDED.size_bytes, mime_type = EXCLUDED.mime_type,
         storage_backend = 's3', updated_at = NOW()`,
      [fileId, wsId, fileName, filePath, parentPath, req.file.mimetype, req.file.size, req.user?.id || 'system']
    );

    console.log(`[DriveAPI] Uploaded: ${filePath} → s3://${bucket}/${s3Key}`);
    res.json({ success: true, data: { id: fileId, name: fileName, path: filePath, size: req.file.size, storage: 's3' } });
  } catch (err) {
    console.error('[DriveAPI] Upload error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /drive/download/:id — download from S3
router.get('/download/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { bucket } = await _getWorkspaceBucket(req);

    const result = await pool.query(
      'SELECT name, path, mime_type, storage_backend, file_data FROM tenant_vutler.drive_files WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });

    const file = result.rows[0];

    if (file.storage_backend === 's3') {
      const s3Key = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      const resp = await s3.download(bucket, s3Key);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      resp.Body.pipe(res);
    } else {
      // Legacy: serve from DB blob
      if (!file.file_data) return res.status(404).json({ success: false, error: 'No file data' });
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      res.send(file.file_data);
    }
  } catch (err) {
    console.error('[DriveAPI] Download error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /drive/files/:id — delete from S3 + PG
router.delete('/files/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { bucket } = await _getWorkspaceBucket(req);

    const result = await pool.query(
      'SELECT path, storage_backend, type FROM tenant_vutler.drive_files WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });

    const file = result.rows[0];

    // Delete from S3 if applicable
    if (file.storage_backend === 's3' && file.type !== 'folder') {
      const s3Key = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      try { await s3.remove(bucket, s3Key); } catch (e) { console.warn('[DriveAPI] S3 delete warn:', e.message); }
    }

    // Delete from PG
    await pool.query('DELETE FROM tenant_vutler.drive_files WHERE id = $1', [req.params.id]);

    console.log(`[DriveAPI] Deleted: ${file.path}`);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    console.error('[DriveAPI] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /drive/folders — create folder (PG metadata only)
router.post('/folders', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { wsId } = await _getWorkspaceBucket(req);
    const { name, path: parentPath } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Folder name required' });

    const folderPath = (parentPath || '/') === '/' ? `/${name}` : `${parentPath}/${name}`;
    const folderId = uuidv4();

    await pool.query(
      `INSERT INTO tenant_vutler.drive_files 
       (id, workspace_id, name, path, parent_path, type, size_bytes, storage_backend, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'folder', 0, 's3', $6, NOW(), NOW())
       ON CONFLICT (workspace_id, path) DO NOTHING`,
      [folderId, wsId, name, folderPath, parentPath || '/', req.user?.id || 'system']
    );

    res.json({ success: true, data: { id: folderId, name, path: folderPath, type: 'folder' } });
  } catch (err) {
    console.error('[DriveAPI] Create folder error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /drive/presign/:id — get presigned download URL
router.post('/presign/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { bucket } = await _getWorkspaceBucket(req);

    const result = await pool.query('SELECT path, name FROM tenant_vutler.drive_files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });

    const s3Key = result.rows[0].path.startsWith('/') ? result.rows[0].path.slice(1) : result.rows[0].path;
    const url = await s3.getPresignedDownloadUrl(bucket, s3Key, req.body.expiresIn || 3600);

    res.json({ success: true, data: { url, expiresIn: req.body.expiresIn || 3600 } });
  } catch (err) {
    console.error('[DriveAPI] Presign error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /drive/move — move/rename file
router.post('/move', async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const { bucket } = await _getWorkspaceBucket(req);
    const { fileId, newPath, newName } = req.body;

    const result = await pool.query('SELECT path, name, storage_backend FROM tenant_vutler.drive_files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'File not found' });

    const file = result.rows[0];
    const finalName = newName || file.name;
    const finalPath = newPath ? `${newPath}/${finalName}` : file.path;

    if (file.storage_backend === 's3') {
      const oldKey = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      const newKey = finalPath.startsWith('/') ? finalPath.slice(1) : finalPath;
      if (oldKey !== newKey) await s3.move(bucket, oldKey, newKey);
    }

    await pool.query(
      'UPDATE tenant_vutler.drive_files SET name = $1, path = $2, parent_path = $3, updated_at = NOW() WHERE id = $4',
      [finalName, finalPath, newPath || '/', fileId]
    );

    res.json({ success: true, data: { id: fileId, name: finalName, path: finalPath } });
  } catch (err) {
    console.error('[DriveAPI] Move error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
