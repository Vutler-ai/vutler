/**
 * Drive API
 * File storage and management
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/drive/files
router.get("/files", async (req, res) => {
  try {
    const { path = '/' } = req.query;
    
    // Mock file listing based on path
    const files = [
      {
        id: '1',
        name: 'Document.pdf',
        type: 'file',
        size: 1024000,
        path: path,
        modifiedAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Images',
        type: 'folder',
        path: path,
        modifiedAt: new Date().toISOString()
      }
    ];
    
    res.json({ success: true, files, path });
  } catch (err) {
    console.error("[DRIVE] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/drive/upload
router.post("/upload", async (req, res) => {
  res.json({ success: true, fileId: "file-" + Date.now() });
});

// GET /api/v1/drive/download/:id
router.get("/download/:id", async (req, res) => {
  res.status(404).json({ success: false, error: "File not found" });
});

module.exports = router;
