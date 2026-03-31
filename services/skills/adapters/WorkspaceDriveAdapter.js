'use strict';

const crypto = require('crypto');
const path = require('path');
const pool = require('../../../lib/vaultbrix');
const s3Driver = require('../../../app/custom/services/s3Driver');
const { resolveWorkspaceDriveRoot, resolveWorkspaceDriveWritePath } = require('../../drivePlacementPolicy');

const SCHEMA = 'tenant_vutler';

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
  const base = path.basename(String(fileName || '')).replace(/[\r\n]/g, '').trim();
  return base || `upload-${Date.now()}`;
}

function parentPathFor(filePath) {
  const parent = path.posix.dirname(filePath);
  return parent === '.' ? '/' : parent;
}

function generateS3Key(virtualPath, fileName) {
  const normalized = normalizeVirtualPath(virtualPath);
  if (normalized === '/') return fileName;
  return `${normalized.slice(1)}/${fileName}`;
}

function mapRow(row) {
  const type = row.type || (row.mime_type === 'inode/directory' ? 'folder' : 'file');
  return {
    id: row.id,
    name: row.name,
    type,
    size: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    modified: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    mimeType: row.mime_type || (type === 'folder' ? 'inode/directory' : 'application/octet-stream'),
    path: row.path,
    parentPath: row.parent_path || '/',
    s3Key: row.s3_key || null,
  };
}

