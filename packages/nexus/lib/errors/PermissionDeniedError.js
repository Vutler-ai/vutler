'use strict';

/**
 * Thrown when a requested path or action is outside the user-authorised folders.
 */
class PermissionDeniedError extends Error {
  /**
   * @param {string} message  — human-readable reason
   * @param {object} [meta]   — e.g. { path, rule }
   */
  constructor(message, meta = {}) {
    super(message);
    this.name    = 'PermissionDeniedError';
    this.code    = 'PERMISSION_DENIED';
    this.meta    = meta;
    this.isNexus = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, PermissionDeniedError);
  }
}

module.exports = PermissionDeniedError;
