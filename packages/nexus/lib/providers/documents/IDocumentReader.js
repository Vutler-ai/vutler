'use strict';
/**
 * @typedef {object} DocumentResult
 * @property {string} path — source file path
 * @property {string} type — 'pdf' | 'xlsx' | 'csv' | 'docx'
 * @property {string} [text] — extracted text content
 * @property {object[]} [tables] — extracted table data (for xlsx/csv/docx tables)
 * @property {object} metadata — { pages, sheets, encoding, parseTimeMs }
 */

/**
 * IDocumentReader interface (duck-typed)
 * All document readers must implement:
 *   async read(filePath) => DocumentResult
 *   supports(filePath) => boolean
 */
module.exports = {};
