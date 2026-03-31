'use strict';

const path = require('path');

const CANONICAL_ROOT = '/projects/Vutler';

const CATEGORY_RULES = [
  { folder: 'Generated/Marketing', terms: ['marketing', 'campaign', 'social', 'linkedin', 'twitter', 'x ', 'content', 'brand', 'seo'] },
  { folder: 'Generated/Meetings', terms: ['meeting', 'minutes', 'agenda', 'standup', 'sync', 'recap', 'retro'] },
  { folder: 'Generated/Tasks', terms: ['task', 'todo', 'roadmap', 'plan', 'checklist', 'project'] },
  { folder: 'Generated/Finance', terms: ['invoice', 'billing', 'finance', 'budget', 'expense'] },
  { folder: 'Generated/HR', terms: ['hr', 'onboarding', 'candidate', 'interview', 'recruit', 'employee'] },
  { folder: 'Generated/Ops', terms: ['runbook', 'incident', 'ops', 'operations', 'maintenance'] },
  { folder: 'Generated/Mail', terms: ['email', 'mail', 'draft'] },
  { folder: 'Generated/Calendar', terms: ['calendar', 'event', 'schedule'] },
];

function compactSegments(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim().replace(/[<>:"|?*]/g, ''))
    .filter(Boolean)
    .join('/');
}

function normalizeDriveSubpath(inputPath) {
  const raw = String(inputPath || '').trim().replace(/\\/g, '/');
  if (!raw) return '';

  const normalized = path.posix.normalize(raw).replace(/\/+/g, '/');
  const prefixes = [
    '/Workspace/projects/Vutler',
    'Workspace/projects/Vutler',
    '/projects/Vutler',
    'projects/Vutler',
  ];

  for (const prefix of prefixes) {
    if (normalized === prefix) return '';
    if (normalized.startsWith(`${prefix}/`)) {
      return normalized.slice(prefix.length + 1).replace(/^\/+/, '');
    }
  }

  return normalized
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function ensureCanonicalRoot(inputPath) {
  const relative = normalizeDriveSubpath(inputPath);
  if (!relative) return CANONICAL_ROOT;
  return `${CANONICAL_ROOT}/${relative}`.replace(/\/+/g, '/');
}

function classifyFolder({ skillKey = '', title = '', subject = '', content = '', folder = '', category = '' } = {}) {
  const explicitFolder = compactSegments(normalizeDriveSubpath(folder));
  if (explicitFolder) return explicitFolder;

  const haystack = [skillKey, title, subject, content, category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((term) => haystack.includes(term))) {
      return rule.folder;
    }
  }

  return 'Generated/Docs';
}

function inferFilename({ filename, fileName, name, title, subject, content = '', mimeType = '' } = {}) {
  const candidate = [filename, fileName, name, title, subject].find((value) => String(value || '').trim());
  const safeBase = String(candidate || 'document')
    .trim()
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  if (path.posix.extname(safeBase)) return safeBase;

  const looksLikeMarkdown =
    /(^#\s|\n#+\s|\n[-*]\s|\n\d+\.\s)/m.test(content) ||
    /```/.test(content) ||
    /\[[^\]]+\]\([^)]+\)/.test(content) ||
    /markdown/i.test(mimeType);

  return `${safeBase}${looksLikeMarkdown ? '.md' : '.txt'}`;
}

function resolveWorkspaceDriveWritePath(context = {}) {
  const params = context.params || {};
  const explicitPath = String(params.path || params.filePath || params.targetPath || '').trim();

  if (explicitPath) {
    return {
      path: ensureCanonicalRoot(explicitPath),
      defaulted: false,
      folder: null,
      reason: 'explicit_path',
    };
  }

  const folder = classifyFolder({
    skillKey: context.skillKey,
    title: params.title || params.name || '',
    subject: params.subject || '',
    content: params.content || params.body || '',
    folder: params.folder || params.directory || params.parentPath || '',
    category: params.category || params.document_type || '',
  });

  const folderPath = ensureCanonicalRoot(folder);
  const filename = inferFilename({
    filename: params.filename,
    fileName: params.fileName,
    name: params.name,
    title: params.title,
    subject: params.subject,
    content: params.content || params.body || '',
    mimeType: params.mimeType || '',
  });

  return {
    path: `${folderPath}/${filename}`.replace(/\/+/g, '/'),
    defaulted: true,
    folder: folderPath,
    reason: `classified:${folder}`,
  };
}

module.exports = {
  CANONICAL_ROOT,
  classifyFolder,
  ensureCanonicalRoot,
  inferFilename,
  normalizeDriveSubpath,
  resolveWorkspaceDriveWritePath,
};
