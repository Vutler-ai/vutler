'use strict';

/**
 * Thrown when a provider or OS-level feature is not available on this machine
 * (e.g. Spotlight not indexing, Outlook not installed, Ollama not running).
 */
class ProviderUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {object} [meta]  — e.g. { provider: 'SearchProviderDarwin', reason: 'mdfind not found' }
   */
  constructor(message, meta = {}) {
    super(message);
    this.name    = 'ProviderUnavailableError';
    this.code    = 'PROVIDER_UNAVAILABLE';
    this.meta    = meta;
    this.isNexus = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ProviderUnavailableError);
  }
}

module.exports = ProviderUnavailableError;
