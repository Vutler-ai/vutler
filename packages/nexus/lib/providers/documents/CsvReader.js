'use strict';
const fs = require('fs');
const path = require('path');
const ParseError = require('../../errors/ParseError');

class CsvReader {
  supports(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.csv' || ext === '.tsv';
  }

  async read(filePath) {
    const start = Date.now();
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new ParseError(`CSV read failed: ${err.message}`, { filePath });
    }

    const ext = path.extname(filePath).toLowerCase();
    const sep = ext === '.tsv' ? '\t' : this._detectSeparator(raw);
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return { path: filePath, type: 'csv', tables: [{ headers: [], rows: [], rowCount: 0 }], metadata: { parseTimeMs: Date.now() - start } };
    }

    const headers = this._parseLine(lines[0], sep);
    const rows = lines.slice(1).map((line) => {
      const vals = this._parseLine(line, sep);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });

    return {
      path: filePath,
      type: 'csv',
      tables: [{ name: path.basename(filePath), headers, rows, rowCount: rows.length }],
      metadata: { parseTimeMs: Date.now() - start },
    };
  }

  _detectSeparator(raw) {
    const first = raw.split(/\r?\n/)[0] || '';
    if (first.includes(';') && !first.includes(',')) return ';';
    if (first.split('\t').length > first.split(',').length) return '\t';
    return ',';
  }

  _parseLine(line, sep) {
    // Simple CSV parse — handles quoted fields
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === sep && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += c;
    }
    result.push(current.trim());
    return result;
  }
}

module.exports = CsvReader;
