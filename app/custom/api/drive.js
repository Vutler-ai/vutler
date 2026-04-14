'use strict';

/**
 * Drive API - S3-backed file storage
 * Replaces filesystem-backed storage with MinIO S3
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticateAgent } = require('../lib/auth');
const { requireCorePermission } = require('../lib/core-permissions');
const { pool } = require('../lib/postgres');
const s3Driver = require('../services/s3Driver');
const { findAssignedAgentForPath } = require('../../../services/agentDriveService');
const { notifyAgentAboutDriveFile } = require('../../../services/agentDriveNotifications');

const router = express.Router();

const maxFileSize = parseInt(process.env.VUTLER_DRIVE_MAX_SIZE || '104857600', 10); // 100MB default

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize }
});

// Helper functions
function sendDriveError(res, status, code, message, details = {}, action = 'Review request and retry') {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
      action
    }
  });
}

function sendDriveSuccess(res, payload = {}, status = 200) {
  return res.status(status).json({
    success: true,
    ...payload
  });
}

function normalizeVirtualPath(inputPath = '/') {
  if (typeof inputPath !== 'string') {
    throw new Error('Path must be a string');
  }
  if (inputPath.includes('\0')) {
    throw new Error('Invalid path');
  }
  const normalized = path.posix.normalize(inputPath.replace(/\\/g, '/'));
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash === '/.' ? '/' : withLeadingSlash;
}

function safeFileName(fileName = '') {
  const base = path.basename(fileName).replace(/[\r\n]/g, '').trim();
  return base || `upload-${Date.now()}`;
}

function generateFileId() {
  return crypto.randomUUID();
}

function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') return value || null;
  const normalized = value.trim();
  return normalized || null;
}

function workspaceIdOf(req) {
  const candidates = [
    req.workspaceId,
    req.user?.workspaceId,
    req.user?.workspace_id,
    req.agent?.workspaceId,
    req.agent?.workspace_id,
  ];
  for (const candidate of candidates) {
    const value = normalizeWorkspaceId(candidate);
    if (value) return value;
  }
  return null;
}

function actorIdOf(req) {
  return req.userId || req.user?.id || req.agent?.id || null;
}

function actorNameOf(req) {
  return req.user?.name || req.agent?.name || req.user?.email || req.agent?.email || 'User';
}

/**
 * Get storage bucket for workspace
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<string>} - Bucket name
 */
async function getWorkspaceBucket(workspaceId) {
  try {
    const result = await pool.query(
      'SELECT slug, storage_bucket FROM tenant_vutler.workspaces WHERE id = $1',
      [workspaceId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Workspace not found');
    }
    
    const workspace = result.rows[0];
    
    // If storage_bucket is set, use it
    if (workspace.storage_bucket) {
      return workspace.storage_bucket;
    }
    
    // Otherwise generate from slug and update
    const bucketName = s3Driver.getBucketName(workspace.slug);
    await pool.query(
      'UPDATE tenant_vutler.workspaces SET storage_bucket = $1 WHERE id = $2',
      [bucketName, workspaceId]
    );
    
    // Create bucket in S3
    await s3Driver.createBucket(workspace.slug);
    
    return bucketName;
  } catch (err) {
    console.error('[DriveAPI] Failed to get workspace bucket:', err.message);
    throw err;
  }
}

/**
 * Generate S3 key from virtual path and filename
 */
function generateS3Key(virtualPath, fileName) {
  const normalized = normalizeVirtualPath(virtualPath);
  if (normalized === '/') {
    return fileName;
  }
  return `${normalized.slice(1)}/${fileName}`;
}

/**
 * GET /api/v1/drive/files?path=/
 * List files from database metadata (with S3 fallback for migration)
 */
router.get('/drive/files', authenticateAgent, requireCorePermission('drive.list'), async (req, res) => {
  try {
    const { path: requestedPath = '/', limit = 500, skip = 0 } = req.query;
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 500, 2000));
    const parsedSkip = Math.max(0, parseInt(skip, 10) || 0);
    const workspaceId = workspaceIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required', {}, 'Authenticate with a workspace-scoped session or API key');
    }
    
    const normalized = normalizeVirtualPath(requestedPath);
    const folderPath = normalized === '/' ? '' : normalized.slice(1);
    
    // Query files from database
    const result = await pool.query(
      `SELECT id, name, path, mime_type, size_bytes, s3_key, uploaded_by, created_at, updated_at
       FROM tenant_vutler.drive_files 
       WHERE workspace_id = $1 
       AND parent_path = $2
       AND is_deleted = false
       ORDER BY type DESC, name ASC
       LIMIT $3 OFFSET $4`,
      [workspaceId, normalized, parsedLimit, parsedSkip]
    );
    
    const files = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.mime_type === 'inode/directory' ? 'folder' : 'file',
      isDirectory: row.mime_type === 'inode/directory',
      mimeType: row.mime_type,
      size: parseInt(row.size_bytes, 10) || 0,
      path: row.path,
      parentPath: normalized,
      uploadedAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
      s3Key: row.s3_key
    }));
    
    return sendDriveSuccess(res, {
      path: normalized,
      root: '/',
      files,
      count: files.length,
      limit: parsedLimit,
      skip: parsedSkip
    });
  } catch (error) {
    console.error('[DriveAPI] List error:', error);
    return sendDriveError(res, 500, 'DRIVE_LIST_FAILED', 'Failed to list files', { reason: error.message });
  }
});

