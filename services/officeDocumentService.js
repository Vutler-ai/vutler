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

const OFFICE_EXPORT_CAPABILITIES = {
  '.docx': true,
  '.xlsx': true,
  '.xls': true,
  '.pptx': true,
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

function isNativeOfficeExportSupported(targetPath = '') {
  const ext = path.extname(String(targetPath || '')).toLowerCase();
  return Boolean(OFFICE_EXPORT_CAPABILITIES[ext]);
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

function stripMarkdownInline(value = '') {
  return String(value || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
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

function normalizeMarkdownSource(source = '') {
  return String(source || '')
    .replace(/\r/g, '')
    .trim();
}

function parseMarkdownSections(source = '') {
  const normalized = normalizeMarkdownSource(source);
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = /^\s*#\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { title: stripMarkdownInline(headingMatch[1]).trim(), lines: [] };
      continue;
    }

    if (!current) {
      current = { title: 'Untitled', lines: [] };
    }

    current.lines.push(rawLine);
  }

  if (current) sections.push(current);
  return sections;
}

function parseMarkdownSlides(source = '', fallbackTitle = 'Presentation') {
  const sections = parseMarkdownSections(source);
  if (sections.length === 0) {
    return [{
      title: fallbackTitle,
      bullets: [],
      paragraphs: [normalizeMarkdownSource(source)].filter(Boolean),
    }];
  }

  return sections.map((section) => {
    const bullets = [];
    const paragraphs = [];
    let paragraphBuffer = [];

    const flushParagraph = () => {
      const value = stripMarkdownInline(paragraphBuffer.join(' ').trim());
      if (value) paragraphs.push(value);
      paragraphBuffer = [];
    };

    for (const rawLine of section.lines) {
      const line = String(rawLine || '').trim();
      if (!line) {
        flushParagraph();
        continue;
      }

      const bulletMatch = /^\s*(?:[-*+]|(?:\d+)\.)\s+(.+?)\s*$/.exec(line);
      if (bulletMatch) {
        flushParagraph();
        bullets.push(stripMarkdownInline(bulletMatch[1]).trim());
        continue;
      }

      if (/^\s*##+\s+/.test(line)) {
        flushParagraph();
        paragraphs.push(stripMarkdownInline(line.replace(/^\s*##+\s+/, '')).trim());
        continue;
      }

      paragraphBuffer.push(line);
    }

    flushParagraph();

    return {
      title: section.title || fallbackTitle,
      bullets,
      paragraphs,
    };
  });
}

function parseMarkdownParagraphs(source = '') {
  const lines = normalizeMarkdownSource(source).split('\n');
  const paragraphs = [];
  let bulletMode = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      bulletMode = false;
      continue;
    }

    const headingMatch = /^\s*(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      paragraphs.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: stripMarkdownInline(headingMatch[2]).trim(),
      });
      bulletMode = false;
      continue;
    }

    const bulletMatch = /^\s*(?:[-*+]|(?:\d+)\.)\s+(.+?)\s*$/.exec(line);
    if (bulletMatch) {
      paragraphs.push({
        type: 'bullet',
        text: stripMarkdownInline(bulletMatch[1]).trim(),
      });
      bulletMode = true;
      continue;
    }

    paragraphs.push({
      type: bulletMode ? 'paragraph' : 'paragraph',
      text: stripMarkdownInline(line).trim(),
    });
    bulletMode = false;
  }

  return paragraphs.filter((item) => item.text);
}

function parseSpreadsheetSource(source = '') {
  const normalized = String(source || '').trim();
  if (!normalized) {
    return [{ name: 'Sheet1', rows: [] }];
  }

  let parsed = null;
  try {
    parsed = JSON.parse(normalized);
  } catch (err) {
    throw createOfficeError(
      'OFFICE_SOURCE_INVALID',
      'Spreadsheet source must be valid JSON.'
    );
  }

  if (Array.isArray(parsed)) {
    return [{ name: 'Sheet1', rows: parsed }];
  }

  if (Array.isArray(parsed?.sheets)) {
    return parsed.sheets.map((sheet, index) => ({
      name: String(sheet?.name || `Sheet${index + 1}`),
      rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
    }));
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([name, rows], index) => ({
      name: String(name || `Sheet${index + 1}`),
      rows: Array.isArray(rows) ? rows : [],
    }));
  }

  throw createOfficeError(
    'OFFICE_SOURCE_INVALID',
    'Spreadsheet source must be a JSON array or an object of sheets.'
  );
}

function requireOptionalModule(name, installHint) {
  try {
    return require(name);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw createOfficeError(
        'OFFICE_EXPORTER_UNAVAILABLE',
        `${name} is not installed. ${installHint}`
      );
    }
    throw err;
  }
}

