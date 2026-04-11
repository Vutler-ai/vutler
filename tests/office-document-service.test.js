'use strict';

const XLSX = require('xlsx');

const {
  exportOfficeDocumentFromSource,
  extractOfficeTextFromBuffer,
  isNativeOfficeExportSupported,
} = require('../services/officeDocumentService');

describe('officeDocumentService', () => {
  test('exports a DOCX buffer from markdown source and can read it back', async () => {
    const result = await exportOfficeDocumentFromSource({
      targetPath: '/projects/Vutler/Generated/Docs/brief.docx',
      sourceContent: '# Brief\n\nHello world.\n\n- Alpha\n- Beta',
      title: 'Brief',
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.slice(0, 2).toString('utf8')).toBe('PK');

    const extracted = await extractOfficeTextFromBuffer({
      fileName: 'brief.docx',
      buffer: result.buffer,
    });

    expect(extracted.text).toContain('Brief');
    expect(extracted.text).toContain('Hello world.');
    expect(extracted.text).toContain('Alpha');
    expect(extracted.text).toContain('Beta');
  });

  test('exports an XLSX buffer from JSON source', async () => {
    const result = await exportOfficeDocumentFromSource({
      targetPath: '/projects/Vutler/Generated/Finance/report.xlsx',
      sourceContent: JSON.stringify({
        Revenue: [
          { month: 'Jan', amount: 100 },
          { month: 'Feb', amount: 150 },
        ],
      }),
      title: 'Report',
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.slice(0, 2).toString('utf8')).toBe('PK');

    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toContain('Revenue');

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Revenue, { defval: '' });
    expect(rows).toEqual([
      { month: 'Jan', amount: 100 },
      { month: 'Feb', amount: 150 },
    ]);
  });

  test('reports native export support only for modern office targets', () => {
    expect(isNativeOfficeExportSupported('/tmp/brief.docx')).toBe(true);
    expect(isNativeOfficeExportSupported('/tmp/deck.pptx')).toBe(true);
    expect(isNativeOfficeExportSupported('/tmp/report.xlsx')).toBe(true);
    expect(isNativeOfficeExportSupported('/tmp/legacy.doc')).toBe(false);
    expect(isNativeOfficeExportSupported('/tmp/legacy.ppt')).toBe(false);
  });
});