/**
 * GET /api/v1/drive/folders?path=/
 * List only folders for folder picker UI
 */
router.get('/drive/folders', authenticateAgent, requireCorePermission('drive.list'), async (req, res) => {
  try {
    const requestedPath = req.query.path || '/';
    const workspaceId = workspaceIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required', {}, 'Authenticate with a workspace-scoped session or API key');
    }
    
    const normalized = normalizeVirtualPath(requestedPath);
    
    // Query folders from database
    const result = await pool.query(
      `SELECT id, name, path, created_at
       FROM tenant_vutler.drive_files 
       WHERE workspace_id = $1 
       AND parent_path = $2
       AND mime_type = 'inode/directory'
       AND is_deleted = false
       ORDER BY name ASC`,
      [workspaceId, normalized]
    );
    
    const folders = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.path,
      parentPath: normalized,
      type: 'folder',
      createdAt: row.created_at?.toISOString()
    }));
    
    return sendDriveSuccess(res, {
      path: normalized,
      folders,
      count: folders.length
    });
  } catch (error) {
    console.error('[DriveAPI] Folders list error:', error);
    return sendDriveError(res, 500, 'DRIVE_FOLDERS_LIST_FAILED', 'Failed to list folders', { reason: error.message });
  }
});

/**
 * GET /api/v1/drive/folders/tree?path=/&maxDepth=6
 * Build folder tree structure
 */
router.get('/drive/folders/tree', authenticateAgent, requireCorePermission('drive.list'), async (req, res) => {
  try {
    const requestedPath = req.query.path || '/';
    const maxDepth = Math.max(1, Math.min(parseInt(req.query.maxDepth, 10) || 6, 10));
    const workspaceId = workspaceIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    const normalized = normalizeVirtualPath(requestedPath);
    
    // Recursive function to build tree from database
    async function buildTree(currentPath, depth) {
      const result = await pool.query(
        `SELECT id, name, path
         FROM tenant_vutler.drive_files 
         WHERE workspace_id = $1 
         AND parent_path = $2
         AND mime_type = 'inode/directory'
         AND is_deleted = false
         ORDER BY name ASC`,
        [workspaceId, currentPath]
      );
      
      const children = [];
      for (const row of result.rows) {
        const node = {
          id: row.id,
          name: row.name,
          path: row.path,
          type: 'folder',
          hasChildren: false,
          children: []
        };
        
        if (depth < maxDepth) {
          node.children = await buildTree(row.path, depth + 1);
        }
        node.hasChildren = node.children.length > 0;
        children.push(node);
      }
      
      return children;
    }
    
    const tree = {
      id: normalized,
      name: normalized === '/' ? '/' : path.posix.basename(normalized),
      path: normalized,
      type: 'folder',
      children: await buildTree(normalized, 1)
    };
    
    return sendDriveSuccess(res, { tree, maxDepth });
  } catch (error) {
    console.error('[DriveAPI] Tree error:', error);
    return sendDriveError(res, 500, 'DRIVE_TREE_FAILED', 'Failed to build folder tree', { reason: error.message });
  }
});

