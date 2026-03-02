/**
 * Notifications API
 */
const express = require("express");
const router = express.Router();

// In-memory store for notifications (replace with DB in production)
let notifications = [];
let nextId = 1;

// GET /api/v1/notifications
router.get("/", async (req, res) => {
  try {
    const userNotifications = notifications
      .filter(n => n.userId === req.userId || !n.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ 
      success: true, 
      notifications: userNotifications,
      unreadCount: userNotifications.filter(n => !n.read).length
    });
  } catch (err) {
    console.error("[NOTIFICATIONS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/notifications/:id/read
router.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const notification = notifications.find(n => n.id === id);
    
    if (notification) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("[NOTIFICATIONS] Mark read error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/notifications/read-all
router.put("/read-all", async (req, res) => {
  try {
    notifications
      .filter(n => n.userId === req.userId || !n.userId)
      .forEach(n => {
        n.read = true;
        n.readAt = new Date().toISOString();
      });
    
    res.json({ success: true });
  } catch (err) {
    console.error("[NOTIFICATIONS] Mark all read error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/notifications (internal use - create notification)
router.post("/", async (req, res) => {
  try {
    const { title, message, type = 'info', userId } = req.body;
    
    const notification = {
      id: String(nextId++),
      title,
      message,
      type,
      userId: userId || req.userId,
      read: false,
      createdAt: new Date().toISOString()
    };
    
    notifications.push(notification);
    
    // Keep only last 100 notifications per user
    const userNotifications = notifications.filter(n => n.userId === (userId || req.userId));
    if (userNotifications.length > 100) {
      const toRemove = userNotifications.slice(100);
      notifications = notifications.filter(n => !toRemove.includes(n));
    }
    
    res.json({ success: true, notification });
  } catch (err) {
    console.error("[NOTIFICATIONS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
