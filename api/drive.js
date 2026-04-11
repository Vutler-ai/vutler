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
const { isOfficeDocumentPath, extractOfficeTextFromBuffer } = require('../services/officeDocumentService');

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

function getBaseName(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .pop();
}

function getFileExtension(name) {
  const baseName = String(name || '').trim();
  const lastDot = baseName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === baseName.length - 1) return '';
  return baseName.slice(lastDot + 1).toLowerCase();
}

function guessMimeType(name) {
  const ext = getFileExtension(name);
  const mimeByExt = {
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    json: 'application/json',
    md: 'text/markdown',
    pdf: 'application/pdf',
    png: 'image/png',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
  };

  return mimeByExt[ext] || 'application/octet-stream';
}

function parseCreatedAt(metadata = {}, fallback) {
  const raw = metadata.created_at || metadata.createdat || metadata['created-at'];
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

async function copyObject(workspaceId, fromKey, toKey) {
  const { buffer, contentType } = await s3.downloadFile(workspaceId, fromKey);
  const head = await s3.headFile(workspaceId, fromKey).catch(() => null);
  await s3.uploadFile(workspaceId, toKey, buffer, contentType, head?.metadata || undefined);
}

function isLikelyTextMimeType(mimeType = '', key = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.startsWith('text/')) return true;
  if (normalized.includes('json') || normalized.includes('xml') || normalized.includes('yaml')) return true;
  const ext = path.extname(String(key || '')).toLowerCase();
  return ['.md', '.txt', '.json', '.csv', '.log', '.yaml', '.yml', '.xml'].includes(ext);
}

function buildSnippet(content, query) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const needle = String(query || '').toLowerCase();
  const lowered = text.toLowerCase();
  const index = lowered.indexOf(needle);
  if (index === -1) return text.slice(0, 220);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + needle.length + 140);
  return text.slice(start, end);
}

function buildOfficePreviewError(fileName, err) {
  const detail = err?.message ? ` ${err.message}` : '';
  return `Preview is unavailable for "${fileName}" because the office document could not be converted to text.${detail} Install LibreOffice on the server, or upload a PDF/TXT companion for agent-friendly reading.`;
}

function scoreSearchCandidate({ key, query, content }) {
  const q = String(query || '').toLowerCase();
  const fileName = getBaseName(key).toLowerCase();
  const filePath = String(key || '').toLowerCase();
  const body = String(content || '').toLowerCase();
  let score = 0;
  if (fileName === q) score += 120;
  if (fileName.includes(q)) score += 80;
  if (filePath.includes(q)) score += 40;
  if (body.includes(q)) score += 20;
  return score;
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => String(cell || '').trim());
}

function parseCsvDocument(buffer, fileName) {
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const delimiter = path.extname(fileName).toLowerCase() === '.tsv' ? '\t' : ',';
  const headers = lines.length > 0 ? parseCsvLine(lines[0], delimiter) : [];
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header || `column_${index + 1}`] = values[index] ?? '';
    });
    return row;
  });

  return {
    type: 'csv',
    tables: [{
      name: 'Sheet1',
      headers,
      rows,
      rowCount: rows.length,
    }],
    metadata: {
      sheets: 1,
      totalRows: rows.length,
    },
  };
}

function parseStructuredDocument(buffer, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const tables = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { name, headers, rows, rowCount: rows.length };
    });

    return {
      type: 'xlsx',
      tables,
      metadata: {
        sheets: tables.length,
        totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
      },
    };
  }

  if (ext === '.csv' || ext === '.tsv') {
    return parseCsvDocument(buffer, fileName);
  }

  if (ext === '.json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const headers = rows.length > 0 && rows[0] && typeof rows[0] === 'object'
      ? Object.keys(rows[0])
      : [];
    return {
      type: 'json',
      tables: [{
        name: 'data',
        headers,
        rows,
        rowCount: rows.length,
      }],
      metadata: {
        sheets: 1,
        totalRows: rows.length,
      },
    };
  }

  if (isOfficeDocumentPath(fileName)) {
    throw new Error(`Structured parsing is not supported for ${ext} without office conversion`);
  }

  throw new Error(`Structured parsing is not supported for ${ext || 'this file type'}`);
}