/**
 * POST /api/v1/drive/folders
 * Create a new folder (metadata only, stored in DB)
 */
router.post('/drive/folders', authenticateAgent, requireCorePermission('drive.createFolder'), async (req, res) => {
  try {
    const parentPath = req.body?.parentPath || req.body?.path || '/';
    const folderName = String(req.body?.name || '').trim();
    const workspaceId = workspaceIdOf(req);
    const uploadedBy = actorIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    if (!folderName) {
      return sendDriveError(res, 400, 'VALIDATION_ERROR', 'Folder name is required', { field: 'name' });
    }
    
    if (folderName.includes('/') || folderName.includes('\\') || folderName === '.' || folderName === '..') {
      return sendDriveError(res, 400, 'INVALID_FOLDER_NAME', 'Folder name contains invalid characters', { field: 'name' });
    }
    
    const normalized = normalizeVirtualPath(parentPath);
    const targetVirtualPath = normalized === '/' ? `/${folderName}` : `${normalized}/${folderName}`;
    const fileId = generateFileId();
    
    // Insert folder metadata into database
    await pool.query(
      `INSERT INTO tenant_vutler.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
       VALUES ($1, $2, $3, $4, $5, 'inode/directory', 0, $6, NULL, false, 'folder')`,
      [fileId, workspaceId, folderName, targetVirtualPath, normalized, uploadedBy]
    );
    
    console.log(`[DriveAPI] Folder created: ${targetVirtualPath}`);
    
    return sendDriveSuccess(res, {
      folder: {
        id: fileId,
        name: folderName,
        type: 'folder',
        path: targetVirtualPath,
        parentPath: normalized,
        mimeType: 'inode/directory',
        size: 0
      }
    }, 201);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return sendDriveError(res, 409, 'FOLDER_ALREADY_EXISTS', 'Folder already exists', { path: error.detail });
    }
    console.error('[DriveAPI] Create folder error:', error);
    return sendDriveError(res, 500, 'DRIVE_FOLDER_CREATE_FAILED', 'Failed to create folder', { reason: error.message });
  }
});

/**
 * POST /api/v1/drive/upload
 * Upload file to S3 and save metadata in database
 */
router.post('/drive/upload', authenticateAgent, requireCorePermission('drive.upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendDriveError(res, 400, 'FILE_REQUIRED', 'No file provided', {}, 'Attach a file in multipart field "file"');
    }
    
    const workspaceId = workspaceIdOf(req);
    const uploadedBy = actorIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    const targetVirtualPath = req.body?.path || '/';
    const normalized = normalizeVirtualPath(targetVirtualPath);
    
    const cleanName = safeFileName(req.file.originalname);
    const fileId = generateFileId();
    const s3Key = generateS3Key(normalized, `${fileId}-${cleanName}`);
    
    // Get workspace bucket
    const bucket = await getWorkspaceBucket(workspaceId);
    
    // Upload to S3
    await s3Driver.upload(bucket, s3Driver.prefixKey(s3Key), req.file.buffer, req.file.mimetype);
    
    // Save metadata to database
    const itemPath = normalized === '/' ? `/${cleanName}` : `${normalized}/${cleanName}`;
    await pool.query(
      `INSERT INTO tenant_vutler.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'file')`,
      [fileId, workspaceId, cleanName, itemPath, normalized, req.file.mimetype || 'application/octet-stream',
       req.file.size, uploadedBy, s3Key]
    );
    
    console.log(`[DriveAPI] File uploaded: ${itemPath} (${req.file.size} bytes) to S3 bucket ${bucket}`);

    const uploaderName = actorNameOf(req);
    findAssignedAgentForPath(pool, workspaceId, itemPath)
      .then((match) => {
        if (!match?.agent || !uploadedBy || String(match.agent.id) === String(uploadedBy)) return null;
        return notifyAgentAboutDriveFile({
          pg: pool,
          app: req.app,
          workspaceId,
          userId: uploadedBy,
          userName: uploaderName,
          agent: match.agent,
          file: {
            id: fileId,
            name: cleanName,
            mimeType: req.file.mimetype || 'application/octet-stream',
            size: req.file.size,
            path: itemPath,
          },
        });
      })
      .catch((notifyErr) => {
        console.error('[DriveAPI] Agent intake notification failed:', notifyErr.message);
      });
    
    return sendDriveSuccess(res, {
      file: {
        id: fileId,
        name: cleanName,
        type: 'file',
        mimeType: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        path: itemPath,
        parentPath: normalized,
        s3Key: s3Key,
        bucket: bucket
      }
    }, 201);
  } catch (error) {
    console.error('[DriveAPI] Upload error:', error);
    return sendDriveError(res, 500, 'DRIVE_UPLOAD_FAILED', 'Upload failed', { reason: error.message });
  }
});

