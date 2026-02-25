// routes/drive.js - kDrive API proxy for Infomaniak
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');

// kDrive configuration
const KDRIVE_ID = '2021270';
const API_TOKEN = 'OheQafprqMcahEN8NlprZZRENGU1xyXr23KXxWEClsVUnQr53dzQddcOCH6qqax38uzBfsBftnwzLY7i';
const KDRIVE_API_BASE = `https://api.infomaniak.com/2/drive/${KDRIVE_ID}`;

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Helper: Make authenticated kDrive API request
async function kDriveRequest(endpoint, options = {}) {
  const url = `${KDRIVE_API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${API_TOKEN}`,
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`kDrive API error: ${response.status} ${error}`);
  }

  return response.json();
}

// GET /api/v1/drive/files - List files (with optional path for subdirectories)
router.get('/files', async (req, res) => {
  try {
    const { path = '/', directory_id } = req.query;

    let endpoint = '/files';
    const params = new URLSearchParams();

    if (directory_id) {
      params.append('directory_id', directory_id);
    } else if (path && path !== '/') {
      // If path provided, first resolve it to directory_id
      // For simplicity, we'll use the root directory by default
      // In production, you'd want to implement path resolution
      params.append('path', path);
    }

    const queryString = params.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }

    const data = await kDriveRequest(endpoint);

    res.json({
      success: true,
      files: data.data || [],
      pagination: data.pagination || {}
    });
  } catch (error) {
    console.error('Error listing kDrive files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/drive/files/:id/download - Proxy file download
router.get('/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

    const url = `${KDRIVE_API_BASE}/files/${id}/download`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get filename from Content-Disposition header
    const disposition = response.headers.get('content-disposition');
    const filename = disposition
      ? disposition.split('filename=')[1]?.replace(/"/g, '')
      : `file-${id}`;

    // Proxy the file stream
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    response.body.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/drive/files/upload - Upload file to kDrive
router.post('/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const { directory_id = 'root', filename } = req.body;
    const uploadFilename = filename || req.file.originalname;

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: uploadFilename,
      contentType: req.file.mimetype
    });
    formData.append('directory_id', directory_id);
    formData.append('file_name', uploadFilename);

    // Make upload request
    const url = `${KDRIVE_API_BASE}/upload`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} ${error}`);
    }

    const data = await response.json();

    res.status(201).json({
      success: true,
      file: data.data || data
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/drive/files/:id - Get file metadata
router.get('/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await kDriveRequest(`/files/${id}`);

    res.json({
      success: true,
      file: data.data || data
    });
  } catch (error) {
    console.error('Error fetching file metadata:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/v1/drive/files/:id - Delete file
router.delete('/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await kDriveRequest(`/files/${id}`, {
      method: 'DELETE'
    });

    res.json({
      success: true,
      message: 'File deleted',
      data: data.data || data
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
