'use strict';
const path = require('path');
const fs = require('fs');
const PdfReader = require('./PdfReader');
const XlsxReader = require('./XlsxReader');
const CsvReader = require('./CsvReader');
const DocxReader = require('./DocxReader');
const ParseError = require('../../errors/ParseError');
const logger = require('../../logger');

const readers = [new PdfReader(), new XlsxReader(), new CsvReader(), new DocxReader()];

function getReaderFor(filePath) {
  return readers.find(r => r.supports(filePath)) || null;
}

/**
 * Read a single document — auto-detects format.
 */
async function readDocument(filePath) {
  const reader = getReaderFor(filePath);
  if (!reader) throw new ParseError(`Unsupported file format: ${path.extname(filePath)}`, { filePath });
  return reader.read(filePath);
}

/**
 * Batch-read all supported documents in a folder.
 * Returns { results[], errors[], totalFiles }.
 * @param {string} folderPath
 * @param {function} [onProgress] — called with { file, index, total }
 */
async function batchRead(folderPath, onProgress) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    .filter(e => e.isFile() && getReaderFor(e.name))
    .map(e => path.join(folderPath, e.name));

  const results = [];
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const filePath = entries[i];
    if (onProgress) onProgress({ file: path.basename(filePath), index: i, total: entries.length });
    try {
      const doc = await readDocument(filePath);
      results.push(doc);
    } catch (err) {
      logger.warn(`[DocumentReader] Batch: failed on ${path.basename(filePath)}: ${err.message}`);
      errors.push({ path: filePath, error: err.message });
    }
  }

  return { results, errors, totalFiles: entries.length };
}

module.exports = { readDocument, batchRead, getReaderFor };
