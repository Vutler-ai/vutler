'use strict';

/**
 * Thrown when a provider operation exceeds its time limit.
 */
class TimeoutError extends Error {
  /**
   * @param {string} message
   * @param {object} [meta]  — e.g. { operation, limitMs, elapsed }
   */
  constructor(message, meta = {}) {
    super(message);
    this.name    = 'TimeoutError';
    this.code    = 'TIMEOUT';
    this.meta    = meta;
    this.isNexus = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, TimeoutError);
  }
}

module.exports = TimeoutError;
