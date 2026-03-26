/**
 * Vutler Authentication Utilities
 * Middleware and helpers for API key + admin session authentication
 * MongoDB refs removed - using PostgreSQL or in-memory fallback
 */

const crypto = require('crypto');
const { ensureUserCorePermissions, DEFAULT_CORE_PERMISSIONS } = require('./core-permissions');

// Import admin sessions from admin module (shared reference)
let _adminSessions = null;
function setAdminSessions(sessions) { _adminSessions = sessions; }

/**
 * Middleware to authenticate agents via API key OR admin session token
 * Note: MongoDB dependency removed. Uses app.locals.pg if available.
 */
async function authenticateAgent(req, res, next) {
  try {
    // If global auth middleware already decoded JWT, trust it
    if (req.user && req.authType === "jwt") {
      const isAdmin = req.user.role === "admin";
      req.agent = {
        id: req.user.id,
        name: req.user.name || req.user.email,
        email: req.user.email,
        roles: [req.user.role || "user"],
        permissions: {
          admin: isAdmin,
          // Grant default core permissions so hasCorePermission() passes for authenticated users
          core: DEFAULT_CORE_PERMISSIONS,
        },
        isAdminSession: true,
      };
      req.workspaceId = req.user.workspaceId || "00000000-0000-0000-0000-000000000001";
      return next();
    }
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    // Try admin session token first (from web UI login)
    if (apiKey && _adminSessions && _adminSessions.has(apiKey)) {
      const session = _adminSessions.get(apiKey);
      if (session.expires > Date.now()) {
        req.agent = {
          id: session.userId,
          name: session.name || session.email,
          email: session.email,
          roles: ['admin'],
          permissions: { admin: true },
          isAdminSession: true
        };
        req.workspaceId = '00000000-0000-0000-0000-000000000001';
        return next();
      } else {
        _adminSessions.delete(apiKey);
      }
    }
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        message: 'Provide API key in Authorization header: Bearer <api-key>'
      });
    }
    
    // Hash the API key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Try to find agent in PostgreSQL if available
    const pg = req.app.locals.pg;
    if (pg) {
      try {
        const agentResult = await pg.query(
          'SELECT id, name, email, roles, permissions FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2 AND active = $3',
          ['agent', apiKeyHash, true]
        );
        
        if (agentResult.rows.length > 0) {
          const agent = agentResult.rows[0];
          req.agent = {
            id: agent.id,
            name: agent.name,
            email: agent.email,
            roles: agent.roles || [],
            permissions: agent.permissions || {}
          };
          return next();
        }
      } catch (dbError) {
        console.error('[Auth] PG query error:', dbError.message);
      }
    }
    
    // Fallback: no agent found
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
}

async function verifyApiKey(pg, apiKey) {
  try {
    if (!pg) return null;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const result = await pg.query(
      'SELECT id, name, email FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2 AND active = $3',
      ['agent', apiKeyHash, true]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error verifying API key:', error);
    return null;
  }
}

function generateApiKey() { return 'vutler_' + crypto.randomBytes(32).toString('hex'); }
function hashApiKey(apiKey) { return crypto.createHash('sha256').update(apiKey).digest('hex'); }

module.exports = { authenticateAgent, verifyApiKey, generateApiKey, hashApiKey, setAdminSessions };
