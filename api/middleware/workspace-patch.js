/**
 * Sprint 8.1 — Server patch to add workspace middleware
 * 
 * Add this BEFORE route mounting in server.js:
 * 
 *   const workspaceMiddleware = require('./api/middleware/workspace');
 *   app.use(workspaceMiddleware);
 * 
 * This sets req.workspaceId on every request.
 */

// This file serves as documentation. The actual middleware is in workspace.js
// To apply: docker exec vutler-api needs the workspace.js file + server.js patch
