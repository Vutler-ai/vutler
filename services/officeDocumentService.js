'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const OFFICE_FORMATS = {
  '.doc': { family: 'word', format: 'doc' },
  '.docx': { family: 'word', format: 'docx' },
  '.dot': { family: 'word', format: 'dot' },
  '.dotx': { family: 'word', format: 'dotx' },
  '.odt': { family: 'word', format: 'odt' },
  '.rtf': { family: 'word', format: 'rtf' },
  '.ppt': { family: 'presentation', format: 'ppt' },
  '.pptx': { family: 'presentation', format: 'pptx' },
  '.pot': { family: 'presentation', format: 'pot' },
  '.potx': { family: 'presentation', format: 'potx' },
  '.odp': { family: 'presentation', format: 'odp' },
  '.xls': { family: 'spreadsheet', format: 'xls' },
  '.xlsx': { family: 'spreadsheet', format: 'xlsx' },
  '.xlsm': { family: 'spreadsheet', format: 'xlsm' },
  '.ods': { family: 'spreadsheet', format: 'ods' },
};

function getOfficeDocumentInfo(fileName = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const match = OFFICE_FORMATS[ext];
  if (!match) return null;
  return { ...match, ext };
}

function isOfficeDocumentPath(fileName = '') {
  return Boolean(getOfficeDocumentInfo(fileName));
}

function buildEditableSourceSuggestion(targetPath = '', info = null) {
  const officeInfo = info || getOfficeDocumentInfo(targetPath);
  const normalized = String(targetPath || '').trim();
  if (!officeInfo || !normalized) return null;

  const ext = officeInfo.family === 'spreadsheet' ? '.source.json' : '.source.md';
  const dir = path.posix.dirname(normalized);
  const baseName = path.posix.basename(normalized, path.posix.extname(normalized));
  const suggestion = `${baseName}${ext}`;
  return dir === '.' || dir === '/' ? `/${suggestion}` : `${dir}/${suggestion}`;
}

function createOfficeError(code, message, meta = {}) {
  const err = new Error(message);
  err.code = code;
  err.meta = meta;
  return err;
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html = '') {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6])>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t +/g, '\t')
      .replace(/[ \u00a0]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

async function tryExtractDocxWithMammoth(filePath) {
  let mammoth = null;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    return null;
  }

  const result = await mammoth.extractRawText({ path: filePath });
  return {
    text: String(result.value || '').trim(),
    metadata: {
      strategy: 'mammoth',
      warnings: Array.isArray(result.messages)
        ? result.messages.filter((item) => item?.type === 'warning').map((item) => item.message).filter(Boolean)
        : [],
    },
  };
}

function stringifySheetTable(name, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = safeRows.length > 0 && safeRows[0] && typeof safeRows[0] === 'object'
    ? Object.keys(safeRows[0])
    : [];

  const lines = [`# Sheet: ${name}`];
  if (headers.length > 0) {
    lines.push(headers.join('\t'));
  }

  for (const row of safeRows) {
    const values = headers.map((header) => String(row?.[header] ?? ''));
    lines.push(values.join('\t'));
  }

  return lines.join('\n').trim();
}

async function tryExtractSpreadsheetWithXlsx(filePath) {
  let XLSX = null;
  try {
    XLSX = require('xlsx');
  } catch (_) {
    return null;
  }

  const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return stringifySheetTable(sheetName, rows);
  }).filter(Boolean);

  return {
    text: sections.join('\n\n').trim(),
    metadata: {
      strategy: 'xlsx',
      sheets: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames.slice(),
    },
  };
}

async function convertOfficeDocumentToHtml(filePath, outputDir) {
  const binary = process.env.SOFFICE_BINARY || 'soffice';

  try {
    await execFileAsync(binary, [
      '--headless',
      '--nologo',
      '--nolockcheck',
      '--nodefault',
      '--convert-to',
      'html:XHTML Writer File:UTF8',
      '--outdir',
      outputDir,
      filePath,
    ], {
      timeout: Number(process.env.OFFICE_CONVERT_TIMEOUT_MS || 60_000),
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw createOfficeError(
        'OFFICE_CONVERTER_UNAVAILABLE',
        'LibreOffice/soffice is not installed on the server.'
      );
    }

    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join(' ').trim();
    throw createOfficeError(
      'OFFICE_CONVERSION_FAILED',
      `LibreOffice conversion failed${detail ? `: ${detail}` : '.'}`
    );
  }

  const baseName = path.basename(filePath, path.extname(filePath));
  const candidates = [
    path.join(outputDir, `${baseName}.html`),
    path.join(outputDir, `${baseName}.htm`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  throw createOfficeError(
    'OFFICE_CONVERSION_FAILED',
    'LibreOffice finished without producing an HTML export.'
  );
}

async function extractOfficeTextFromBuffer({ fileName, buffer }) {
  const info = getOfficeDocumentInfo(fileName);
  if (!info) {
    throw createOfficeError('UNSUPPORTED_OFFICE_FORMAT', `Unsupported office file: ${fileName}`);
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vutler-office-'));
  const inputPath = path.join(tmpRoot, path.basename(String(fileName || 'document')));

  try {
    fs.writeFileSync(inputPath, buffer);

    if (info.ext === '.docx') {
      const mammothResult = await tryExtractDocxWithMammoth(inputPath);
      if (mammothResult?.text) {
        return {
          ...mammothResult,
          metadata: {
            ...mammothResult.metadata,
            family: info.family,
            source_format: info.format,
          },
        };
      }
    }

    if (info.family === 'spreadsheet') {
      const xlsxResult = await tryExtractSpreadsheetWithXlsx(inputPath);
      if (xlsxResult?.text) {
        return {
          ...xlsxResult,
          metadata: {
            ...xlsxResult.metadata,
            family: info.family,
            source_format: info.format,
          },
        };
      }
    }

    const html = await convertOfficeDocumentToHtml(inputPath, tmpRoot);
    const text = htmlToText(html);
    if (!text) {
      throw createOfficeError(
        'OFFICE_EMPTY_TEXT',
        'The office document was converted but no readable text was extracted.'
      );
    }

    return {
      text,
      metadata: {
        strategy: 'libreoffice_html',
        family: info.family,
        source_format: info.format,
      },
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

module.exports = {
  getOfficeDocumentInfo,
  isOfficeDocumentPath,
  extractOfficeTextFromBuffer,
  createOfficeError,
  buildEditableSourceSuggestion,
};
