/**
 * Auth utilities
 * Re-exports from api/middleware/auth
 */
const authMiddleware = require('../api/middleware/auth');

// Export the main middleware
module.exports = authMiddleware;

// Export verifyApiKey function
module.exports.verifyApiKey = authMiddleware.verifyApiKey;
module.exports.requireApiKey = authMiddleware.requireApiKey;

// Export authenticateAgent as alias for the main middleware
module.exports.authenticateAgent = authMiddleware;
