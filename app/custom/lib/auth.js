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

function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') return value || null;
  const normalized = value.trim();
  return normalized || null;
}

/**
 * Middleware to authenticate agents via API key OR admin session token
 * Note: MongoDB dependency removed. Uses app.locals.pg if available.
 */
async function authenticateAgent(req, res, next) {
  try {
    const existingWorkspaceId = normalizeWorkspaceId(
      req.workspaceId || req.agent?.workspaceId || req.agent?.workspace_id
    );
    if (req.agent && existingWorkspaceId) {
      req.workspaceId = existingWorkspaceId;
      return next();
    }

    // If global auth middleware already decoded JWT, trust it
    if (req.user) {
      const isAdmin = req.user.role === "admin";
      const workspaceId = normalizeWorkspaceId(req.user.workspaceId);
      req.agent = {
        id: req.user.id,
        name: req.user.name || req.user.email,
        email: req.user.email,
        workspaceId,
        workspace_id: workspaceId,
        roles: [req.user.role || "user"],
        permissions: {
          admin: isAdmin,
          // Grant default core permissions so hasCorePermission() passes for authenticated users
          core: DEFAULT_CORE_PERMISSIONS,
        },
        isAdminSession: true,
      };
      req.userId = req.user.id;
      req.role = req.user.role || 'user';
      req.workspaceId = workspaceId;
      return next();
    }
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    // Try admin session token first (from web UI login)
    if (apiKey && _adminSessions && _adminSessions.has(apiKey)) {
      const session = _adminSessions.get(apiKey);
      if (session.expires > Date.now()) {
        const workspaceId = normalizeWorkspaceId(session.workspaceId);
        req.agent = {
          id: session.userId,
          name: session.name || session.email,
          email: session.email,
          workspaceId,
          workspace_id: workspaceId,
          roles: ['admin'],
          permissions: { admin: true },
          isAdminSession: true
        };
        req.userId = session.userId;
        req.role = 'admin';
        req.workspaceId = workspaceId;
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
          'SELECT id, name, email, roles, permissions, workspace_id FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2 AND active = $3',
          ['agent', apiKeyHash, true]
        );
        
        if (agentResult.rows.length > 0) {
          const agent = agentResult.rows[0];
          const workspaceId = normalizeWorkspaceId(agent.workspace_id);
          if (!workspaceId) {
            return res.status(401).json({
              success: false,
              error: 'API key is missing workspace context'
            });
          }
          req.agent = {
            id: agent.id,
            name: agent.name,
            email: agent.email,
            workspaceId,
            workspace_id: workspaceId,
            roles: agent.roles || [],
            permissions: agent.permissions || {}
          };
          req.userId = agent.id;
          req.role = Array.isArray(agent.roles) && agent.roles.includes('admin')
            ? 'admin'
            : (agent.roles?.[0] || 'agent');
          req.workspaceId = workspaceId;
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
      'SELECT id, name, email, workspace_id FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2 AND active = $3',
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