/**
 * Resolve MIME type for inline preview based on file extension (fallback when DB value is generic)
 */
function resolveInlineMime(name, dbMime) {
  if (dbMime && dbMime !== 'application/octet-stream') return dbMime;
  const ext = path.extname(name || '').toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.md': 'text/plain', '.txt': 'text/plain', '.csv': 'text/plain',
    '.html': 'text/html', '.htm': 'text/html',
    '.json': 'application/json',
  };
  return map[ext] || dbMime || 'application/octet-stream';
}

/**
 * Returns true for MIME types that should be displayed inline in the browser.
 */
function isInlineMime(mime) {
  return (
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json'
  );
}

/**
 * GET /api/v1/drive/download/:id
 * Download file from S3 by file ID.
 * Pass ?inline=true (or let the server auto-detect for images/PDF/text) to display in browser.
 */
router.get('/drive/download/:id', authenticateAgent, requireCorePermission('drive.download'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const requestedPath = req.query.path;
    const forceInline = req.query.inline === 'true';
    const workspaceId = workspaceIdOf(req);

    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }

    let fileRecord;

    // Always try by UUID first, then fall back to path lookup.
    // (Previously, providing ?path= would skip the ID lookup entirely, causing 404
    //  when the frontend passes both the UUID and a folder path.)
    if (fileId && fileId !== 'unused') {
      const result = await pool.query(
        `SELECT id, name, mime_type, size_bytes, s3_key
         FROM tenant_vutler.drive_files
         WHERE id = $1 AND workspace_id = $2 AND is_deleted = false`,
        [fileId, workspaceId]
      );
      if (result.rows.length > 0) fileRecord = result.rows[0];
    }

    if (!fileRecord && requestedPath) {
      // Fall back to path-based lookup (backward compatibility)
      const normalized = normalizeVirtualPath(requestedPath);
      const result = await pool.query(
        `SELECT id, name, mime_type, size_bytes, s3_key
         FROM tenant_vutler.drive_files
         WHERE path = $1 AND workspace_id = $2 AND is_deleted = false`,
        [normalized, workspaceId]
      );
      if (result.rows.length > 0) fileRecord = result.rows[0];
    }

    if (!fileRecord) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
    }

    // Guard: s3_key must be present (folders and legacy records may lack one)
    if (!fileRecord.s3_key) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File has no stored content (missing S3 key)');
    }

    const bucket = await getWorkspaceBucket(workspaceId);

    // Download from S3
    const s3Result = await s3Driver.download(bucket, s3Driver.prefixKey(fileRecord.s3_key));

    // Determine content type and disposition
    const mime = resolveInlineMime(fileRecord.name, fileRecord.mime_type);
    const inline = forceInline || isInlineMime(mime);
    const disposition = inline
      ? `inline; filename="${fileRecord.name}"`
      : `attachment; filename="${fileRecord.name}"`;

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', disposition);
    if (fileRecord.size_bytes) res.setHeader('Content-Length', fileRecord.size_bytes);

    // Stream to response — AWS SDK v3 returns body as s3Result.Body (a ReadableStream / Readable)
    const body = s3Result.Body;
    if (body && typeof body.pipe === 'function') {
      body.pipe(res);
    } else if (body && typeof body.transformToByteArray === 'function') {
      // AWS SDK v3 web-compatible stream
      const bytes = await body.transformToByteArray();
      res.end(Buffer.from(bytes));
    } else {
      res.end(body);
    }

    console.log(`[DriveAPI] File ${inline ? 'previewed' : 'downloaded'}: ${fileRecord.name} from S3`);
  } catch (error) {
    console.error('[DriveAPI] Download error:', error);
    if (error.message === 'File not found') {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
    }
    return sendDriveError(res, 500, 'DRIVE_DOWNLOAD_FAILED', 'Download failed', { reason: error.message });
  }
});

