/**
 * Settings API
 * User and workspace settings
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/settings
router.get("/", async (req, res) => {
  try {
    // Return default settings for now
    res.json({
      success: true,
      settings: {
        theme: "dark",
        language: "en",
        notifications: true,
        workspace: req.workspaceId || "00000000-0000-0000-0000-000000000001"
      }
    });
  } catch (err) {
    console.error("[SETTINGS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings
router.put("/", async (req, res) => {
  try {
    const updates = req.body;
    // In production, save to database
    res.json({ success: true, settings: updates });
  } catch (err) {
    console.error("[SETTINGS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/notifications
router.get("/notifications", async (req, res) => {
  try {
    const settings = {
      email: req.user?.email,
      settings: {
        emailEnabled: true,
        pushEnabled: false,
        digestEnabled: true,
        mentionsOnly: false
      }
    };
    
    res.json({ success: true, ...settings });
  } catch (err) {
    console.error("[SETTINGS] Get notifications error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings/notifications
router.put("/notifications", async (req, res) => {
  try {
    const { email, settings } = req.body;
    
    // In production, save to database
    res.json({ 
      success: true, 
      message: "Notification settings updated",
      email,
      settings
    });
  } catch (err) {
    console.error("[SETTINGS] Update notifications error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