async function searchDriveFallback(workspaceId, { q, pathPrefix, limit, includeContent }) {
  const cleanPrefix = sanitizeKey(pathPrefix || '');
  const objects = await s3.listFiles(workspaceId, cleanPrefix);
  const needle = String(q || '').trim().toLowerCase();
  const directMatches = [];
  const textCandidates = [];

  for (const object of objects) {
    if (!object?.key || object.key.endsWith('/')) continue;
    const fileName = getBaseName(object.key).toLowerCase();
    const fullPath = `/${object.key}`;
    const direct = fileName.includes(needle) || object.key.toLowerCase().includes(needle);

    if (direct) {
      directMatches.push({
        id: hashId(object.key),
        name: getBaseName(object.key),
        path: fullPath,
        type: 'file',
        size: object.size,
        modified: object.lastModified ? new Date(object.lastModified).toISOString() : undefined,
        mime_type: guessMimeType(fileName),
        score: scoreSearchCandidate({ key: object.key, query: needle }),
      });
      continue;
    }

    if (includeContent || textCandidates.length < Math.max(limit * 2, 20)) {
      textCandidates.push(object);
    }
  }

  const contentMatches = [];
  for (const object of textCandidates) {
    if (directMatches.length + contentMatches.length >= Math.max(limit * 2, 20)) break;
    const head = await s3.headFile(workspaceId, object.key).catch(() => null);
    const mimeType = head?.contentType || guessMimeType(object.key);
    if (!isLikelyTextMimeType(mimeType, object.key)) continue;
    const { buffer } = await s3.downloadFile(workspaceId, object.key).catch(() => ({ buffer: null }));
    if (!buffer) continue;
    const content = buffer.toString('utf8').slice(0, 250000);
    if (!content.toLowerCase().includes(needle)) continue;

    contentMatches.push({
      id: hashId(object.key),
      name: getBaseName(object.key),
      path: `/${object.key}`,
      type: 'file',
      size: object.size,
      modified: object.lastModified ? new Date(object.lastModified).toISOString() : undefined,
      mime_type: mimeType,
      score: scoreSearchCandidate({ key: object.key, query: needle, content }),
      snippet: buildSnippet(content, needle),
      content: includeContent ? content : undefined,
    });
  }

  return [...directMatches, ...contentMatches]
    .sort((left, right) => right.score - left.score || String(left.path).localeCompare(String(right.path)))
    .slice(0, limit);
}

// ── GET /files — list files ──────────────────────────────────────────────────

