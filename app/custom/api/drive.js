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
    const bucketName = s3Driver.generateBucketName(workspace.slug);
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
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required', {}, 'Provide x-workspace-id header');
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
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required', {}, 'Provide x-workspace-id header');
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
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
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
    const parentPath = req.body?.path || '/';
    const folderName = String(req.body?.name || '').trim();
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    const uploadedBy = req.userId || req.headers['x-user-id'];
    
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
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted)
       VALUES ($1, $2, $3, $4, $5, 'inode/directory', 0, $6, NULL, false)`,
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
    
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    const uploadedBy = req.userId || req.headers['x-user-id'];
    
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
    await s3Driver.upload(bucket, s3Key, req.file.buffer, req.file.mimetype);
    
    // Save metadata to database
    const itemPath = normalized === '/' ? `/${cleanName}` : `${normalized}/${cleanName}`;
    await pool.query(
      `INSERT INTO tenant_vutler.drive_files 
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
      [fileId, workspaceId, cleanName, itemPath, normalized, req.file.mimetype || 'application/octet-stream', 
       req.file.size, uploadedBy, s3Key]
    );
    
    console.log(`[DriveAPI] File uploaded: ${itemPath} (${req.file.size} bytes) to S3 bucket ${bucket}`);
    
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
 * GET /api/v1/drive/download/:id
 * Download file from S3 by file ID
 */
router.get('/drive/download/:id', authenticateAgent, requireCorePermission('drive.download'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const requestedPath = req.query.path;
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
    if (!workspaceId) {
      return sendDriveError(res, 400, 'WORKSPACE_REQUIRED', 'Workspace ID is required');
    }
    
    let fileRecord;
    
    if (fileId && fileId !== 'unused' && !requestedPath) {
      // Download by file ID
      const result = await pool.query(
        `SELECT id, name, mime_type, size_bytes, s3_key 
         FROM tenant_vutler.drive_files 
         WHERE id = $1 AND workspace_id = $2 AND is_deleted = false`,
        [fileId, workspaceId]
      );
      
      if (result.rows.length === 0) {
        return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
      }
      
      fileRecord = result.rows[0];
    } else if (requestedPath) {
      // Download by path (backward compatibility)
      const normalized = normalizeVirtualPath(requestedPath);
      const result = await pool.query(
        `SELECT id, name, mime_type, size_bytes, s3_key 
         FROM tenant_vutler.drive_files 
         WHERE path = $1 AND workspace_id = $2 AND is_deleted = false`,
        [normalized, workspaceId]
      );
      
      if (result.rows.length === 0) {
        return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
      }
      
      fileRecord = result.rows[0];
    } else {
      return sendDriveError(res, 400, 'INVALID_REQUEST', 'File ID or path is required');
    }
    
    const bucket = await getWorkspaceBucket(workspaceId);
    
    // Download from S3
    const s3Result = await s3Driver.download(bucket, fileRecord.s3_key);
    
    // Set response headers
    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.name}"`);
    res.setHeader('Content-Length', fileRecord.size_bytes);
    
    // Stream to response
    s3Result.stream.pipe(res);
    
    console.log(`[DriveAPI] File downloaded: ${fileRecord.name} from S3`);
  } catch (error) {
    console.error('[DriveAPI] Download error:', error);
    if (error.message === 'File not found') {
      return sendDriveError(res, 404, 'FILE_NOT_FOUND', 'File not found');
    }
    return sendDriveError(res, 500, 'DRIVE_DOWNLOAD_FAILED', 'Download failed', { reason: error.message });
  }
});

/**
 * DELETE /api/v1/drive/files/:id
 * Delete file from S3 and database
 */
router.delete('/drive/files/:id', authenticateAgent, requireCorePermission('drive.delete'), async (req, res) => {
  try {
    const fileId = req.params.id;
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
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
      await s3Driver.delete(bucket, fileRecord.s3_key);
    }
    
    // Soft delete from database
    await pool.query(
      `UPDATE tenant_vutler.drive_files 
       SET is_deleted = true, deleted_at = NOW()
       WHERE id = $1`,
      [fileId]
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
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'];
    
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
      await s3Driver.delete(bucket, fileRecord.s3_key);
    }
    
    // Soft delete from database
    await pool.query(
      `UPDATE tenant_vutler.drive_files 
       SET is_deleted = true, deleted_at = NOW()
       WHERE id = $1`,
      [fileRecord.id]
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
