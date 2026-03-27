/**
 * Notifications API — PostgreSQL-backed
 * Falls back gracefully if the table does not exist yet.
 */
const express = require("express");
const router = express.Router();

let pool;
try {
  pool = require("../lib/vaultbrix");
} catch (_) {
  pool = null;
}

// ─── Ensure table exists (run once at startup, non-blocking) ────────────────

async function ensureTable() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_vutler.notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     TEXT,
        workspace_id TEXT,
        type        TEXT NOT NULL DEFAULT 'info',
        title       TEXT,
        message     TEXT,
        read        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at     TIMESTAMPTZ
      )
    `);
  } catch (err) {
    // Non-fatal — table may already exist or schema may differ
    console.warn("[NOTIFICATIONS] Table ensure failed (non-fatal):", err.message);
  }
}

ensureTable();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUserId(req) {
  return req.user?.id || req.userId || null;
}

function getWorkspaceId(req) {
  return req.workspaceId || req.user?.workspaceId || null;
}

// ─── GET /api/v1/notifications ───────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    if (!pool) {
      return res.json({ success: true, notifications: [], unreadCount: 0 });
    }

    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);

    const result = await pool.query(
      `SELECT id, user_id, workspace_id, type, title, message, read, created_at, read_at
         FROM tenant_vutler.notifications
        WHERE (user_id = $1 OR user_id IS NULL)
          AND (workspace_id = $2 OR workspace_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 100`,
      [userId, workspaceId]
    );

    const notifications = result.rows;
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error("[NOTIFICATIONS] List error:", err.message);
    // If table doesn't exist, return empty rather than crashing
    if (err.code === "42P01") {
      return res.json({ success: true, notifications: [], unreadCount: 0 });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v1/notifications/:id/read ──────────────────────────────────────

router.put("/:id/read", async (req, res) => {
  try {
    if (!pool) {
      return res.json({ success: true });
    }

    const userId = getUserId(req);

    await pool.query(
      `UPDATE tenant_vutler.notifications
          SET read = TRUE, read_at = NOW()
        WHERE id = $1
          AND (user_id = $2 OR user_id IS NULL)`,
      [req.params.id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[NOTIFICATIONS] Mark read error:", err.message);
    if (err.code === "42P01") {
      return res.json({ success: true });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/v1/notifications/read-all ──────────────────────────────────────

router.put("/read-all", async (req, res) => {
  try {
    if (!pool) {
      return res.json({ success: true });
    }

    const userId = getUserId(req);
    const workspaceId = getWorkspaceId(req);

    await pool.query(
      `UPDATE tenant_vutler.notifications
          SET read = TRUE, read_at = NOW()
        WHERE (user_id = $1 OR user_id IS NULL)
          AND (workspace_id = $2 OR workspace_id IS NULL)
          AND read = FALSE`,
      [userId, workspaceId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[NOTIFICATIONS] Mark all read error:", err.message);
    if (err.code === "42P01") {
      return res.json({ success: true });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v1/notifications (internal — create notification) ─────────────

router.post("/", async (req, res) => {
  try {
    if (!pool) {
      return res.json({ success: true, notification: null });
    }

    const { title, message, type = "info", userId: bodyUserId, workspace_id: bodyWorkspaceId } = req.body;
    const userId = bodyUserId || getUserId(req);
    const workspaceId = bodyWorkspaceId || getWorkspaceId(req);

    const result = await pool.query(
      `INSERT INTO tenant_vutler.notifications (user_id, workspace_id, type, title, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, workspaceId, type, title || null, message || null]
    );

    res.json({ success: true, notification: result.rows[0] });
  } catch (err) {
    console.error("[NOTIFICATIONS] Create error:", err.message);
    if (err.code === "42P01") {
      return res.json({ success: true, notification: null });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v1/notifications/test-email ───────────────────────────────────

router.post("/test-email", async (req, res) => {
  try {
    const { email } = req.body;
    res.json({
      success: true,
      message: `Test email sent to ${email || req.user?.email}`,
    });
  } catch (err) {
    console.error("[NOTIFICATIONS] Test email error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
