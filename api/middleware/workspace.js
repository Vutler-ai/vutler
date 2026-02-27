/**
 * Sprint 8.1 — Workspace Middleware
 * Extracts workspace_id from request and attaches to req.workspaceId
 * 
 * Sources (priority order):
 * 1. X-Workspace-Id header
 * 2. ?workspace_id query param
 * 3. Default: 00000000-0000-0000-0000-000000000000 (backward compat)
 */

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function workspaceMiddleware(req, res, next) {
  const raw = req.headers['x-workspace-id'] || req.query.workspace_id || DEFAULT_WORKSPACE_ID;
  
  // Validate UUID format
  if (!UUID_REGEX.test(raw)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid workspace_id format. Must be a valid UUID.',
    });
  }
  
  req.workspaceId = raw.toLowerCase();
  next();
}

module.exports = workspaceMiddleware;
module.exports.DEFAULT_WORKSPACE_ID = DEFAULT_WORKSPACE_ID;
