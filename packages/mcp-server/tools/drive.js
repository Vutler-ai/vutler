'use strict';

/**
 * Vutler Drive tools
 *
 * Tools:
 *   vutler_upload_file — Upload a file (base64-encoded content)
 *   vutler_list_files  — List files at a given path
 */

const api = require('../lib/api-client');

const driveTools = [
  // ── Upload ────────────────────────────────────────────────────────────────
  {
    name: 'vutler_upload_file',
    description:
      'Upload a file to Vutler Drive. ' +
      'The file content must be provided as a base64-encoded string. ' +
      'Returns the uploaded file metadata including its ID and URL.',
    inputSchema: {
      type: 'object',
      required: ['path', 'content_base64', 'filename'],
      properties: {
        path: {
          type: 'string',
          description: 'Destination folder path in Drive (e.g. "/reports/2025"). Defaults to root "/".',
        },
        content_base64: {
          type: 'string',
          description: 'File contents encoded as a base64 string.',
        },
        filename: {
          type: 'string',
          description: 'Name to give the file in Drive (e.g. "report.pdf").',
        },
      },
      additionalProperties: false,
    },
    async handler({ path, content_base64, filename }) {
      // Decode base64 → binary buffer and build a multipart/form-data payload
      const buffer = Buffer.from(content_base64, 'base64');
      const boundary = `----VutlerMCPBoundary${Date.now()}`;

      // Build multipart body manually (no external dependencies)
      const CRLF = '\r\n';
      const preamble =
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="path"${CRLF}${CRLF}` +
        `${path || '/'}${CRLF}` +
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
        `Content-Type: application/octet-stream${CRLF}${CRLF}`;
      const epilogue = `${CRLF}--${boundary}--${CRLF}`;

      const body = Buffer.concat([
        Buffer.from(preamble),
        buffer,
        Buffer.from(epilogue),
      ]);

      const BASE_URL = (process.env.VUTLER_API_URL || 'https://app.vutler.ai').replace(/\/$/, '');
      const API_KEY  = process.env.VUTLER_API_KEY || '';

      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Accept': 'application/json',
      };
      if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

      let response;
      try {
        response = await fetch(`${BASE_URL}/api/v1/drive/upload`, {
          method: 'POST',
          headers,
          body,
        });
      } catch (networkError) {
        throw new Error(`Network error uploading to Vutler Drive: ${networkError.message}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const detail =
          typeof data === 'object'
            ? data.message || data.error || JSON.stringify(data)
            : data;
        throw new Error(`Vutler Drive upload error ${response.status}: ${detail}`);
      }

      return data;
    },
  },

  // ── List files ────────────────────────────────────────────────────────────
  {
    name: 'vutler_list_files',
    description:
      'List files and folders stored in Vutler Drive at a given path. ' +
      'Returns file IDs, names, sizes, types, and last-modified dates. ' +
      'Use the file ID with the Drive download or delete endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Folder path to list (default: root "/").',
        },
      },
      additionalProperties: false,
    },
    async handler({ path }) {
      return api.get('/api/v1/drive/files', { path: path || '/' });
    },
  },
];

module.exports = driveTools;
