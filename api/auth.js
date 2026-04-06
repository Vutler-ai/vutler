/**
 * Auth API — DB-based authentication + GitHub OAuth
 * SHA-256 password hashing with per-user salt
 * All users stored in tenant_vutler.users_auth
 * GitHub OAuth added following same pattern (simplified for existing schema)
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const https = require('https');
const router = express.Router();
const coordinatorPrompt = require('../services/coordinatorPrompt');
const { recordCreditTransaction } = require('../services/creditLedger');
const { CryptoService } = require('../services/crypto');
const { ensureManagedProvider, resolveManagedProfile } = require('../services/managedProviderService');
const { sendPostalMail: deliverPostalMail } = require('../services/postalMailer');
const { syncWorkspacePlan } = require('../services/workspacePlanService');
const { buildSpriteAvatar } = require('../lib/avatarPath');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');
const cryptoSvc = new CryptoService();

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

const BCRYPT_COST = 12;

/**
 * Hash a password with bcrypt (cost factor 12).
 * Returns { hash, salt: null } — bcrypt embeds the salt in the hash.
 */
async function hashPassword(password) {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  return { hash, salt: null };
}

/**
 * Verify a password against a stored hash.
 * Supports both bcrypt hashes (new) and SHA-256 hashes (legacy migration).
 *
 * @param {string} password  — plaintext password
 * @param {string} storedHash
 * @param {string|null} salt — present only for legacy salted-SHA-256 hashes
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedHash, salt) {
  // Bcrypt hashes always start with '$2'
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash);
  }
  // Legacy: salted SHA-256 (64 hex chars)
  if (salt) {
    const legacyHash = crypto.createHash('sha256').update(salt + password).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(legacyHash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (_) {
      return legacyHash === storedHash;
    }
  }
  // Legacy: unsalted SHA-256
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(legacyHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (_) {
    return legacyHash === storedHash;
  }
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
  if (!runtimeSchemaMutationsAllowed()) {
    await assertColumnsExist(
      pool,
      SCHEMA,
      'users_auth',
      ['salt', 'name', 'role', 'workspace_id', 'avatar_url', 'deleted_at', 'last_login_at'],
      { label: 'Users auth table' }
    );
    return;
  }

  await pool.query(`
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS salt TEXT;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS workspace_id UUID DEFAULT '${DEFAULT_WORKSPACE}';
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  `).catch(() => {});
}

let schemaReady = false;
let usersAuthHasDeletedAtColumn = null;

async function hasUsersAuthDeletedAtColumn(db) {
  if (typeof usersAuthHasDeletedAtColumn === 'boolean') {
    return usersAuthHasDeletedAtColumn;
  }

  try {
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'users_auth'
            AND column_name = 'deleted_at'
       ) AS exists`,
      [SCHEMA]
    );
    usersAuthHasDeletedAtColumn = result.rows[0]?.exists === true;
  } catch (_) {
    usersAuthHasDeletedAtColumn = false;
  }

  return usersAuthHasDeletedAtColumn;
}

async function getUsersAuthActiveFilter(db, columnPrefix = '') {
  return (await hasUsersAuthDeletedAtColumn(db))
    ? ` AND ${columnPrefix}deleted_at IS NULL`
    : '';
}

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

  // SECURITY: store state in HttpOnly cookie for CSRF validation (audit 2026-03-29)
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/api/v1/auth',
  });
  res.redirect(authUrl);
});

// GET /api/v1/auth/github/callback
router.get('/github/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('[AUTH] GitHub OAuth error:', error, error_description);
      return res.redirect('https://app.vutler.ai/login?error=oauth_cancelled');
    }

    // SECURITY: verify OAuth state to prevent CSRF (audit 2026-03-29)
    const storedState = req.cookies?.oauth_state;
    res.clearCookie('oauth_state', { path: '/api/v1/auth' });
    if (!state || !storedState || state !== storedState) {
      console.error('[AUTH] GitHub OAuth state mismatch — possible CSRF');
      return res.redirect('https://app.vutler.ai/login?error=oauth_invalid');
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
    const activeFilter = await getUsersAuthActiveFilter(pool);
    const existingUser = await pool.query(
      `SELECT id, email, name, role, workspace_id 
       FROM ${SCHEMA}.users_auth 
       WHERE email = $1${activeFilter}
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

  // SECURITY: store state in HttpOnly cookie for CSRF validation (audit 2026-03-29)
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/v1/auth',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/v1/auth/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('[AUTH] Google OAuth error:', error);
      return res.redirect('https://app.vutler.ai/login?error=oauth_cancelled');
    }

    // SECURITY: verify OAuth state to prevent CSRF (audit 2026-03-29)
    const storedState = req.cookies?.oauth_state;
    res.clearCookie('oauth_state', { path: '/api/v1/auth' });
    if (!state || !storedState || state !== storedState) {
      console.error('[AUTH] Google OAuth state mismatch — possible CSRF');
      return res.redirect('https://app.vutler.ai/login?error=oauth_invalid');
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
    const activeFilter = await getUsersAuthActiveFilter(pool);
    const existingUser = await pool.query(
      `SELECT id, email, name, role, workspace_id 
       FROM ${SCHEMA}.users_auth 
       WHERE email = $1${activeFilter}
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

    const activeFilter = await getUsersAuthActiveFilter(pool);
    const result = await pool.query(
      `SELECT id, email, password_hash, salt, name, role, workspace_id
       FROM ${SCHEMA}.users_auth
       WHERE email = $1${activeFilter}
       LIMIT 1`,
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

    // Verify password — supports bcrypt (new) and SHA-256 (legacy migration)
    const valid = await verifyPassword(password, user.password_hash, user.salt || null);

    if (valid && !user.password_hash.startsWith('$2')) {
      // Migrate legacy SHA-256 hash to bcrypt on successful login
      const { hash } = await hashPassword(password);
      await pool.query(
        `UPDATE ${SCHEMA}.users_auth SET password_hash = $1, salt = NULL WHERE id = $2`,
        [hash, user.id]
      );
      console.log(`[AUTH] Migrated ${email} from SHA-256 to bcrypt`);
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
    const activeFilter = await getUsersAuthActiveFilter(pool);
    const existing = await pool.query(
      `SELECT id
         FROM ${SCHEMA}.users_auth
        WHERE email = $1${activeFilter}`,
      [cleanEmail]
    );
    if (existing.rows.length) return res.status(409).json({ success: false, error: 'User already exists' });

    const { hash, salt } = await hashPassword(password);
    const client = await pool.connect();
    let user;
    let workspaceMeta = null;
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
      workspaceMeta = { id: workspaceId, name: workspaceName, slug: workspaceSlug };

      const userRes = await client.query(
        `INSERT INTO ${SCHEMA}.users_auth (email, password_hash, salt, name, role, workspace_id, created_at)
         VALUES ($1, $2, NULL, $3, 'user', $4, NOW())
         RETURNING id, email, name, role, workspace_id`,
        [cleanEmail, hash, name || cleanEmail.split('@')[0], workspaceId]
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

      // ── Trial / managed runtime provisioning (silent — user never sees this) ──
      const trialProfile = resolveManagedProfile('trial');
      let managedProvider = null;
      if (trialProfile?.apiKey) {
        const trialTotal = parseInt(process.env.VUTLER_TRIAL_TOKENS_TOTAL, 10) || 50000;
        const trialDays = parseInt(process.env.VUTLER_TRIAL_EXPIRY_DAYS, 10) || 7;
        const expiresAt = new Date(Date.now() + trialDays * 86400000).toISOString();

        managedProvider = await ensureManagedProvider(client, workspaceId, {
          source: 'trial',
          forceDefault: true,
        });

        const trialSettings = [
          ['trial_tokens_total', JSON.stringify(trialTotal)],
          ['trial_tokens_used', JSON.stringify(0)],
          ['trial_expires_at', JSON.stringify(expiresAt)],
        ];
        for (const [key, value] of trialSettings) {
          await client.query(
            `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())
             ON CONFLICT (workspace_id, key) DO NOTHING`,
            [workspaceId, key, value]
          );
        }

        await recordCreditTransaction(client, {
          workspaceId,
          type: 'grant',
          amount: trialTotal,
          metadata: {
            source: 'auth.register',
            provider: managedProvider?.upstreamProvider || trialProfile.provider,
            model: managedProvider?.model || trialProfile.model,
            expires_at: expiresAt,
          },
        });
      }

      await client.query(
        `INSERT INTO tenant_vutler.agents (id, name, username, workspace_id, agent_type, system_prompt, model, provider, status, avatar)
         VALUES (gen_random_uuid(), 'Jarvis', 'jarvis', $1, 'coordinator', $2, $3, $4, 'active', $5)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          coordinatorPrompt.FULL_PROMPT,
          managedProvider?.model || 'claude-haiku-4-5',
          managedProvider?.provider || null,
          buildSpriteAvatar('jarvis'),
        ]
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

    let sniparaProvisioning = { provisioned: false, skipped: true, reason: 'not_attempted' };
    let driveProvisioning = { provisioned: false, skipped: true, reason: 'not_attempted' };
    if (workspaceMeta) {
      try {
        const { provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
        sniparaProvisioning = await provisionWorkspaceSnipara({
          workspaceId: workspaceMeta.id,
          workspaceName: workspaceMeta.name,
          workspaceSlug: workspaceMeta.slug,
          ownerEmail: cleanEmail,
        });
      } catch (provisionErr) {
        console.warn('[AUTH] Snipara provisioning warning:', provisionErr.message);
        sniparaProvisioning = {
          provisioned: false,
          skipped: false,
          reason: provisionErr.message,
        };
      }

      try {
        const { ensureWorkspaceDriveSetup } = require('../app/custom/services/provisioning');
        const drive = await ensureWorkspaceDriveSetup(workspaceMeta.id);
        await syncWorkspacePlan({
          workspaceId: workspaceMeta.id,
          planId: 'free',
          source: 'auth.register',
          status: 'active',
        });
        driveProvisioning = {
          provisioned: true,
          skipped: false,
          bucket: drive.bucketName,
          drive_root: drive.driveRoot,
        };
      } catch (driveErr) {
        console.warn('[AUTH] Drive provisioning warning:', driveErr.message);
        driveProvisioning = {
          provisioned: false,
          skipped: false,
          reason: driveErr.message,
        };
      }
    }

    const token = generateJWT(user);
    console.log(`[AUTH] Register OK: ${cleanEmail}`);
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      snipara_provisioning: sniparaProvisioning,
      drive_provisioning: driveProvisioning,
    });
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
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.name || req.user.email,
        avatar_url: req.user.avatarUrl || null,
        role: req.user.role,
      },
    });
  } else {
    res.status(401).json({ success: false, error: 'Not authenticated' });
  }
});

// PUT /api/v1/auth/me — update profile (display_name, avatar_url)
router.put('/me', async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const { display_name, avatar_url } = req.body;
    if (!display_name && avatar_url === undefined) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const pool = getPool();
    const sets = [];
    const vals = [];
    let idx = 1;
    if (display_name) {
      sets.push(`name = $${idx++}`);
      vals.push(display_name);
    }
    if (avatar_url !== undefined) {
      // ensure column exists
      await pool.query(`ALTER TABLE ${SCHEMA}.users_auth ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
      sets.push(`avatar_url = $${idx++}`);
      vals.push(avatar_url);
    }
    vals.push(req.user.id);

    const result = await pool.query(
      `UPDATE ${SCHEMA}.users_auth SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, workspace_id, avatar_url`,
      vals
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const u = result.rows[0];
    res.json({
      success: true,
      user: {
        id: u.id,
        email: u.email,
        display_name: u.name,
        avatar_url: u.avatar_url || null,
        role: u.role,
      },
    });
  } catch (err) {
    console.error('[AUTH] Profile update error:', err.message);
    res.status(500).json({ success: false, error: 'Profile update failed' });
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
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const pool = getPool();
    const activeFilter = await getUsersAuthActiveFilter(pool);
    const result = await pool.query(
      `SELECT id, password_hash, salt
         FROM ${SCHEMA}.users_auth
        WHERE id = $1${activeFilter}`,
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    const valid = await verifyPassword(currentPassword, user.password_hash, user.salt || null);

    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const { hash } = await hashPassword(newPassword);
    await pool.query(
      `UPDATE ${SCHEMA}.users_auth SET password_hash = $1, salt = NULL WHERE id = $2`,
      [hash, user.id]
    );

    console.log(`[AUTH] Password changed for user ${user.id}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[AUTH] Password update error:', err.message);
    res.status(500).json({ success: false, error: 'Password update failed' });
  }
});

// DELETE /api/v1/auth/me — soft-delete current account
router.delete('/me', async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const pool = getPool();
    if (!schemaReady) { await ensureSchema(pool); schemaReady = true; }

    const deletedEmail = `deleted+${req.user.id}@deleted.vutler.ai`;
    const result = await pool.query(
      `UPDATE ${SCHEMA}.users_auth
          SET email = $1,
              password_hash = NULL,
              salt = NULL,
              name = COALESCE(NULLIF(name, ''), 'Deleted user'),
              avatar_url = NULL,
              deleted_at = NOW()
        WHERE id = $2
          AND deleted_at IS NULL
        RETURNING id`,
      [deletedEmail, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await pool.query(
      `UPDATE ${SCHEMA}.workspace_api_keys
          SET revoked_at = NOW()
        WHERE created_by_user_id = $1
          AND revoked_at IS NULL`,
      [req.user.id]
    ).catch(() => {});

    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    console.error('[AUTH] Account deletion error:', err.message);
    res.status(500).json({ success: false, error: 'Account deletion failed' });
  }
});

// ── Password reset helpers ────────────────────────────────────────────────────

async function ensureResetTokensTable(pool) {
  if (!runtimeSchemaMutationsAllowed()) {
    await assertTableExists(pool, SCHEMA, 'password_reset_tokens', {
      label: 'Password reset tokens table',
    });
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.password_reset_tokens (
      token       TEXT PRIMARY KEY,
      user_id     UUID NOT NULL,
      email       TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function sendPasswordResetMail({ to, subject, plain_body, html_body }) {
  const result = await deliverPostalMail({
    to,
    from: 'noreply@vutler.ai',
    subject,
    plain_body,
    html_body,
  });

  if (result?.success === false) {
    console.error('[AUTH] Postal error:', result.error || result.reason || 'Unknown Postal failure');
  }

  return result;
}

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  try {
    const pool = require('../lib/vaultbrix');
    await ensureResetTokensTable(pool);
    const activeFilter = await getUsersAuthActiveFilter(pool);
    const user = await pool.query(
      `SELECT id, email, name
         FROM ${SCHEMA}.users_auth
        WHERE email = $1${activeFilter}
        LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    if (user.rows.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await pool.query(
        `INSERT INTO ${SCHEMA}.password_reset_tokens (token, user_id, email, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [token, user.rows[0].id, user.rows[0].email, expiresAt]
      );
      const resetUrl = `${process.env.APP_URL || 'https://app.vutler.ai'}/reset-password?token=${token}`;
      await sendPasswordResetMail({
        to: email,
        subject: 'Reset your Vutler password',
        plain_body: `Hi ${user.rows[0].name || 'there'},\n\nClick the link below to reset your password (valid 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
        html_body: `<p>Hi ${user.rows[0].name || 'there'},</p><p>Click the link below to reset your password (valid 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    }
  } catch (err) {
    console.error('[AUTH] forgot-password error:', err.message);
  }
  // Always return success — don't reveal if email exists
  res.json({ success: true, message: 'If an account exists, a reset link will be sent' });
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  try {
    const pool = require('../lib/vaultbrix');
    await ensureResetTokensTable(pool);
    const r = await pool.query(
      `SELECT user_id, email, expires_at, used FROM ${SCHEMA}.password_reset_tokens WHERE token = $1 LIMIT 1`,
      [token]
    );
    if (!r.rows.length) return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    const row = r.rows[0];
    if (row.used) return res.status(400).json({ success: false, error: 'Reset token already used' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Reset token has expired' });
    const { hash } = await hashPassword(password);
    await pool.query(
      `UPDATE ${SCHEMA}.users_auth SET password_hash = $1, salt = NULL WHERE id = $2`,
      [hash, row.user_id]
    );
    await pool.query(
      `UPDATE ${SCHEMA}.password_reset_tokens SET used = true WHERE token = $1`,
      [token]
    );
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('[AUTH] reset-password error:', err.message);
    res.status(500).json({ success: false, error: 'Password reset failed' });
  }
});

module.exports = router;
