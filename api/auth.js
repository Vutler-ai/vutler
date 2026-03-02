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

module.exports = router;
