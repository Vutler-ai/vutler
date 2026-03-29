'use strict';

/**
 * Thrown when a document or data payload cannot be parsed
 * (scanned PDF with no OCR layer, corrupted Excel file, unknown format, etc.).
 */
class ParseError extends Error {
  /**
   * @param {string} message
   * @param {object} [meta]  — e.g. { filePath, format, cause }
   */
  constructor(message, meta = {}) {
    super(message);
    this.name    = 'ParseError';
    this.code    = 'PARSE_ERROR';
    this.meta    = meta;
    this.isNexus = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
  }
}

module.exports = ParseError;
