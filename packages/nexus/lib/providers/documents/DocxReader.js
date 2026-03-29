'use strict';
const fs = require('fs');
const path = require('path');
const ParseError = require('../../errors/ParseError');

class DocxReader {
  supports(filePath) {
    return path.extname(filePath).toLowerCase() === '.docx';
  }

  async read(filePath) {
    const start = Date.now();
    const mammoth = require('mammoth');
    let result;
    try {
      result = await mammoth.extractRawText({ path: filePath });
    } catch (err) {
      throw new ParseError(`Word document parsing failed: ${err.message}`, { filePath });
    }

    // Also try to extract HTML for table structure
    let tables = [];
    try {
      const html = await mammoth.convertToHtml({ path: filePath });
      tables = this._extractTablesFromHtml(html.value);
    } catch (_) {}

    return {
      path: filePath,
      type: 'docx',
      text: result.value || '',
      tables,
      metadata: {
        warnings: result.messages?.filter(m => m.type === 'warning').map(m => m.message) || [],
        parseTimeMs: Date.now() - start,
      },
    };
  }

  _extractTablesFromHtml(html) {
    // Simple regex-based table extraction
    const tables = [];
    const tableRegex = /<table>([\s\S]*?)<\/table>/gi;
    let match;
    while ((match = tableRegex.exec(html))) {
      const rows = [];
      const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let tr;
      while ((tr = trRegex.exec(match[1]))) {
        const cells = [];
        const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let td;
        while ((td = tdRegex.exec(tr[1]))) {
          cells.push(td[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) tables.push(rows);
    }
    return tables;
  }
}

module.exports = DocxReader;