router.get('/files', async (req, res) => {
  try {
    const prefix = sanitizeKey(req.query.path || '');
    const entries = await s3.listEntries(req.workspaceId, prefix);

    const files = await Promise.all(entries.map(async (entry) => {
      const name = getBaseName(entry.key);
      const fallbackModified = entry.lastModified ? new Date(entry.lastModified).toISOString() : undefined;
      const head = await s3.headFile(req.workspaceId, entry.key).catch(() => null);
      const modified = head?.lastModified ? new Date(head.lastModified).toISOString() : fallbackModified;
      const created = parseCreatedAt(head?.metadata, modified);

      return {
        id: hashId(entry.key),
        name,
        type: entry.isFolder ? 'folder' : 'file',
        size: entry.isFolder ? undefined : entry.size,
        created,
        modified,
        mime_type: entry.isFolder ? 'application/x-directory' : (head?.contentType || guessMimeType(name)),
        path: `/${entry.key}`,
      };
    }));

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
    const createdAt = new Date().toISOString();

    await s3.uploadFile(
      req.workspaceId,
      key,
      req.file.buffer,
      req.file.mimetype || 'application/octet-stream',
      { created_at: createdAt }
    );

    const file = {
      id: hashId(key),
      name: fileName,
      type: 'file',
      size: req.file.size,
      created: createdAt,
      modified: createdAt,
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
    const createdAt = new Date().toISOString();

    // Create a zero-byte object with trailing slash to represent the folder
    await s3.uploadFile(
      req.workspaceId,
      folderKey,
      Buffer.alloc(0),
      'application/x-directory',
      { created_at: createdAt }
    );

    try {
      await driveIndex.onCreateFolder(req, `/${folderKey}`);
    } catch (e) {
      console.warn('[DRIVE][DB] folder sync skipped:', e.message);
    }

    return res.json({
      success: true,
      folder: {
        id: hashId(folderKey),
        name,
        type: 'folder',
        created: createdAt,
        modified: createdAt,
        mime_type: 'application/x-directory',
        path: `/${folderKey}`,
      },
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

// ── POST /move — move/rename a file or folder ─────────────────────────────────

router.post('/move', async (req, res) => {
  try {
    const fromKey = sanitizeKey(req.body?.fromPath || '');
    const toDir = sanitizeKey(req.body?.toPath || '');
    const requestedName = String(req.body?.newName || '').trim();
    if (!fromKey) return res.status(400).json({ success: false, error: 'Invalid source path' });

    let newKey;
    if (fromKey.endsWith('/')) {
      const sourceFolderName = getBaseName(fromKey.slice(0, -1));
      const folderName = requestedName || sourceFolderName;
      if (!folderName || folderName.includes('/') || folderName.includes('\\') || folderName.includes('..')) {
        return res.status(400).json({ success: false, error: 'Invalid destination name' });
      }

      newKey = toDir ? `${toDir}/${folderName}/` : `${folderName}/`;
      if (newKey === fromKey) {
        return res.json({ success: true, moved: { from: `/${fromKey}`, to: `/${newKey}` } });
      }
      if (newKey.startsWith(fromKey)) {
        return res.status(400).json({ success: false, error: 'Cannot move a folder inside itself' });
      }

      const sourceEntries = await s3.listFiles(req.workspaceId, fromKey);
      if (sourceEntries.length === 0) {
        await s3.uploadFile(req.workspaceId, newKey, Buffer.alloc(0), 'application/x-directory');
        await s3.deleteFile(req.workspaceId, fromKey).catch(() => {});
      } else {
        for (const entry of sourceEntries) {
          const relativeKey = entry.key.slice(fromKey.length);
          const destinationKey = `${newKey}${relativeKey}`;
          await copyObject(req.workspaceId, entry.key, destinationKey);
        }
        for (const entry of sourceEntries) {
          await s3.deleteFile(req.workspaceId, entry.key);
        }
        await s3.deleteFile(req.workspaceId, fromKey).catch(() => {});
      }
    } else {
      const fileName = requestedName || fromKey.split('/').pop();
      if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return res.status(400).json({ success: false, error: 'Invalid destination name' });
      }
      newKey = toDir ? `${toDir}/${fileName}` : fileName;
      if (newKey === fromKey) {
        return res.json({ success: true, moved: { from: `/${fromKey}`, to: `/${newKey}` } });
      }

      await copyObject(req.workspaceId, fromKey, newKey);
      await s3.deleteFile(req.workspaceId, fromKey);
    }

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

    if (key.endsWith('/')) {
      const nested = await s3.listFiles(req.workspaceId, key);
      await Promise.all(nested.map((entry) => s3.deleteFile(req.workspaceId, entry.key)));
      await s3.deleteFile(req.workspaceId, key).catch(() => {});
    } else {
      await s3.deleteFile(req.workspaceId, key);
    }

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

    let results = await driveIndex.search(req, { q, pathPrefix: `/${pathPrefix}`, limit, includeContent });
    if (!Array.isArray(results) || results.length === 0) {
      results = await searchDriveFallback(req.workspaceId, { q, pathPrefix, limit, includeContent });
    }

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

    const { buffer } = await s3.downloadFile(req.workspaceId, match.key);

    if (isOfficeDocumentPath(fileName)) {
      try {
        const extracted = await extractOfficeTextFromBuffer({ fileName, buffer });
        return res.json({
          success: true,
          type: 'text',
          name: fileName,
          path: `/${match.key}`,
          mimeType: 'text/plain; charset=utf-8',
          modified: match.lastModified ? new Date(match.lastModified).toISOString() : undefined,
          content: extracted.text.slice(0, 250000),
          derived: true,
          derivation: extracted.metadata || {},
        });
      } catch (err) {
        return res.status(415).json({
          success: false,
          error: buildOfficePreviewError(fileName, err),
        });
      }
    }

    // Text preview — download and return content
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

// ── GET /parsed/:id — parse structured spreadsheet/text content ──────────────

router.get('/parsed/:id', async (req, res) => {
  try {
    const prefix = sanitizeKey(req.query.path || '');
    const objects = await s3.listFiles(req.workspaceId, prefix);
    const match = objects.find((obj) => hashId(obj.key) === req.params.id);
    if (!match) return res.status(404).json({ success: false, error: 'File not found' });

    const { buffer } = await s3.downloadFile(req.workspaceId, match.key);
    if (isOfficeDocumentPath(match.key)) {
      try {
        const extracted = await extractOfficeTextFromBuffer({
          fileName: getBaseName(match.key),
          buffer,
        });

        return res.json({
          success: true,
          name: getBaseName(match.key),
          path: `/${match.key}`,
          parsed: {
            type: 'office_text',
            text: extracted.text,
            metadata: extracted.metadata || {},
          },
        });
      } catch (err) {
        return res.status(415).json({ success: false, error: buildOfficePreviewError(getBaseName(match.key), err) });
      }
    }

    const parsed = parseStructuredDocument(buffer, match.key);

    return res.json({
      success: true,
      name: getBaseName(match.key),
      path: `/${match.key}`,
      parsed,
    });
  } catch (err) {
    const status = /not supported|invalid|unexpected token/i.test(err.message) ? 400 : 404;
    return res.status(status).json({ success: false, error: err.message || 'Failed to parse file' });
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
