'use strict';
const fs = require('fs');
const path = require('path');
const ParseError = require('../../errors/ParseError');

class XlsxReader {
  supports(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.xlsx' || ext === '.xls';
  }

  async read(filePath) {
    const start = Date.now();
    const XLSX = require('xlsx');
    let workbook;
    try {
      workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
    } catch (err) {
      throw new ParseError(`Excel parsing failed: ${err.message}`, { filePath });
    }

    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { name, headers, rows, rowCount: rows.length };
    });

    return {
      path: filePath,
      type: 'xlsx',
      tables: sheets,
      metadata: {
        sheets: sheets.length,
        totalRows: sheets.reduce((s, sh) => s + sh.rowCount, 0),
        parseTimeMs: Date.now() - start,
      },
    };
  }
}

module.exports = XlsxReader;
