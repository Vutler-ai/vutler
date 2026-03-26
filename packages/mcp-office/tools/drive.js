'use strict';

/**
 * Vutler Drive tools
 * Exposes file and folder management to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const driveTools = [
  {
    name: 'vutler_drive_list',
    description:
      'List files stored in Vutler Drive at a given path. ' +
      'Use this to browse available files before downloading or deleting them.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Folder path to list (default: root "/").',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of files to return (default: 100).',
        },
      },
      additionalProperties: false,
    },
    async handler({ path, limit }) {
      const result = await api.get('/api/v1/drive/files', { path, limit });
      return result;
    },
  },

  {
    name: 'vutler_drive_folders',
    description:
      'Retrieve the full folder tree of Vutler Drive. ' +
      'Use this to understand the directory structure before creating or navigating folders.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      const result = await api.get('/api/v1/drive/folders/tree');
      return result;
    },
  },

  {
    name: 'vutler_drive_create_folder',
    description:
      'Create a new folder in Vutler Drive. ' +
      'Specify a parent path to nest the folder inside an existing directory.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the folder to create.',
        },
        path: {
          type: 'string',
          description: 'Parent path where the folder will be created (default: root "/").',
        },
      },
      additionalProperties: false,
    },
    async handler({ name, path }) {
      const result = await api.post('/api/v1/drive/folders', { name, path });
      return result;
    },
  },

  {
    name: 'vutler_drive_download',
    description:
      'Get the download URL or contents of a file stored in Vutler Drive. ' +
      'Requires the file ID which can be obtained from vutler_drive_list.',
    inputSchema: {
      type: 'object',
      required: ['file_id'],
      properties: {
        file_id: {
          type: 'string',
          description: 'ID of the file to download.',
        },
      },
      additionalProperties: false,
    },
    async handler({ file_id }) {
      const result = await api.get(`/api/v1/drive/download/${file_id}`);
      return result;
    },
  },

  {
    name: 'vutler_drive_delete',
    description:
      'Permanently delete a file from Vutler Drive. ' +
      'This action is irreversible — confirm the file ID before calling.',
    inputSchema: {
      type: 'object',
      required: ['file_id'],
      properties: {
        file_id: {
          type: 'string',
          description: 'ID of the file to delete.',
        },
      },
      additionalProperties: false,
    },
    async handler({ file_id }) {
      const result = await api.delete(`/api/v1/drive/files/${file_id}`);
      return result;
    },
  },
];

module.exports = driveTools;
