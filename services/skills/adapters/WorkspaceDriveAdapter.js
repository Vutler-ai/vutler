'use strict';

const crypto = require('crypto');
const path = require('path');
const s3 = require('../../s3Storage');
const { resolveWorkspaceDriveWritePath } = require('../../drivePlacementPolicy');

function sanitizeKey(input) {
  const normalized = path.posix.normalize(String(input || '')).replace(/\\/g, '/');
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.' && segment !== '..');
  return segments.join('/');
}

function hashId(key) {
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 24);
}

function mapObject(obj) {
  const name = obj.key.split('/').pop();
  const isFolder = obj.key.endsWith('/');
  return {
    id: hashId(obj.key),
    name,
    type: isFolder ? 'folder' : 'file',
    size: isFolder ? undefined : obj.size,
    modified: obj.lastModified ? new Date(obj.lastModified).toISOString() : undefined,
    mimeType: isFolder ? 'application/x-directory' : 'application/octet-stream',
    path: `/${obj.key}`,
  };
}

class WorkspaceDriveAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || 'list';

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

  async _list(workspaceId, params) {
    const prefix = sanitizeKey(params.path || params.prefix || '');
    const objects = await s3.listFiles(workspaceId, prefix);
    const files = objects.map(mapObject);

    return {
      success: true,
      data: { path: `/${prefix}`, files, count: files.length },
    };
  }

  async _search(workspaceId, params) {
    const query = String(params.searchQuery || params.query || params.q || '').trim().toLowerCase();
    if (!query) return { success: false, error: 'searchQuery is required' };

    const prefix = sanitizeKey(params.path || params.prefix || '');
    const objects = await s3.listFiles(workspaceId, prefix);
    const files = objects.filter((obj) => obj.key.toLowerCase().includes(query)).map(mapObject);

    return {
      success: true,
      data: { path: `/${prefix}`, files, count: files.length },
    };
  }

  async _read(workspaceId, params) {
    const key = await this._resolveKey(workspaceId, params);
    if (!key) return { success: false, error: 'path or fileId is required' };

    const { buffer, contentType } = await s3.downloadFile(workspaceId, key);
    return {
      success: true,
      data: {
        id: hashId(key),
        path: `/${key}`,
        name: key.split('/').pop(),
        mimeType: contentType || 'application/octet-stream',
        content: buffer.toString('utf8').slice(0, 250000),
      },
    };
  }

  async _download(workspaceId, params) {
    const key = await this._resolveKey(workspaceId, params);
    if (!key) return { success: false, error: 'path or fileId is required' };

    const { buffer, contentType } = await s3.downloadFile(workspaceId, key);
    return {
      success: true,
      data: {
        id: hashId(key),
        path: `/${key}`,
        name: key.split('/').pop(),
        mimeType: contentType || 'application/octet-stream',
        content: buffer.toString('utf8').slice(0, 50000),
      },
    };
  }

  async _createFolder(workspaceId, params) {
    const name = String(params.name || '').trim();
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return { success: false, error: 'name is required and must be a valid folder name' };
    }

    const parentPrefix = sanitizeKey(params.path || params.parentPath || '');
    const folderKey = parentPrefix ? `${parentPrefix}/${name}/` : `${name}/`;
    await s3.uploadFile(workspaceId, folderKey, Buffer.alloc(0), 'application/x-directory');

    return {
      success: true,
      data: { created: mapObject({ key: folderKey, size: 0, lastModified: new Date() }) },
    };
  }

  async _writeText(workspaceId, params, skillKey = 'workspace_drive_write') {
    const resolved = await resolveWorkspaceDriveWritePath({
      skillKey,
      workspaceId,
      params,
    });
    const key = sanitizeKey(resolved.path || '');
    if (!key) return { success: false, error: 'path is required' };

    const content = params.content || params.body || '';
    const contentType = params.mimeType || 'text/plain; charset=utf-8';
    await s3.uploadFile(workspaceId, key, Buffer.from(String(content), 'utf8'), contentType);

    return {
      success: true,
      data: {
        id: hashId(key),
        path: `/${key}`,
        name: key.split('/').pop(),
        size: Buffer.byteLength(String(content), 'utf8'),
        mimeType: contentType,
        placement: {
          root: '/projects/Vutler',
          folder: resolved.folder ? `/${sanitizeKey(resolved.folder)}` : null,
          defaulted: resolved.defaulted,
          reason: resolved.reason,
        },
      },
    };
  }

  async _move(workspaceId, params) {
    const fromKey = await this._resolveKey(workspaceId, { path: params.fromPath, fileId: params.fileId, id: params.id });
    const toPrefix = sanitizeKey(params.toPath || params.destinationPath || '');
    if (!fromKey) return { success: false, error: 'fromPath or fileId is required' };

    const fileName = fromKey.split('/').pop();
    const newKey = toPrefix ? `${toPrefix}/${fileName}` : fileName;
    const { buffer, contentType } = await s3.downloadFile(workspaceId, fromKey);
    await s3.uploadFile(workspaceId, newKey, buffer, contentType);
    await s3.deleteFile(workspaceId, fromKey);

    return {
      success: true,
      data: { from: `/${fromKey}`, to: `/${newKey}` },
    };
  }

  async _delete(workspaceId, params) {
    const key = await this._resolveKey(workspaceId, params);
    if (!key) return { success: false, error: 'path or fileId is required' };

    await s3.deleteFile(workspaceId, key);
    return {
      success: true,
      data: { deleted: `/${key}` },
    };
  }

  async _resolveKey(workspaceId, params) {
    const explicitPath = sanitizeKey(params.path || params.filePath || '');
    if (explicitPath) return explicitPath;

    const fileId = params.fileId || params.id;
    if (!fileId) return null;

    const objects = await s3.listFiles(workspaceId, '');
    const match = objects.find((obj) => hashId(obj.key) === fileId);
    return match?.key || null;
  }
}

module.exports = { WorkspaceDriveAdapter };
