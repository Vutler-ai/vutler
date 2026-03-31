'use strict';

const path = require('path');
let pool = null;

try {
  pool = require('../lib/vaultbrix');
} catch (_) {
  pool = null;
}

const CANONICAL_ROOT = '/projects/Vutler';
const WORKSPACE_ROOT_SETTING_KEYS = ['drive_root', 'workspace_drive_root', 'drive_root_path'];
const ROOT_CACHE_TTL_MS = 60_000;
const workspaceRootCache = new Map();

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

function normalizeDriveSubpath(inputPath, root = CANONICAL_ROOT) {
  const raw = String(inputPath || '').trim().replace(/\\/g, '/');
  if (!raw) return '';

  const normalized = path.posix.normalize(raw).replace(/\/+/g, '/');
  const prefixes = Array.from(new Set([
    `/Workspace${root}`,
    `Workspace${root}`,
    root,
    root.replace(/^\/+/, ''),
    '/Workspace/projects/Vutler',
    'Workspace/projects/Vutler',
    '/projects/Vutler',
    'projects/Vutler',
  ]));

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

function readSettingValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && typeof value.value === 'string') return value.value.trim();
  return String(value).trim();
}

function normalizeDriveRoot(inputPath) {
  const raw = String(inputPath || '').trim().replace(/\\/g, '/');
  if (!raw) return CANONICAL_ROOT;
  const normalized = path.posix.normalize(raw.startsWith('/') ? raw : `/${raw}`).replace(/\/+/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

async function resolveWorkspaceDriveRoot(workspaceId) {
  if (!workspaceId) return CANONICAL_ROOT;

  const cached = workspaceRootCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.root;
  }

  let root = CANONICAL_ROOT;
  if (pool?.query) {
    try {
      const result = await pool.query(
        `SELECT key, value
         FROM tenant_vutler.workspace_settings
         WHERE workspace_id = $1
           AND key = ANY($2::text[])`,
        [workspaceId, WORKSPACE_ROOT_SETTING_KEYS]
      );

      for (const row of result.rows || []) {
        const candidate = readSettingValue(row.value);
        if (candidate) {
          root = normalizeDriveRoot(candidate);
          break;
        }
      }
    } catch (err) {
      console.warn('[DrivePlacement] workspace root lookup failed:', err.message);
    }
  }

  workspaceRootCache.set(workspaceId, {
    root,
    expiresAt: Date.now() + ROOT_CACHE_TTL_MS,
  });

  return root;
}

function ensureCanonicalRoot(inputPath, root = CANONICAL_ROOT) {
  const normalized = String(inputPath || '').trim().replace(/\\/g, '/');
  if (!normalized) return root;

  const pathWithRoot = path.posix.normalize(normalized).replace(/\/+/g, '/');
  if (pathWithRoot.startsWith('/Workspace/')) {
    const unwrapped = pathWithRoot.replace(/^\/Workspace/, '');
    if (unwrapped === root || unwrapped.startsWith(`${root}/`) || unwrapped === CANONICAL_ROOT || unwrapped.startsWith(`${CANONICAL_ROOT}/`)) {
      return unwrapped;
    }
  }

  const roots = [root, CANONICAL_ROOT, `/Workspace${root}`, `/Workspace${CANONICAL_ROOT}`];
  for (const candidateRoot of roots) {
    if (pathWithRoot === candidateRoot || pathWithRoot.startsWith(`${candidateRoot}/`)) {
      return pathWithRoot;
    }
  }

  const relative = normalizeDriveSubpath(pathWithRoot, root);
  if (!relative) return root;
  return `${normalizeDriveRoot(root)}/${relative}`.replace(/\/+/g, '/');
}

function classifyFolder({ skillKey = '', title = '', subject = '', content = '', folder = '', category = '', root = CANONICAL_ROOT } = {}) {
  const explicitFolder = compactSegments(normalizeDriveSubpath(folder, root));
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

async function resolveWorkspaceDriveWritePath(context = {}) {
  const params = context.params || {};
  const workspaceRoot = await resolveWorkspaceDriveRoot(context.workspaceId);
  const explicitPath = String(params.path || params.filePath || params.targetPath || '').trim();

  if (explicitPath) {
    return {
      path: ensureCanonicalRoot(explicitPath.startsWith('/') ? explicitPath : `${workspaceRoot}/${explicitPath}`, workspaceRoot),
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
    root: workspaceRoot,
  });

  const folderPath = ensureCanonicalRoot(
    folder.startsWith('/') ? folder : `${workspaceRoot}/${folder}`,
    workspaceRoot
  );
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
  resolveWorkspaceDriveRoot,
  resolveWorkspaceDriveWritePath,
};