async function readStream(resp) {
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getWorkspaceBucket(workspaceId) {
  const result = await pool.query(
    `SELECT slug, storage_bucket
     FROM ${SCHEMA}.workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId]
  );

  if (!result.rows[0]) {
    throw new Error(`Workspace not found for drive adapter: ${workspaceId}`);
  }

  const workspace = result.rows[0];
  if (workspace.storage_bucket) {
    await s3Driver.ensureBucket(workspace.storage_bucket);
    return workspace.storage_bucket;
  }

  const bucketName = s3Driver.getBucketName(workspace.slug || 'default');
  await pool.query(
    `UPDATE ${SCHEMA}.workspaces
     SET storage_bucket = $1
     WHERE id = $2`,
    [bucketName, workspaceId]
  );
  await s3Driver.ensureBucket(bucketName);
  return bucketName;
}

async function findByPath(workspaceId, filePath) {
  const result = await pool.query(
    `SELECT id, name, path, parent_path, type, mime_type, size_bytes, s3_key, created_at, updated_at
     FROM ${SCHEMA}.drive_files
     WHERE workspace_id = $1
       AND path = $2
       AND is_deleted = false
     LIMIT 1`,
    [workspaceId, normalizeVirtualPath(filePath)]
  );
  return result.rows[0] || null;
}

async function findById(workspaceId, fileId) {
  const result = await pool.query(
    `SELECT id, name, path, parent_path, type, mime_type, size_bytes, s3_key, created_at, updated_at
     FROM ${SCHEMA}.drive_files
     WHERE workspace_id = $1
       AND id = $2
       AND is_deleted = false
     LIMIT 1`,
    [workspaceId, fileId]
  );
  return result.rows[0] || null;
}

class WorkspaceDriveAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || this._inferActionFromSkillKey(context.skillKey);

    switch (action) {
      case 'list':
        return this._list(workspaceId, params);
      case 'search':
        return this._search(workspaceId, params);
      case 'read':
      case 'preview':
        return this._read(workspaceId, params);
      case 'download':
        return this._download(workspaceId, params);
      case 'create_folder':
        return this._createFolder(workspaceId, params);
      case 'write_text':
      case 'create':
      case 'update':
        return this._writeText(workspaceId, params, context.skillKey);
      case 'move':
        return this._move(workspaceId, params);
      case 'delete':
        return this._delete(workspaceId, params);
      default:
        return { success: false, error: `Unknown workspace drive action: "${action}"` };
    }
  }

  _inferActionFromSkillKey(skillKey = '') {
    const key = String(skillKey || '').toLowerCase();
    if (key.endsWith('_write')) return 'write_text';
    if (key.endsWith('_read')) return 'read';
    if (key.endsWith('_search')) return 'search';
    if (key.endsWith('_list')) return 'list';
    return 'list';
  }

  async _list(workspaceId, params) {
    const normalized = normalizeVirtualPath(params.path || '/');
    const result = await pool.query(
      `SELECT id, name, path, parent_path, type, mime_type, size_bytes, s3_key, updated_at
       FROM ${SCHEMA}.drive_files
       WHERE workspace_id = $1
         AND parent_path = $2
         AND is_deleted = false
       ORDER BY type DESC, name ASC`,
      [workspaceId, normalized]
    );

    return {
      success: true,
      data: { path: normalized, files: result.rows.map(mapRow), count: result.rows.length },
    };
  }

  async _search(workspaceId, params) {
    const query = String(params.searchQuery || params.query || params.q || '').trim();
    if (!query) return { success: false, error: 'searchQuery is required' };

    const prefix = normalizeVirtualPath(params.path || '/');
    const result = await pool.query(
      `SELECT id, name, path, parent_path, type, mime_type, size_bytes, s3_key, updated_at
       FROM ${SCHEMA}.drive_files
       WHERE workspace_id = $1
         AND is_deleted = false
         AND ($2 = '/' OR path LIKE $3)
         AND (name ILIKE $4 OR path ILIKE $4)
       ORDER BY updated_at DESC NULLS LAST, name ASC
       LIMIT 100`,
      [workspaceId, prefix, `${prefix === '/' ? '' : prefix}/%`, `%${query}%`]
    );

    return {
      success: true,
      data: { path: prefix, files: result.rows.map(mapRow), count: result.rows.length },
    };
  }

  async _read(workspaceId, params) {
    const record = await this._resolveRecord(workspaceId, params);
    if (!record) return { success: false, error: 'path or fileId is required' };
    if (record.type === 'folder') return { success: false, error: 'Folders cannot be read' };

    const bucket = await getWorkspaceBucket(workspaceId);
    const resp = await s3Driver.download(bucket, s3Driver.prefixKey(record.s3_key));
    const buffer = await readStream(resp);

    return {
      success: true,
      data: {
        id: record.id,
        path: record.path,
        name: record.name,
        mimeType: record.mime_type || 'application/octet-stream',
        content: buffer.toString('utf8').slice(0, 250000),
      },
    };
  }

  async _download(workspaceId, params) {
    const record = await this._resolveRecord(workspaceId, params);
    if (!record) return { success: false, error: 'path or fileId is required' };
    if (record.type === 'folder') return { success: false, error: 'Folders cannot be downloaded' };

    const bucket = await getWorkspaceBucket(workspaceId);
    const resp = await s3Driver.download(bucket, s3Driver.prefixKey(record.s3_key));
    const buffer = await readStream(resp);

    return {
      success: true,
      data: {
        id: record.id,
        path: record.path,
        name: record.name,
        mimeType: record.mime_type || 'application/octet-stream',
        content: buffer.toString('utf8').slice(0, 50000),
      },
    };
  }

  async _createFolder(workspaceId, params) {
    const name = String(params.name || '').trim();
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return { success: false, error: 'name is required and must be a valid folder name' };
    }

    const parentPath = normalizeVirtualPath(params.path || params.parentPath || '/');
    const folderPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    const fileId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO ${SCHEMA}.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
       VALUES ($1, $2, $3, $4, $5, 'inode/directory', 0, $6, null, false, 'folder')
       ON CONFLICT (workspace_id, path)
       DO UPDATE SET
         is_deleted = false,
         updated_at = NOW()`,
      [fileId, workspaceId, name, folderPath, parentPath, null]
    );

    return {
      success: true,
      data: { created: mapRow({ id: fileId, name, path: folderPath, parent_path: parentPath, type: 'folder', mime_type: 'inode/directory', size_bytes: 0, updated_at: new Date() }) },
    };
  }

  async _writeText(workspaceId, params, skillKey = 'workspace_drive_write') {
    const resolved = await resolveWorkspaceDriveWritePath({
      skillKey,
      workspaceId,
      params,
    });
    const workspaceRoot = await resolveWorkspaceDriveRoot(workspaceId);
    const filePath = normalizeVirtualPath(resolved.path || '');
    if (!filePath || filePath === '/') return { success: false, error: 'path is required' };

    const existing = await findByPath(workspaceId, filePath);
    const fileId = existing?.id || crypto.randomUUID();
    const cleanName = safeFileName(path.posix.basename(filePath));
    const parentPath = parentPathFor(filePath);
    const s3Key = existing?.s3_key || generateS3Key(parentPath, `${fileId}-${cleanName}`);
    const content = params.content || params.body || '';
    const contentType = params.mimeType || 'text/plain; charset=utf-8';
    const bucket = await getWorkspaceBucket(workspaceId);

    await s3Driver.upload(bucket, s3Driver.prefixKey(s3Key), Buffer.from(String(content), 'utf8'), contentType);
    await pool.query(
      `INSERT INTO ${SCHEMA}.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'file')
       ON CONFLICT (workspace_id, path)
       DO UPDATE SET
         name = EXCLUDED.name,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         uploaded_by = EXCLUDED.uploaded_by,
         s3_key = EXCLUDED.s3_key,
         is_deleted = false,
         updated_at = NOW()`,
      [
        fileId,
        workspaceId,
        cleanName,
        filePath,
        parentPath,
        contentType,
        Buffer.byteLength(String(content), 'utf8'),
        null,
        s3Key,
      ]
    );

    return {
      success: true,
      data: {
        id: fileId,
        path: filePath,
        name: cleanName,
        size: Buffer.byteLength(String(content), 'utf8'),
        mimeType: contentType,
        placement: {
          root: workspaceRoot,
          folder: resolved.folder ? normalizeVirtualPath(resolved.folder) : null,
          defaulted: resolved.defaulted,
          reason: resolved.reason,
        },
      },
    };
  }

  async _move(workspaceId, params) {
    const record = await this._resolveRecord(workspaceId, { path: params.fromPath, fileId: params.fileId, id: params.id });
    const destinationPath = normalizeVirtualPath(params.toPath || params.destinationPath || '/');
    if (!record) return { success: false, error: 'fromPath or fileId is required' };

    const newPath = destinationPath === '/' ? `/${record.name}` : `${destinationPath}/${record.name}`;
    const bucket = await getWorkspaceBucket(workspaceId);
    const oldKey = record.s3_key;
    const newKey = generateS3Key(destinationPath, `${record.id}-${record.name}`);

    if (record.type !== 'folder' && oldKey !== newKey) {
      await s3Driver.move(bucket, s3Driver.prefixKey(oldKey), s3Driver.prefixKey(newKey));
    }

    await pool.query(
      `UPDATE ${SCHEMA}.drive_files
       SET path = $3,
           parent_path = $4,
           s3_key = CASE WHEN type = 'folder' THEN s3_key ELSE $5 END,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND id = $2`,
      [workspaceId, record.id, newPath, destinationPath, newKey]
    );

    return {
      success: true,
      data: { from: record.path, to: newPath },
    };
  }

  async _delete(workspaceId, params) {
    const record = await this._resolveRecord(workspaceId, params);
    if (!record) return { success: false, error: 'path or fileId is required' };

    if (record.type !== 'folder' && record.s3_key) {
      const bucket = await getWorkspaceBucket(workspaceId);
      await s3Driver.remove(bucket, s3Driver.prefixKey(record.s3_key));
    }

    await pool.query(
      `UPDATE ${SCHEMA}.drive_files
       SET is_deleted = true,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND id = $2`,
      [workspaceId, record.id]
    );

    return {
      success: true,
      data: { deleted: record.path },
    };
  }

  async _resolveRecord(workspaceId, params) {
    const explicitPath = String(params.path || params.filePath || '').trim();
    if (explicitPath) return findByPath(workspaceId, explicitPath);

    const fileId = params.fileId || params.id;
    if (!fileId) return null;
    return findById(workspaceId, fileId);
  }
}

module.exports = { WorkspaceDriveAdapter };
