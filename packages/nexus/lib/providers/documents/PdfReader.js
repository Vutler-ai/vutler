'use strict';
const fs = require('fs');
const path = require('path');
const ParseError = require('../../errors/ParseError');

class PdfReader {
  supports(filePath) {
    return path.extname(filePath).toLowerCase() === '.pdf';
  }

  async read(filePath) {
    const start = Date.now();
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);

    let data;
    try {
      data = await pdfParse(buffer, { max: 50 }); // max 50 pages
    } catch (err) {
      if (err.message?.includes('encrypted') || err.message?.includes('password')) {
        throw new ParseError('PDF is password-protected', { filePath });
      }
      // Scanned/image-only PDFs often produce empty text
      throw new ParseError(`PDF parsing failed: ${err.message}`, { filePath });
    }

    const text = (data.text || '').trim();
    if (!text) {
      throw new ParseError('PDF appears to be scanned (image-only) — no extractable text', { filePath });
    }

    return {
      path: filePath,
      type: 'pdf',
      text,
      metadata: {
        pages: data.numpages || 0,
        parseTimeMs: Date.now() - start,
      },
    };
  }
}

module.exports = PdfReader;
