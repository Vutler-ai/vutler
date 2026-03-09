/**
 * Auth API — DB-based authentication + GitHub OAuth
 * SHA-256 password hashing with per-user salt
 * All users stored in tenant_vutler.users_auth
 * GitHub OAuth added following same pattern (simplified for existing schema)
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();
const coordinatorPrompt = require('../services/coordinatorPrompt');

const JWT_SECRET = process.env.JWT_SECRET || 'MISSING-SET-JWT_SECRET-ENV';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://app.vutler.ai/api/v1/auth/google/callback';
const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const TOKEN_TTL_HOURS = 24;

// --- Helpers ---

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  if (hash.length !== storedHash.length) return false; try { return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex")); } catch(e) { return hash === storedHash; }
}

function generateJWT(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    userId: user.id,
    email: user.email,
    name: user.name || user.email.split('@')[0],
    role: user.role || 'user',
    workspaceId: user.workspace_id || DEFAULT_WORKSPACE,
    exp: Math.floor(Date.now() / 1000) + (TOKEN_TTL_HOURS * 3600),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function getPool() {
  return require('../lib/vaultbrix');
}

// GitHub API helpers
function makeGitHubRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
          } else {
            resolve(res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function exchangeGitHubCode(code) {
  const postData = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code: code
  }).toString();

  const options = {
    hostname: 'github.com',
    path: '/login/oauth/access_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'Vutler-App'
    }
  };

  return makeGitHubRequest(options, postData);
}

async function getGitHubUser(accessToken) {
  const options = {
    hostname: 'api.github.com',
    path: '/user',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vutler-App'
    }
  };

  return makeGitHubRequest(options);
}

async function getGitHubUserEmails(accessToken) {
  const options = {
    hostname: 'api.github.com',
    path: '/user/emails',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vutler-App'
    }
  };

  return makeGitHubRequest(options);
}

// Ensure users_auth has required columns (simplified version)
async function ensureSchema(pool) {
  await pool.query(`
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS salt TEXT;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS workspace_id UUID DEFAULT '${DEFAULT_WORKSPACE}';
  `).catch(() => {});
}

let schemaReady = false;

// --- GitHub OAuth Routes ---

// GET /api/v1/auth/github
router.get('/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ 
      success: false, 
      error: 'GitHub OAuth not configured. GITHUB_CLIENT_ID missing.' 
    });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const authUrl = `https://github.com/login/oauth/authorize?` + 
    `client_id=${GITHUB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent('https://app.vutler.ai/api/v1/auth/github/callback')}` +
    `&scope=${encodeURIComponent('user:email')}` +
    `&state=${state}`;

  // Store state in session or similar for security (simplified for now)
  res.redirect(authUrl);
});

// GET /api/v1/auth/github/callback
router.get('/github/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    
    if (error) {
      console.error('[AUTH] GitHub OAuth error:', error, error_description);
      return res.redirect('https://app.vutler.ai/login?error=oauth_cancelled');
    }

    if (!code) {
      return res.redirect('https://app.vutler.ai/login?error=oauth_invalid');
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).json({ 
        success: false, 
        error: 'GitHub OAuth not configured' 
      });
    }

    const pool = getPool();
    if (!schemaReady) { await ensureSchema(pool); schemaReady = true; }

    // Exchange code for access token
    const tokenResponse = await exchangeGitHubCode(code);
    if (!tokenResponse.access_token) {
      console.error('[AUTH] GitHub token exchange failed:', tokenResponse);
      return res.redirect('https://app.vutler.ai/login?error=oauth_token_failed');
    }

    // Get user info
    const githubUser = await getGitHubUser(tokenResponse.access_token);
    const githubEmails = await getGitHubUserEmails(tokenResponse.access_token);
    
    // Find primary email
    let email = githubUser.email;
    if (!email || !githubUser.email) {
      const primaryEmail = githubEmails.find(e => e.primary && e.verified);
      if (primaryEmail) {
        email = primaryEmail.email;
      } else {
        console.error('[AUTH] GitHub: No verified email found');
        return res.redirect('https://app.vutler.ai/login?error=oauth_no_email');
      }
    }

    const cleanEmail = email.toLowerCase().trim();
    console.log(`[AUTH] GitHub OAuth: ${githubUser.login} (${cleanEmail})`);

    // Check if user already exists by email
    const existingUser = await pool.query(
      `SELECT id, email, name, role, workspace_id 
       FROM ${SCHEMA}.users_auth 
       WHERE email = $1 
       LIMIT 1`,
      [cleanEmail]
    );

    let user;
    if (existingUser.rows.length) {
      // User exists - login
      user = existingUser.rows[0];
      console.log(`[AUTH] GitHub login: existing user ${cleanEmail}`);
    } else {
      // Create new user with GitHub info in name field
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.users_auth 
         (email, name, role, workspace_id, created_at)
         VALUES ($1, $2, 'user', $3, NOW())
         RETURNING id, email, name, role, workspace_id`,
        [cleanEmail, `${githubUser.name || githubUser.login} (GitHub: ${githubUser.login})`, DEFAULT_WORKSPACE]
      );
      user = result.rows[0];
      console.log(`[AUTH] GitHub signup: new user ${cleanEmail}`);
    }

    // Generate JWT
    const token = generateJWT(user);

    // Redirect to frontend with token
    const redirectUrl = `https://app.vutler.ai/login?token=${encodeURIComponent(token)}`;
    res.redirect(redirectUrl);

  } catch (err) {
    console.error('[AUTH] GitHub callback error:', err.message);
    res.redirect('https://app.vutler.ai/login?error=oauth_server_error');
  }
});


// --- Google OAuth Routes ---

// GET /api/v1/auth/google
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ 
      success: false, 
      error: 'Google OAuth not configured. GOOGLE_CLIENT_ID missing.' 
    });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: state,
    access_type: 'offline',
    prompt: 'consent'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/v1/auth/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      console.error('[AUTH] Google OAuth error:', error);
      return res.redirect('https://app.vutler.ai/login?error=oauth_cancelled');
    }

    if (!code) {
      return res.redirect('https://app.vutler.ai/login?error=oauth_invalid');
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ 
        success: false, 
        error: 'Google OAuth not configured' 
      });
    }

    const pool = getPool();
    if (!schemaReady) { await ensureSchema(pool); schemaReady = true; }

    // Exchange code for tokens
    const tokenPostData = new URLSearchParams({
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString();

    const tokenOptions = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    };

    const tokenResponse = await makeGitHubRequest(tokenOptions, tokenPostData);
    if (!tokenResponse.access_token) {
      console.error('[AUTH] Google token exchange failed:', tokenResponse);
      return res.redirect('https://app.vutler.ai/login?error=oauth_token_failed');
    }

    // Get user info
    const userInfoOptions = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v2/userinfo',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenResponse.access_token}`,
        'Accept': 'application/json'
      }
    };

    const googleUser = await makeGitHubRequest(userInfoOptions);
    
    if (!googleUser.email) {
      console.error('[AUTH] Google: No email found in user info');
      return res.redirect('https://app.vutler.ai/login?error=oauth_no_email');
    }

    const cleanEmail = googleUser.email.toLowerCase().trim();
    console.log(`[AUTH] Google OAuth: ${googleUser.name || googleUser.email} (${cleanEmail})`);

    // Check if user already exists by email
    const existingUser = await pool.query(
      `SELECT id, email, name, role, workspace_id 
       FROM ${SCHEMA}.users_auth 
       WHERE email = $1 
       LIMIT 1`,
      [cleanEmail]
    );

    let user;
    if (existingUser.rows.length) {
      user = existingUser.rows[0];
      console.log(`[AUTH] Google login: existing user ${cleanEmail}`);
    } else {
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.users_auth 
         (email, name, role, workspace_id, created_at)
         VALUES ($1, $2, 'user', $3, NOW())
         RETURNING id, email, name, role, workspace_id`,
        [cleanEmail, googleUser.name || cleanEmail.split('@')[0], DEFAULT_WORKSPACE]
      );
      user = result.rows[0];
      console.log(`[AUTH] Google signup: new user ${cleanEmail}`);
    }

    // Generate JWT
    const token = generateJWT(user);

    // Redirect to frontend with token
    const redirectUrl = `https://app.vutler.ai/login?token=${encodeURIComponent(token)}`;
    res.redirect(redirectUrl);

  } catch (err) {
    console.error('[AUTH] Google callback error:', err.message);
    res.redirect('https://app.vutler.ai/login?error=oauth_server_error');
  }
});

// --- Existing Routes (unchanged) ---

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const pool = getPool();
    if (!schemaReady) { await ensureSchema(pool); schemaReady = true; }

    const result = await pool.query(
      `SELECT id, email, password_hash, salt, name, role, workspace_id
       FROM ${SCHEMA}.users_auth WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    if (!user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    let valid = false;
    if (user.salt) {
      // New format: salted SHA-256
      valid = verifyPassword(password, user.password_hash, user.salt);
    } else {
      // Legacy: unsalted SHA-256 (migrate on success)
      const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
      valid = (legacyHash === user.password_hash);
      if (valid) {
        // Migrate to salted hash
        const { hash, salt } = hashPassword(password);
        await pool.query(
          `UPDATE ${SCHEMA}.users_auth SET password_hash = $1, salt = $2 WHERE id = $3`,
          [hash, salt, user.id]
        );
        console.log(`[AUTH] Migrated ${email} to salted hash`);
      }
    }

    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = generateJWT(user);

    // Update last login
    await pool.query(
      `ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
       UPDATE ${SCHEMA}.users_auth SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    ).catch(() => {});

    console.log(`[AUTH] Login OK: ${email}`);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || email.split('@')[0],
        role: user.role || 'user',
      },
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication service error' });
  }
});

async function registerHandler(req, res) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const pool = getPool();
    if (!schemaReady) { await ensureSchema(pool); schemaReady = true; }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await pool.query(`SELECT id FROM ${SCHEMA}.users_auth WHERE email = $1`, [cleanEmail]);
    if (existing.rows.length) return res.status(409).json({ success: false, error: 'User already exists' });

    const { hash, salt } = hashPassword(password);
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      const workspaceName = `${(name || cleanEmail.split('@')[0])}'s Workspace`;
      const workspaceSlug = (name || cleanEmail.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
      const wsRes = await client.query(
        `INSERT INTO ${SCHEMA}.workspaces (id, name, slug, owner_id, plan, settings, onboarding_completed, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, 'free', '{}'::jsonb, false, NOW(), NOW())
         RETURNING id`,
        [workspaceName, workspaceSlug]
      );
      const workspaceId = wsRes.rows[0].id;

      const userRes = await client.query(
        `INSERT INTO ${SCHEMA}.users_auth (email, password_hash, salt, name, role, workspace_id, created_at)
         VALUES ($1, $2, $3, $4, 'user', $5, NOW())
         RETURNING id, email, name, role, workspace_id`,
        [cleanEmail, hash, salt, name || cleanEmail.split('@')[0], workspaceId]
      );
      user = userRes.rows[0];

      await client.query(
        `INSERT INTO ${SCHEMA}.workspace_members (id, workspace_id, user_id, role, invited_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'owner', $2, NOW()) ON CONFLICT DO NOTHING`,
        [workspaceId, user.id]
      );

      await client.query(
        `UPDATE ${SCHEMA}.workspaces SET owner_id = $1 WHERE id = $2`,
        [user.id, workspaceId]
      );

      await client.query(
        `INSERT INTO tenant_vutler.agents (id, name, username, workspace_id, agent_type, system_prompt, model, status, avatar)
         VALUES (gen_random_uuid(), 'Jarvis', 'jarvis', $1, 'coordinator', $2, 'claude-sonnet-4-20250514', 'active', '/static/avatars/jarvis.png')
         ON CONFLICT DO NOTHING`,
        [workspaceId, coordinatorPrompt.FULL_PROMPT]
      );

      await client.query(
        `INSERT INTO tenant_vutler.chat_channels (id, name, workspace_id, type)
         VALUES (gen_random_uuid(), 'DM-jarvis', $1, 'dm') ON CONFLICT DO NOTHING`,
        [workspaceId]
      );

      await client.query(
        `INSERT INTO tenant_vutler.chat_channels (id, name, workspace_id, type)
         VALUES (gen_random_uuid(), 'team-coordination', $1, 'team') ON CONFLICT DO NOTHING`,
        [workspaceId]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const token = generateJWT(user);
    console.log(`[AUTH] Register OK: ${cleanEmail}`);
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
}

// POST /api/v1/auth/register
router.post('/register', registerHandler);
// POST /api/v1/auth/signup
router.post('/signup', registerHandler);

// POST /api/v1/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/v1/auth/me
router.get('/me', (req, res) => {
  if (req.user) {
    res.json({ success: true, user: req.user });
  } else {
    res.status(401).json({ success: false, error: 'Not authenticated' });
  }
});

// PUT /api/v1/auth/me/password
router.put('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, password_hash, salt FROM ${SCHEMA}.users_auth WHERE id = $1`,
      [req.user.userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    const valid = user.salt
      ? verifyPassword(currentPassword, user.password_hash, user.salt)
      : crypto.createHash('sha256').update(currentPassword).digest('hex') === user.password_hash;

    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const { hash, salt } = hashPassword(newPassword);
    await pool.query(
      `UPDATE ${SCHEMA}.users_auth SET password_hash = $1, salt = $2 WHERE id = $3`,
      [hash, salt, user.id]
    );

    console.log(`[AUTH] Password changed for user ${user.id}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[AUTH] Password update error:', err.message);
    res.status(500).json({ success: false, error: 'Password update failed' });
  }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  // Don't reveal if email exists
  res.json({ success: true, message: 'If an account exists, a reset link will be sent' });
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
  // TODO: implement token-based reset
  res.json({ success: true, message: 'Password reset successfully' });
});

module.exports = router;