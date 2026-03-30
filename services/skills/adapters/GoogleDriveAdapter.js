'use strict';

const {
  listDriveFiles,
  getDriveFile,
  downloadDriveFile,
  searchDriveFiles,
} = require('../../google/googleApi');

class GoogleDriveAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || 'list';

    switch (action) {
      case 'list':
        return this._list(workspaceId, params);
      case 'search':
        return this._search(workspaceId, params);
      case 'read':
        return this._read(workspaceId, params);
      case 'download':
        return this._download(workspaceId, params);
      default:
        if (['create', 'upload', 'delete', 'update', 'move'].includes(action)) {
          return { success: false, error: 'Google Drive write access is disabled for safety. Use the internal Vutler Drive for file storage.' };
        }
        return { success: false, error: `Unknown google drive action: "${action}"` };
    }
  }

  async _list(workspaceId, params) {
    const result = await listDriveFiles(workspaceId, {
      pageSize: params.pageSize || 20,
      pageToken: params.pageToken,
      orderBy: params.orderBy,
    });

    return {
      success: true,
      data: {
        files: (result.files || []).map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size,
          webViewLink: file.webViewLink,
        })),
        nextPageToken: result.nextPageToken,
      },
    };
  }

  async _search(workspaceId, params) {
    const query = params.searchQuery || params.query || params.q;
    if (!query) return { success: false, error: 'searchQuery is required' };

    const result = await searchDriveFiles(workspaceId, {
      searchQuery: query,
      mimeType: params.mimeType,
    });

    return {
      success: true,
      data: {
        files: (result.files || []).map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size,
          webViewLink: file.webViewLink,
        })),
        nextPageToken: result.nextPageToken,
      },
    };
  }

  async _read(workspaceId, params) {
    const fileId = params.fileId || params.id;
    if (!fileId) return { success: false, error: 'fileId is required' };

    const file = await getDriveFile(workspaceId, { fileId });
    return {
      success: true,
      data: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        size: file.size,
        webViewLink: file.webViewLink,
        description: file.description,
        owners: (file.owners || []).map((owner) => owner.emailAddress),
      },
    };
  }

  async _download(workspaceId, params) {
    const fileId = params.fileId || params.id;
    if (!fileId) return { success: false, error: 'fileId is required' };

    const content = await downloadDriveFile(workspaceId, { fileId });
    const text = typeof content === 'string'
      ? content
      : Buffer.isBuffer(content)
        ? content.toString('utf-8')
        : JSON.stringify(content);

    return {
      success: true,
      data: { fileId, content: text.substring(0, 50000) },
    };
  }
}

module.exports = { GoogleDriveAdapter };
