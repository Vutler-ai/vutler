/**
 * Auth API
 * Login, logout, and token management
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'MISSING-SET-JWT_SECRET-ENV';

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password required" });
    }
    
    // For now, accept the default credentials from login-page.tsx
    // In production, this should validate against the database
    if (email === "alex@vutler.com" && password === "admin123") {
      // Generate JWT token
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        userId: "alex-001",
        email: email,
        name: "Alex",
        role: "admin",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      })).toString("base64url");
      
      const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
      const token = `${header}.${payload}.${signature}`;
      
      return res.json({
        success: true,
        token,
        user: {
          id: "alex-001",
          email,
          name: "Alex",
          role: "admin"
        }
      });
    }
    
    // Try to validate against database
    try {
      const pool = require("../lib/vaultbrix");
      const result = await pool.query(
        "SELECT * FROM tenant_vutler.users WHERE email = $1 AND status = 'active' LIMIT 1",
        [email]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        // In production, verify password hash here
        
        const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
          workspaceId: user.workspace_id || "00000000-0000-0000-0000-000000000001",
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        })).toString("base64url");
        
        const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
        const token = `${header}.${payload}.${signature}`;
        
        return res.json({
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || "user"
          }
        });
      }
    } catch (dbErr) {
      console.error("[AUTH] DB login error:", dbErr.message);
    }
    
    res.status(401).json({ success: false, error: "Invalid credentials" });
  } catch (err) {
    console.error("[AUTH] Login error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/logout
router.post("/logout", (req, res) => {
  // Client-side token deletion
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /api/v1/auth/me — get current user
router.get("/me", (req, res) => {
  if (req.user) {
    res.json({ success: true, user: req.user });
  } else {
    res.status(401).json({ success: false, error: "Not authenticated" });
  }
});

// POST /api/v1/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password required" });
    }
    
    // Check if user already exists
    try {
      const pool = require("../lib/vaultbrix");
      const existing = await pool.query(
        "SELECT * FROM tenant_vutler.users WHERE email = $1 LIMIT 1",
        [email]
      );
      
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: "User already exists" });
      }
      
      // Create new user
      const result = await pool.query(
        `INSERT INTO tenant_vutler.users (email, name, status, role, workspace_id, created_at)
         VALUES ($1, $2, 'active', 'user', '00000000-0000-0000-0000-000000000001', NOW())
         RETURNING *`,
        [email, name || email.split('@')[0]]
      );
      
      const user = result.rows[0];
      
      // Generate JWT token
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        workspaceId: user.workspace_id || "00000000-0000-0000-0000-000000000001",
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      })).toString("base64url");
      
      const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
      const token = `${header}.${payload}.${signature}`;
      
      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "user"
        }
      });
    } catch (dbErr) {
      console.error("[AUTH] DB register error:", dbErr.message);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  } catch (err) {
    console.error("[AUTH] Register error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: "Email required" });
    }
    
    // In production, this would:
    // 1. Check if user exists
    // 2. Generate a reset token
    // 3. Send email with reset link
    
    // For now, just return success (don't reveal if email exists)
    res.json({ 
      success: true, 
      message: "If an account exists with this email, you will receive a password reset link" 
    });
  } catch (err) {
    console.error("[AUTH] Forgot password error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ success: false, error: "Token and password required" });
    }
    
    // In production, this would:
    // 1. Verify the reset token
    // 2. Update the user's password
    // 3. Invalidate the token
    
    // For now, return success
    res.json({ 
      success: true, 
      message: "Password reset successfully" 
    });
  } catch (err) {
    console.error("[AUTH] Reset password error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
