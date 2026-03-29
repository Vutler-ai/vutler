'use strict';

/**
 * Safe error response helper — never leaks internal details in production.
 * Usage: const { safeError } = require('../lib/errorResponse');
 *        return safeError(res, err, 'Operation failed');
 */
function safeError(res, err, publicMessage = 'Internal server error', statusCode = 500) {
  // Log the real error server-side
  console.error(`[ERROR] ${publicMessage}:`, err.message || err);

  // In production, never return internal error details
  const message = process.env.NODE_ENV === 'production' ? publicMessage : (err.message || publicMessage);

  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { safeError };
