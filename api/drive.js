'use strict';

/**
 * Drive API — S3-backed file storage (migrated from filesystem, audit 2026-03-29)
 *
 * All operations are scoped per-workspace via S3 bucket isolation.
 * Bucket naming: vutler-drive-{workspace_id}
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const s3 = require('../services/s3Storage');
const driveIndex = require('../services/drive-index');

// SECURITY: workspace from JWT only (audit 2026-03-29)
router.use((req, res, next) => {
  if (!req.workspaceId) return res.status(401).json({ success: false, error: 'Authentication required' });
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.DRIVE_MAX_FILE_SIZE || 52_428_800) },
});

/**
 * Sanitize a key to prevent path traversal.
 * Returns a clean key without leading slashes or .. components.
 */
function sanitizeKey(input) {
  const normalized = path.posix.normalize(String(input || '')).replace(/\\/g, '/');
  // Remove any .. traversal and leading slashes
  const segments = normalized.split('/').filter(s => s && s !== '..' && s !== '.');
  return segments.join('/');
}

function hashId(key) {
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 24);
}

// ── GET /files — list files ──────────────────────────────────────────────────

router.get('/files', async (req, res) => {
  try {
    const prefix = sanitizeKey(req.query.path || '');
    const objects = await s3.listFiles(req.workspaceId, prefix);

    const files = objects.map(obj => {
      const name = obj.key.split('/').pop();
      const isFolder = obj.key.endsWith('/');
      return {
        id: hashId(obj.key),
        name,
        type: isFolder ? 'folder' : 'file',
        size: isFolder ? undefined : obj.size,
        modified: obj.lastModified ? new Date(obj.lastModified).toISOString() : undefined,
        mime_type: isFolder ? undefined : 'application/octet-stream',
        path: `/${obj.key}`,
      };
    });

    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    try {
      await driveIndex.onListTouch(req, `/${prefix}`, files);
    } catch (e) {
      console.warn('[DRIVE][DB] list_touch sync skipped:', e.message);
    }

    return res.json({
      success: true,
      path: `/${prefix}`,
      files,
      count: files.length,
      total: files.length,
      limit: files.length,
      skip: 0,
    });
  } catch (err) {
    console.error('[DRIVE] List error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

// ── POST /upload — upload a file ──────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const dirPrefix = sanitizeKey(req.body.path || '');
    const fileName = req.file.originalname || `upload-${Date.now()}`;
    const key = dirPrefix ? `${dirPrefix}/${fileName}` : fileName;

    await s3.uploadFile(req.workspaceId, key, req.file.buffer, req.file.mimetype || 'application/octet-stream');

    const file = {
      id: hashId(key),
      name: fileName,
      type: 'file',
      size: req.file.size,
      modified: new Date().toISOString(),
      mime_type: req.file.mimetype || 'application/octet-stream',
      path: `/${key}`,
    };

    try {
      await driveIndex.onUpload(req, file);
    } catch (e) {
      console.warn('[DRIVE][DB] upload sync skipped:', e.message);
    }

    return res.json({ success: true, file });
  } catch (err) {
    console.error('[DRIVE] Upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
});

// ── POST /folders — create a folder (virtual prefix in S3) ──────────────────

router.post('/folders', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(400).json({ success: false, error: 'Invalid folder name' });
    }

    const parentPrefix = sanitizeKey(req.body?.path || '');
    const folderKey = parentPrefix ? `${parentPrefix}/${name}/` : `${name}/`;

    // Create a zero-byte object with trailing slash to represent the folder
    await s3.uploadFile(req.workspaceId, folderKey, Buffer.alloc(0), 'application/x-directory');

    try {
      await driveIndex.onCreateFolder(req, `/${folderKey}`);
    } catch (e) {
      console.warn('[DRIVE][DB] folder sync skipped:', e.message);
    }

    return res.json({
      success: true,
      folder: { name, path: `/${folderKey}` },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

// ── GET /storage — storage stats ──────────────────────────────────────────────

router.get('/storage', async (req, res) => {
  try {
    const objects = await s3.listFiles(req.workspaceId, '');
    const totalBytes = objects.reduce((sum, obj) => sum + (obj.size || 0), 0);
    return res.json({ success: true, storage: { total_bytes: totalBytes } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to get storage stats' });
  }
});

// ── POST /move — move/rename a file ───────────────────────────────────────────

router.post('/move', async (req, res) => {
  try {
    const fromKey = sanitizeKey(req.body?.fromPath || '');
    const toDir = sanitizeKey(req.body?.toPath || '');
    if (!fromKey) return res.status(400).json({ success: false, error: 'Invalid source path' });

    const fileName = fromKey.split('/').pop();
    const newKey = toDir ? `${toDir}/${fileName}` : fileName;

    // Download from old location, upload to new, delete old
    const { buffer, contentType } = await s3.downloadFile(req.workspaceId, fromKey);
    await s3.uploadFile(req.workspaceId, newKey, buffer, contentType);
    await s3.deleteFile(req.workspaceId, fromKey);

    try {
      await driveIndex.onMove(req, `/${fromKey}`, `/${newKey}`);
    } catch (e) {
      console.warn('[DRIVE][DB] move sync skipped:', e.message);
    }

    return res.json({ success: true, moved: { from: `/${fromKey}`, to: `/${newKey}` } });
  } catch (err) {
    console.error('[DRIVE] Move error:', err.message);
    return res.status(err.name === 'NoSuchKey' ? 404 : 500).json({ success: false, error: 'Failed to move file' });
  }
});

// ── POST /delete — delete a file or folder ────────────────────────────────────

router.post('/delete', async (req, res) => {
  try {
    const key = sanitizeKey(req.body?.path || '');
    if (!key) return res.status(400).json({ success: false, error: 'Invalid target path' });

    await s3.deleteFile(req.workspaceId, key);

    try {
      await driveIndex.onDelete(req, `/${key}`);
    } catch (e) {
      console.warn('[DRIVE][DB] delete sync skipped:', e.message);
    }

    return res.json({ success: true, deleted: { path: `/${key}` } });
  } catch (err) {
    return res.status(err.name === 'NoSuchKey' ? 404 : 500).json({ success: false, error: 'Failed to delete file' });
  }
});

// ── GET /search — search files via drive index ────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: 'Missing query parameter: q' });

    const pathPrefix = sanitizeKey(req.query.path || '');
    const includeContent = String(req.query.includeContent || 'false').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    const results = await driveIndex.search(req, { q, pathPrefix: `/${pathPrefix}`, limit, includeContent });

    return res.json({
      success: true,
      q,
      path: `/${pathPrefix}`,
      includeContent,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[DRIVE] Search error:', err.message);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ── GET /preview/:id — preview file content ──────────────────────────────────

router.get('/preview/:id', async (req, res) => {
  try {
    const prefix = sanitizeKey(req.query.path || '');
    const objects = await s3.listFiles(req.workspaceId, prefix);

    const match = objects.find(obj => hashId(obj.key) === req.params.id);
    if (!match) return res.status(404).json({ success: false, error: 'File not found' });

    const ext = path.extname(match.key).toLowerCase();
    const fileName = match.key.split('/').pop();
    const binaryMimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(ext)) {
      return res.json({
        success: true,
        type: 'binary',
        url: `/api/v1/drive/download/${req.params.id}`,
        name: fileName,
        path: `/${match.key}`,
        mimeType: binaryMimeTypes[ext] || 'application/octet-stream',
        modified: match.lastModified ? new Date(match.lastModified).toISOString() : undefined,
      });
    }

    // Text preview — download and return content
    const { buffer } = await s3.downloadFile(req.workspaceId, match.key);
    const content = buffer.toString('utf8').slice(0, 250000);
    return res.json({
      success: true,
      type: 'text',
      name: fileName,
      path: `/${match.key}`,
      mimeType: 'text/plain; charset=utf-8',
      modified: match.lastModified ? new Date(match.lastModified).toISOString() : undefined,
      content,
    });
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

// ── GET /download/:id — download file ────────────────────────────────────────

router.get('/download/:id', async (req, res) => {
  try {
    const prefix = sanitizeKey(req.query.path || '');
    const objects = await s3.listFiles(req.workspaceId, prefix);

    // Find by hash ID across all objects if prefix match fails
    let match = objects.find(obj => hashId(obj.key) === req.params.id);

    // If not found in prefix, try listing all
    if (!match) {
      const allObjects = await s3.listFiles(req.workspaceId, '');
      match = allObjects.find(obj => hashId(obj.key) === req.params.id);
    }

    if (!match) return res.status(404).json({ success: false, error: 'File not found' });

    const { buffer, contentType } = await s3.downloadFile(req.workspaceId, match.key);
    const fileName = match.key.split('/').pop();

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

module.exports = router;
