/**
 * Vutler Drive-Chat API - VDrive Integration with Vchat
 * Handles file sharing, encrypted uploads, and chat integration
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, param, query, validationResult } = require('express-validator');
const { CryptoService } = require('../services/crypto');

const router = express.Router();
const cryptoService = new CryptoService();

// Configure multer for encrypted file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/encrypted');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use UUID for encrypted filename
    const fileId = cryptoService.generateId();
    cb(null, `${fileId}.enc`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for encrypted storage
    cb(null, true);
  }
});

// Middleware to authenticate user
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  
  // Mock user data - in production, validate JWT
  req.user = {
    id: 'user_123',
    workspaceId: 'workspace_456'
  };
  
  next();
};

/**
 * POST /api/v1/vdrive/upload - Upload encrypted file
 */
router.post('/upload', [
  authenticateUser,
  upload.single('file')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    const userId = req.user.id;
    const workspaceId = req.user.workspaceId;

    const fileData = {
      id: cryptoService.generateId(),
      fileId: metadata.fileId || cryptoService.generateId(),
      userId: userId,
      workspaceId: workspaceId,
      filename: metadata.encryptedFilename || req.file.originalname,
      originalFilename: req.file.originalname,
      size: metadata.originalSize || req.file.size,
      mimeType: metadata.mimeType || req.file.mimetype,
      encryptedPath: req.file.path,
      encryptionEnabled: metadata.encryptionEnabled || false,
      encryptedMetadata: metadata.encryptedMetadata,
      fileKeyEncrypted: metadata.fileKey,
      uploadCompleted: true,
      createdAt: new Date().toISOString()
    };

    // TODO: Store in PostgreSQL database
    console.log('File uploaded:', fileData);

    // Generate thumbnail/preview if possible
    let preview = null;
    if (fileData.mimeType.startsWith('image/') && !fileData.encryptionEnabled) {
      preview = await generateImagePreview(req.file.path);
    }

    res.json({
      success: true,
      fileId: fileData.fileId,
      filename: fileData.filename,
      size: fileData.size,
      uploadStatus: 'completed',
      encryptionStatus: fileData.encryptionEnabled ? 'encrypted' : 'plain',
      preview: preview,
      uploadedAt: fileData.createdAt
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/vdrive/files - List user files (optionally filtered by chat)
 */
router.get('/files', [
  authenticateUser,
  query('chatId').optional().isString(),
  query('type').optional().isIn(['image', 'document', 'video', 'audio']),
  query('encrypted_only').optional().isBoolean(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { chatId, type, encrypted_only, limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;

    // TODO: Query PostgreSQL with filters
    // Mock data for now
    const mockFiles = [
      {
        id: '1',
        fileId: 'file-uuid-1',
        filename: 'rapport_mensuel.pdf',
        size: 1048576,
        mimeType: 'application/pdf',
        encryptionStatus: 'encrypted',
        sharedBy: {
          userId: userId,
          username: 'john.doe',
          avatar: null
        },
        sharedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        permissions: {
          read: true,
          download: true,
          share: false
        },
        chatId: chatId
      },
      {
        id: '2',
        fileId: 'file-uuid-2',
        filename: 'presentation.pptx',
        size: 2097152,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        encryptionStatus: 'encrypted',
        sharedBy: {
          userId: userId,
          username: 'john.doe',
          avatar: null
        },
        sharedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        permissions: {
          read: true,
          download: true,
          share: true
        },
        chatId: chatId
      }
    ];

    // Apply filters
    let filteredFiles = mockFiles.filter(file => {
      if (chatId && file.chatId !== chatId) return false;
      if (type && !file.mimeType.startsWith(getTypePrefix(type))) return false;
      if (encrypted_only === 'true' && file.encryptionStatus !== 'encrypted') return false;
      return true;
    });

    // Apply pagination
    const paginatedFiles = filteredFiles.slice(offset, offset + limit);

    res.json({
      success: true,
      files: paginatedFiles,
      total: filteredFiles.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: offset + limit < filteredFiles.length
    });

  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      error: 'Failed to list files',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/vdrive/files/:fileId/download - Download file with decryption
 */
router.get('/files/:fileId/download', [
  authenticateUser,
  param('fileId').isUUID().withMessage('Valid file ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fileId } = req.params;
    const userId = req.user.id;

    // TODO: Get file from database
    // Mock file data
    const fileData = {
      fileId: fileId,
      userId: userId,
      filename: 'document.pdf',
      encryptedPath: '/tmp/encrypted_file.enc',
      encryptionEnabled: true,
      fileKeyEncrypted: 'base64_encrypted_file_key',
      mimeType: 'application/pdf',
      size: 1048576
    };

    if (fileData.encryptionEnabled) {
      // Decrypt file before sending
      const decryptedPath = await decryptFile(fileData);
      
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);
      res.setHeader('X-Encryption-Status', 'decrypted');
      res.setHeader('X-Original-Size', fileData.size.toString());
      
      const stream = fs.createReadStream(decryptedPath);
      stream.pipe(res);
      
      // Clean up decrypted file after sending
      stream.on('end', () => {
        fs.unlink(decryptedPath, () => {});
      });
      
    } else {
      // Send file directly
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);
      
      const stream = fs.createReadStream(fileData.encryptedPath);
      stream.pipe(res);
    }

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Download failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/vdrive/files/:fileId/share-in-chat - Share file in chat
 */
router.post('/files/:fileId/share-in-chat', [
  authenticateUser,
  param('fileId').isUUID().withMessage('Valid file ID required'),
  body('chatId').notEmpty().withMessage('Chat ID required'),
  body('permissions').optional().isObject(),
  body('message').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fileId } = req.params;
    const { chatId, permissions = {}, message } = req.body;
    const userId = req.user.id;

    const defaultPermissions = {
      read: true,
      download: false,
      expires: null
    };

    const shareData = {
      id: cryptoService.generateId(),
      fileId: fileId,
      chatId: chatId,
      userId: userId,
      permissions: { ...defaultPermissions, ...permissions },
      message: message,
      sharedAt: new Date().toISOString()
    };

    // TODO: Store in PostgreSQL database
    console.log('File shared in chat:', shareData);

    // Generate preview for chat display
    const preview = await generateFilePreview(fileId);

    // Notify chat participants (WebSocket integration)
    await notifyFileShared(chatId, {
      fileId: fileId,
      sharedBy: userId,
      message: message,
      preview: preview,
      permissions: shareData.permissions
    });

    res.json({
      success: true,
      shareId: shareData.id,
      sharedAt: shareData.sharedAt,
      permissions: shareData.permissions,
      preview: preview
    });

  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({
      error: 'Share failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/vdrive/chat/:chatId/files - Get files shared in a specific chat
 */
router.get('/chat/:chatId/files', [
  authenticateUser,
  param('chatId').notEmpty().withMessage('Chat ID required'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // TODO: Query PostgreSQL for files shared in this chat
    // Mock data
    const sharedFiles = [
      {
        id: 'share-1',
        fileId: 'file-uuid-1',
        filename: 'budget_q1.xlsx',
        size: 524288,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sharedBy: {
          userId: 'user_456',
          username: 'jane.smith',
          avatar: null
        },
        sharedAt: new Date().toISOString(),
        permissions: {
          read: true,
          download: true
        },
        preview: {
          type: 'text',
          content: 'Fichier Excel - Budget Q1 2026'
        },
        encryptionStatus: 'encrypted'
      }
    ];

    res.json({
      success: true,
      files: sharedFiles,
      chatId: chatId,
      total: sharedFiles.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get chat files error:', error);
    res.status(500).json({
      error: 'Failed to get chat files',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/vdrive/files/:fileId/preview - Generate file preview
 */
router.get('/files/:fileId/preview', [
  authenticateUser,
  param('fileId').isUUID().withMessage('Valid file ID required'),
  query('size').optional().isIn(['thumbnail', 'small', 'medium', 'large']),
  query('page').optional().isInt({ min: 1 }),
  query('decrypt').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fileId } = req.params;
    const { size = 'medium', page = 1, decrypt = 'false' } = req.query;

    // TODO: Get file info from database
    const fileData = {
      fileId: fileId,
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      encryptionEnabled: true
    };

    let preview = null;

    if (fileData.mimeType.startsWith('image/')) {
      preview = await generateImagePreview(fileId, size, decrypt === 'true');
    } else if (fileData.mimeType === 'application/pdf') {
      preview = await generatePDFPreview(fileId, page, decrypt === 'true');
    } else if (fileData.mimeType.startsWith('text/')) {
      preview = await generateTextPreview(fileId, decrypt === 'true');
    } else {
      preview = {
        type: 'icon',
        content: getFileIcon(fileData.mimeType),
        filename: fileData.filename
      };
    }

    res.json({
      success: true,
      preview: preview,
      fileId: fileId,
      generatedAt: new Date().toISOString(),
      cacheExpires: new Date(Date.now() + 3600000).toISOString() // 1 hour cache
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({
      error: 'Preview generation failed',
      message: error.message
    });
  }
});

/**
 * PUT /api/v1/vdrive/files/:fileId/permissions - Update file permissions
 */
router.put('/files/:fileId/permissions', [
  authenticateUser,
  param('fileId').isUUID().withMessage('Valid file ID required'),
  body('permissions').isObject().withMessage('Permissions object required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fileId } = req.params;
    const { permissions } = req.body;
    const userId = req.user.id;

    // TODO: Update permissions in database
    console.log(`Updating permissions for file ${fileId}:`, permissions);

    res.json({
      success: true,
      fileId: fileId,
      permissions: permissions,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({
      error: 'Failed to update permissions',
      message: error.message
    });
  }
});

// Helper functions

async function decryptFile(fileData) {
  // TODO: Implement file decryption
  // 1. Decrypt file key with user's master key
  // 2. Decrypt file content with file key
  // 3. Return path to decrypted temp file
  return '/tmp/decrypted_' + Date.now();
}

async function generateFilePreview(fileId) {
  // TODO: Generate appropriate preview based on file type
  return {
    type: 'generic',
    content: '📄 Document partagé',
    fileId: fileId
  };
}

async function generateImagePreview(fileIdOrPath, size = 'medium', decrypt = false) {
  // TODO: Generate image thumbnail
  return {
    type: 'image',
    content: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...', // Base64 thumbnail
    size: size
  };
}

async function generatePDFPreview(fileId, page = 1, decrypt = false) {
  // TODO: Generate PDF page thumbnail
  return {
    type: 'pdf',
    content: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...', // Base64 page image
    page: page,
    totalPages: 10
  };
}

async function generateTextPreview(fileId, decrypt = false) {
  // TODO: Generate text preview (first 500 chars)
  return {
    type: 'text',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit...',
    truncated: true
  };
}

async function notifyFileShared(chatId, fileData) {
  // TODO: Send WebSocket notification to chat participants
  console.log(`Notifying chat ${chatId} about shared file:`, fileData);
}

function getFileIcon(mimeType) {
  const icons = {
    'application/pdf': '📄',
    'image/': '🖼️',
    'video/': '🎥',
    'audio/': '🎵',
    'application/zip': '🗜️',
    'text/': '📝'
  };
  
  for (const [type, icon] of Object.entries(icons)) {
    if (mimeType.startsWith(type)) return icon;
  }
  
  return '📄';
}

function getTypePrefix(type) {
  const prefixes = {
    'image': 'image/',
    'video': 'video/', 
    'audio': 'audio/',
    'document': 'application/'
  };
  
  return prefixes[type] || '';
}

module.exports = router;