async function exportPresentationBufferFromMarkdown(source = '', options = {}) {
  const PptxGenJS = requireOptionalModule(
    'pptxgenjs',
    'Install the pptxgenjs package to enable PPTX export.'
  );

  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Vutler';
  deck.company = 'Vutler';
  deck.subject = options.title || 'Presentation';
  deck.title = options.title || 'Presentation';
  deck.lang = 'en-US';

  const slides = parseMarkdownSlides(source, options.title || 'Presentation');
  for (const slideSpec of slides) {
    const slide = deck.addSlide();
    slide.background = { color: 'F8F6F1' };
    slide.addText(slideSpec.title || 'Slide', {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: '111827',
      fontFace: 'Aptos',
    });

    const bodyLines = [
      ...slideSpec.paragraphs,
      ...slideSpec.bullets.map((item) => `• ${item}`),
    ].filter(Boolean);

    slide.addText(bodyLines.join('\n'), {
      x: 0.9,
      y: 1.3,
      w: 11.2,
      h: 5.4,
      fontSize: 16,
      color: '1F2937',
      valign: 'top',
      margin: 0.05,
      breakLine: false,
      fontFace: 'Aptos',
    });
  }

  return deck.write({ outputType: 'nodebuffer' });
}

async function exportDocxBufferFromMarkdown(source = '', options = {}) {
  const docx = requireOptionalModule(
    'docx',
    'Install the docx package to enable DOCX export.'
  );

  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
  } = docx;

  const nodes = [];
  const blocks = parseMarkdownParagraphs(source);
  if (options.title) {
    nodes.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: options.title, bold: true })],
    }));
  }

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = Math.min(Math.max(block.level, 1), 6);
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      nodes.push(new Paragraph({
        heading: headingMap[level],
        children: [new TextRun(block.text)],
      }));
      continue;
    }

    if (block.type === 'bullet') {
      nodes.push(new Paragraph({
        text: block.text,
        bullet: { level: 0 },
      }));
      continue;
    }

    nodes.push(new Paragraph({
      children: [new TextRun(block.text)],
    }));
  }

  const doc = new Document({
    sections: [{
      children: nodes.length > 0 ? nodes : [new Paragraph('')],
    }],
  });

  return Packer.toBuffer(doc);
}

async function exportSpreadsheetBufferFromSource(source = '', options = {}) {
  const XLSX = requireOptionalModule(
    'xlsx',
    'Install the xlsx package to enable spreadsheet export.'
  );

  const sheets = parseSpreadsheetSource(source);
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const worksheet = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    XLSX.utils.book_append_sheet(workbook, worksheet, String(sheet.name || 'Sheet1').slice(0, 31));
  }

  const ext = path.extname(String(options.targetPath || '')).toLowerCase();
  const bookType = ext === '.xls' ? 'biff8' : 'xlsx';
  return XLSX.write(workbook, { type: 'buffer', bookType });
}

async function exportOfficeDocumentFromSource({ targetPath, sourceContent, title }) {
  const info = getOfficeDocumentInfo(targetPath);
  if (!info) {
    throw createOfficeError('UNSUPPORTED_OFFICE_FORMAT', `Unsupported office target: ${targetPath}`);
  }

  if (!isNativeOfficeExportSupported(targetPath)) {
    const modernTarget = info.family === 'presentation'
      ? targetPath.replace(/\.[^.]+$/, '.pptx')
      : info.family === 'word'
        ? targetPath.replace(/\.[^.]+$/, '.docx')
        : targetPath.replace(/\.[^.]+$/, '.xlsx');
    throw createOfficeError(
      'OFFICE_EXPORT_UNSUPPORTED',
      `Native export is not supported for ${info.ext}. Export to ${path.extname(modernTarget)} instead.`,
      { suggestedTargetPath: modernTarget }
    );
  }

  let buffer = null;
  if (info.family === 'presentation') {
    buffer = await exportPresentationBufferFromMarkdown(sourceContent, { title });
  } else if (info.family === 'word') {
    buffer = await exportDocxBufferFromMarkdown(sourceContent, { title });
  } else if (info.family === 'spreadsheet') {
    buffer = await exportSpreadsheetBufferFromSource(sourceContent, { targetPath });
  } else {
    throw createOfficeError('OFFICE_EXPORT_UNSUPPORTED', `Unsupported office family: ${info.family}`);
  }

  return {
    buffer,
    metadata: {
      family: info.family,
      source_format: info.format,
      source_path_suggestion: buildEditableSourceSuggestion(targetPath, info),
    },
  };
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
  isNativeOfficeExportSupported,
  extractOfficeTextFromBuffer,
  exportOfficeDocumentFromSource,
  createOfficeError,
  buildEditableSourceSuggestion,
};
