'use strict';

/**
 * Catch-all for unexpected errors. Always includes stack trace in meta for traceability.
 */
class UnknownError extends Error {
  /**
   * @param {Error|string} originalError
   */
  constructor(originalError) {
    const msg = originalError instanceof Error ? originalError.message : String(originalError);
    super(msg);
    this.name       = 'UnknownError';
    this.code       = 'UNKNOWN_ERROR';
    this.isNexus    = true;
    this.originalStack = originalError instanceof Error ? originalError.stack : null;
    this.meta       = { originalStack: this.originalStack };
    if (Error.captureStackTrace) Error.captureStackTrace(this, UnknownError);
  }
}

module.exports = UnknownError;