/**
 * GET /api/v1/drive/preview/:id
 * Preview file inline in browser (images, PDF, text, markdown rendered as HTML).
 * For other types, falls back to download.
 */
router.get('/drive/preview/:id', authenticateAgent, requireCorePermission('drive.download'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const requestedPath = req.query.path;
    const wantsJson = req.query.format === 'json' || req.accepts(['json', 'html']) === 'json';
    const workspaceId = workspaceIdOf(req);

    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }

    let fileRecord;

    if (fileId && fileId !== 'unused') {
      const result = await pool.query(
        `SELECT id, name, path, mime_type, size_bytes, s3_key, updated_at
         FROM tenant_vutler.drive_files
         WHERE id = $1 AND workspace_id = $2 AND is_deleted = false`,
        [fileId, workspaceId]
      );
      if (result.rows.length > 0) fileRecord = result.rows[0];
    }

    if (!fileRecord && requestedPath) {
      const normalized = normalizeVirtualPath(requestedPath);
      const result = await pool.query(
        `SELECT id, name, path, mime_type, size_bytes, s3_key, updated_at
         FROM tenant_vutler.drive_files
         WHERE path = $1 AND workspace_id = $2 AND is_deleted = false`,
        [normalized, workspaceId]
      );
      if (result.rows.length > 0) fileRecord = result.rows[0];
    }

    if (!fileRecord) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
    }

    if (!fileRecord.s3_key) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File has no stored content (missing S3 key)');
    }

    const mime = resolveInlineMime(fileRecord.name, fileRecord.mime_type);
    const bucket = await getWorkspaceBucket(workspaceId);
    const s3Result = await s3Driver.download(bucket, s3Driver.prefixKey(fileRecord.s3_key));

    const body = s3Result.Body;
    let buffer;
    if (body && typeof body.transformToByteArray === 'function') {
      buffer = Buffer.from(await body.transformToByteArray());
    } else if (body && typeof body.pipe === 'function') {
      buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        body.on('data', c => chunks.push(c));
        body.on('end', () => resolve(Buffer.concat(chunks)));
        body.on('error', reject);
      });
    } else {
      buffer = Buffer.from(body || '');
    }

    // Markdown → render as simple HTML
    const ext = path.extname(fileRecord.name || '').toLowerCase();
    if (wantsJson) {
      if (ext === '.md' || ext === '.mdx' || mime.startsWith('text/') || mime === 'application/json') {
        return sendDriveSuccess(res, {
          type: 'text',
          name: fileRecord.name,
          path: fileRecord.path,
          mimeType: `${mime}${mime.startsWith('text/') || mime === 'application/json' ? '; charset=utf-8' : ''}`,
          modified: fileRecord.updated_at?.toISOString(),
          content: buffer.toString('utf8').slice(0, 250000),
        });
      }

      return sendDriveSuccess(res, {
        type: 'binary',
        name: fileRecord.name,
        path: fileRecord.path,
        mimeType: mime,
        modified: fileRecord.updated_at?.toISOString(),
        url: `/api/v1/drive/download/${fileRecord.id}?path=${encodeURIComponent(fileRecord.path || requestedPath || '')}&inline=true`,
      });
    }

    if (ext === '.md' || ext === '.mdx') {
      const escaped = buffer.toString('utf8')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>${fileRecord.name}</title>
        <style>body{font-family:sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.6}
        pre{background:#f4f4f4;padding:1rem;overflow:auto}code{background:#f4f4f4;padding:.2em .4em}</style>
        </head><body><pre style="white-space:pre-wrap">${escaped}</pre></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileRecord.name)}`);
      return res.end(html);
    }

    // Images, PDF, plain text — send inline
    if (isInlineMime(mime)) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileRecord.name)}`);
      if (fileRecord.size_bytes) res.setHeader('Content-Length', fileRecord.size_bytes);
      return res.end(buffer);
    }

    // Fallback: force download for unsupported preview types
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileRecord.name)}`);
    if (fileRecord.size_bytes) res.setHeader('Content-Length', fileRecord.size_bytes);
    return res.end(buffer);
  } catch (error) {
    console.error('[DriveAPI] Preview error:', error);
    return sendDriveError(res, 500, 'DRIVE_PREVIEW_FAILED', 'Preview failed', { reason: error.message });
  }
});

/**
 * POST /api/v1/drive/move
 * Move or rename a file/folder.
 */
router.post('/drive/move', authenticateAgent, requireCorePermission('drive.upload'), async (req, res) => {
  try {
    const workspaceId = workspaceIdOf(req);
    const actorId = actorIdOf(req);
    const actorName = actorNameOf(req);

    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }

    const fromPathRaw = req.body?.fromPath || req.body?.path;
    const toPathRaw = req.body?.toPath || req.body?.destinationPath;
    if (!fromPathRaw || !toPathRaw) {
      return sendDriveError(res, 400, 'VALIDATION_ERROR', 'fromPath and toPath are required');
    }

    const fromPath = normalizeVirtualPath(fromPathRaw);
    const toPath = normalizeVirtualPath(toPathRaw);
    const finalName = req.body?.newName ? safeFileName(req.body.newName) : null;

    if (fromPath === '/') {
      return sendDriveError(res, 400, 'INVALID_PATH', 'Cannot move the drive root');
    }

    const lookup = await pool.query(
      `SELECT id, name, path, parent_path, mime_type, size_bytes, s3_key, type, uploaded_by
       FROM tenant_vutler.drive_files
       WHERE workspace_id = $1
         AND path = $2
         AND is_deleted = false
       LIMIT 1`,
      [workspaceId, fromPath]
    );

    if (lookup.rows.length === 0) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File or folder not found');
    }

    const record = lookup.rows[0];
    const nextName = finalName || safeFileName(record.name);
    const nextPath = normalizeVirtualPath(toPath === '/' ? `/${nextName}` : `${toPath}/${nextName}`);

    if (nextPath === fromPath) {
      return sendDriveSuccess(res, {
        moved: {
          id: record.id,
          name: nextName,
          fromPath,
          toPath: nextPath,
        },
      });
    }

    const isFolder = record.type === 'folder' || record.mime_type === 'inode/directory';
    if (isFolder && (toPath === fromPath || toPath.startsWith(`${fromPath}/`))) {
      return sendDriveError(res, 400, 'INVALID_DESTINATION', 'A folder cannot be moved inside itself');
    }

    const bucket = await getWorkspaceBucket(workspaceId);

    if (isFolder) {
      const descendants = await pool.query(
        `SELECT id, path, parent_path, name, mime_type, s3_key, type
         FROM tenant_vutler.drive_files
         WHERE workspace_id = $1
           AND is_deleted = false
           AND (path = $2 OR path LIKE $3)
         ORDER BY LENGTH(path) ASC`,
        [workspaceId, fromPath, `${fromPath}/%`]
      );

      for (const item of descendants.rows) {
        const suffix = item.path === fromPath ? '' : item.path.slice(fromPath.length);
        const itemNextPath = normalizeVirtualPath(`${nextPath}${suffix}`);
        const itemNextParent = parentPathFor(itemNextPath);

        let itemNextS3Key = item.s3_key;
        if ((item.type !== 'folder' && item.mime_type !== 'inode/directory') && item.s3_key) {
          const itemFileName = path.posix.basename(itemNextPath);
          itemNextS3Key = generateS3Key(itemNextParent, `${item.id}-${itemFileName}`);
          if (item.s3_key !== itemNextS3Key) {
            await s3Driver.move(bucket, s3Driver.prefixKey(item.s3_key), s3Driver.prefixKey(itemNextS3Key));
          }
        }

        await pool.query(
          `UPDATE tenant_vutler.drive_files
           SET name = CASE WHEN id = $1 THEN $2 ELSE name END,
               path = $3,
               parent_path = $4,
               s3_key = $5,
               updated_at = NOW()
           WHERE id = $1
             AND workspace_id = $6`,
          [
            item.id,
            item.path === fromPath ? nextName : item.name,
            itemNextPath,
            itemNextParent,
            itemNextS3Key,
            workspaceId,
          ]
        );
      }

      const previousMatch = await findAssignedAgentForPath(pool, workspaceId, fromPath).catch(() => null);
      const nextMatch = await findAssignedAgentForPath(pool, workspaceId, nextPath).catch(() => null);
      const enteredAssignedFolder = Boolean(
        nextMatch?.agent?.id
        && (!previousMatch?.agent?.id || String(previousMatch.agent.id) !== String(nextMatch.agent.id))
      );

      if (enteredAssignedFolder && actorId && String(nextMatch.agent.id) !== String(actorId)) {
        notifyAgentAboutDriveFile({
          pg: pool,
          app: req.app,
          workspaceId,
          userId: actorId,
          userName: actorName,
          agent: nextMatch.agent,
          file: {
            id: record.id,
            name: nextName,
            mimeType: 'inode/directory',
            size: 0,
            path: nextPath,
          },
        }).catch((notifyErr) => {
          console.error('[DriveAPI] Agent move notification failed:', notifyErr.message);
        });
      }

      console.log(`[DriveAPI] Folder moved: ${fromPath} -> ${nextPath}`);
      return sendDriveSuccess(res, {
        moved: {
          id: record.id,
          name: nextName,
          fromPath,
          toPath: nextPath,
        },
      });
    }

    const nextParent = parentPathFor(nextPath);
    const nextS3Key = generateS3Key(nextParent, `${record.id}-${nextName}`);
    if (record.s3_key && record.s3_key !== nextS3Key) {
      await s3Driver.move(bucket, s3Driver.prefixKey(record.s3_key), s3Driver.prefixKey(nextS3Key));
    }

    await pool.query(
      `UPDATE tenant_vutler.drive_files
       SET name = $1,
           path = $2,
           parent_path = $3,
           s3_key = $4,
           updated_at = NOW()
       WHERE id = $5
         AND workspace_id = $6`,
      [nextName, nextPath, nextParent, nextS3Key, record.id, workspaceId]
    );

    const previousMatch = await findAssignedAgentForPath(pool, workspaceId, fromPath).catch(() => null);
    const nextMatch = await findAssignedAgentForPath(pool, workspaceId, nextPath).catch(() => null);
    const enteredAssignedFolder = Boolean(
      nextMatch?.agent?.id
      && (!previousMatch?.agent?.id || String(previousMatch.agent.id) !== String(nextMatch.agent.id))
    );

    if (enteredAssignedFolder && actorId && String(nextMatch.agent.id) !== String(actorId)) {
      notifyAgentAboutDriveFile({
        pg: pool,
        app: req.app,
        workspaceId,
        userId: actorId,
        userName: actorName,
        agent: nextMatch.agent,
        file: {
          id: record.id,
          name: nextName,
          mimeType: record.mime_type || 'application/octet-stream',
          size: Number(record.size_bytes || 0),
          path: nextPath,
        },
      }).catch((notifyErr) => {
        console.error('[DriveAPI] Agent move notification failed:', notifyErr.message);
      });
    }

    console.log(`[DriveAPI] File moved: ${fromPath} -> ${nextPath}`);
    return sendDriveSuccess(res, {
      moved: {
        id: record.id,
        name: nextName,
        fromPath,
        toPath: nextPath,
      },
    });
  } catch (error) {
    console.error('[DriveAPI] Move error:', error);
    return sendDriveError(res, 500, 'DRIVE_MOVE_FAILED', 'Move failed', { reason: error.message });
  }
});

/**
 * DELETE /api/v1/drive/files/:id
 * Delete file from S3 and database
 */
router.delete('/drive/files/:id', authenticateAgent, requireCorePermission('drive.delete'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const workspaceId = workspaceIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    // Get file record
    const result = await pool.query(
      `SELECT id, name, s3_key, mime_type 
       FROM tenant_vutler.drive_files 
       WHERE id = $1 AND workspace_id = $2 AND is_deleted = false`,
      [fileId, workspaceId]
    );
    
    if (result.rows.length === 0) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
    }
    
    const fileRecord = result.rows[0];
    
    // Delete from S3 if it's a file (not a folder)
    if (fileRecord.mime_type !== 'inode/directory' && fileRecord.s3_key) {
      const bucket = await getWorkspaceBucket(workspaceId);
      await s3Driver.remove(bucket, s3Driver.prefixKey(fileRecord.s3_key));
    }
    
    // Soft delete from database
    await pool.query(
      `UPDATE tenant_vutler.drive_files 
       SET is_deleted = true, deleted_at = NOW()
       WHERE id = $1
         AND workspace_id = $2`,
      [fileId, workspaceId]
    );
    
    console.log(`[DriveAPI] File deleted: ${fileRecord.name}`);
    
    return sendDriveSuccess(res, {
      deleted: fileId,
      name: fileRecord.name
    });
  } catch (error) {
    console.error('[DriveAPI] Delete error:', error);
    return sendDriveError(res, 500, 'DRIVE_DELETE_FAILED', 'Delete failed', { reason: error.message });
  }
});

/**
 * DELETE /api/v1/drive/files (legacy endpoint)
 * Delete file by path
 */
router.delete('/files', authenticateAgent, requireCorePermission('drive.delete'), async (req, res) => {
  try {
    const requestedPath = req.query.path || req.body?.path;
    const workspaceId = workspaceIdOf(req);
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    if (!requestedPath || requestedPath === '/') {
      return sendDriveError(res, 400, 'INVALID_PATH', 'Cannot delete root or invalid path');
    }
    
    const normalized = normalizeVirtualPath(requestedPath);
    
    // Get file record
    const result = await pool.query(
      `SELECT id, name, s3_key, mime_type 
       FROM tenant_vutler.drive_files 
       WHERE path = $1 AND workspace_id = $2 AND is_deleted = false`,
      [normalized, workspaceId]
    );
    
    if (result.rows.length === 0) {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File or folder not found');
    }
    
    const fileRecord = result.rows[0];
    
    // Delete from S3 if it's a file
    if (fileRecord.mime_type !== 'inode/directory' && fileRecord.s3_key) {
      const bucket = await getWorkspaceBucket(workspaceId);
      await s3Driver.remove(bucket, s3Driver.prefixKey(fileRecord.s3_key));
    }
    
    // Soft delete from database
    await pool.query(
      `UPDATE tenant_vutler.drive_files 
       SET is_deleted = true, deleted_at = NOW()
       WHERE id = $1
         AND workspace_id = $2`,
      [fileRecord.id, workspaceId]
    );
    
    console.log(`[DriveAPI] File deleted (legacy): ${fileRecord.name}`);
    
    return sendDriveSuccess(res, {
      deleted: fileRecord.id,
      path: normalized,
      name: fileRecord.name
    });
  } catch (error) {
    console.error('[DriveAPI] Delete error (legacy):', error);
    return sendDriveError(res, 500, 'DRIVE_DELETE_FAILED', 'Delete failed', { reason: error.message });
  }
});

module.exports = router;
module.exports._private = {
  workspaceIdOf,
  actorIdOf,
  actorNameOf,
};
