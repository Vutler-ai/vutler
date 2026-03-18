'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const driveIndex = require('../services/drive-index');

const DRIVE_ROOT = process.env.VUTLER_DRIVE_ROOT || process.env.VUTLER_DRIVE_DIR || '/data/drive/Workspace';
const DRIVE_TENANT = sanitizeTenantSlug(process.env.VUTLER_DRIVE_TENANT || 'starbox') || 'starbox';

function normalizeRequestPath(input) {
  const raw = String(input || '/').replace(/\\/g, '/');
  const clean = path.posix.normalize(raw.startsWith('/') ? raw : `/${raw}`);
  if (clean === `/${DRIVE_TENANT}` || clean.startsWith(`/${DRIVE_TENANT}/`)) {
    return clean.replace(`/${DRIVE_TENANT}`, `/tenants/${DRIVE_TENANT}`);
  }
  return clean;
}

function resolveSafePath(requestPath) {
  let rel = normalizeRequestPath(requestPath).replace(/^\//, '');
  const tenantBase = `tenants/${DRIVE_TENANT}`;

  // UX rule: root maps directly to client filesystem root.
  if (!rel) {
    rel = tenantBase;
  } else if (!(rel === tenantBase || rel.startsWith(`${tenantBase}/`))) {
    if (rel === 'tenants' || rel.startsWith('tenants/')) {
      throw new Error('Tenant scope denied');
    }
    rel = `${tenantBase}/${rel}`;
  }

  const full = path.resolve(DRIVE_ROOT, rel);
  const root = path.resolve(DRIVE_ROOT);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path traversal denied');
  }
  return { full, relPath: `/${rel}`.replace(/\/+/g, '/') };
}

async function ensureRoot() {
  await fsp.mkdir(DRIVE_ROOT, { recursive: true });
}

function sanitizeTenantSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isDocumentationFile(name) {
  return /\.(md|mdx|pdf|doc|docx|ppt|pptx|txt)$/i.test(name || '');
}

function formatAddedDateTag(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function withAddedDateInFileName(fileName, dateTag) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `${base}__added-${dateTag}${ext}`;
}

async function copyFileSafe(src, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

function hashPathId(inputPath) {
  const normalized = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 24);
}

async function findFileByIdRecursive(startDir, targetId, publicBase = '/') {
  const entries = await fsp.readdir(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    const publicPath = path.posix.join(publicBase === '/' ? '' : publicBase, entry.name) || '/';

    if (entry.isDirectory()) {
      const nested = await findFileByIdRecursive(fullPath, targetId, publicPath);
      if (nested) return nested;
      continue;
    }

    const internalPath = `/${path.relative(path.resolve(DRIVE_ROOT), fullPath).replace(/\\/g, '/')}`;
    if (hashPathId(publicPath) === targetId || hashPathId(internalPath) === targetId) {
      return { fullPath, name: entry.name, publicPath };
    }
  }
  return null;
}

function toFileDto(parentReqPath, dirent, stats) {
  const parent = normalizeRequestPath(parentReqPath);
  const childPath = path.posix.join(parent === '/' ? '' : parent, dirent.name) || '/';
  return {
    id: crypto.createHash('sha1').update(childPath).digest('hex').slice(0, 24),
    name: dirent.name,
    type: dirent.isDirectory() ? 'folder' : 'file',
    size: dirent.isDirectory() ? undefined : stats.size,
    modified: (stats.mtime || new Date()).toISOString(),
    mime_type: dirent.isDirectory() ? undefined : 'application/octet-stream',
    path: childPath.startsWith('/') ? childPath : `/${childPath}`,
  };
}

router.get('/files', async (req, res) => {
  try {
    await ensureRoot();
    const reqPath = normalizeRequestPath(req.query.path || '/');
    const { full } = resolveSafePath(reqPath);

    await fsp.mkdir(full, { recursive: true });
    const entries = await fsp.readdir(full, { withFileTypes: true });

    const files = [];
    for (const entry of entries) {
      const entryFull = path.join(full, entry.name);
      const st = await fsp.stat(entryFull);
      files.push(toFileDto(reqPath, entry, st));
    }

    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    try {
      await driveIndex.onListTouch(req, reqPath, files);
    } catch (e) {
      console.warn('[DRIVE][DB] list_touch sync skipped:', e.message);
    }

    return res.json({
      success: true,
      path: reqPath,
      files,
      count: files.length,
      total: files.length,
      limit: files.length,
      skip: 0,
    });
  } catch (err) {
    const status = /traversal/i.test(err.message) ? 400 : 500;
    console.error('[DRIVE] List error:', err.message);
    return res.status(status).json({ success: false, error: err.message });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.DRIVE_MAX_FILE_SIZE || 52_428_800) },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureRoot();
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const reqPath = normalizeRequestPath(req.body.path || '/');
    const { full } = resolveSafePath(reqPath);
    await fsp.mkdir(full, { recursive: true });

    const original = req.file.originalname || `upload-${Date.now()}`;
    const ext = path.extname(original);
    const base = path.basename(original, ext);

    let finalName = original;
    let idx = 1;
    while (fs.existsSync(path.join(full, finalName))) {
      finalName = `${base} (${idx})${ext}`;
      idx += 1;
    }

    const output = path.join(full, finalName);
    await fsp.writeFile(output, req.file.buffer);
    const st = await fsp.stat(output);

    const file = {
      id: crypto.createHash('sha1').update(output).digest('hex').slice(0, 24),
      name: finalName,
      type: 'file',
      size: st.size,
      modified: st.mtime.toISOString(),
      mime_type: req.file.mimetype || 'application/octet-stream',
      path: path.posix.join(reqPath === '/' ? '' : reqPath, finalName),
    };

    try {
      await driveIndex.onUpload(req, file);
    } catch (e) {
      console.warn('[DRIVE][DB] upload sync skipped:', e.message);
    }

    return res.json({
      success: true,
      file,
    });
  } catch (err) {
    const status = /traversal/i.test(err.message) ? 400 : 500;
    console.error('[DRIVE] Upload error:', err.message);
    return res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/sync-tenant-docs', async (req, res) => {
  try {
    await ensureRoot();

    const tenantRaw = req.body?.tenant || 'starbox-group';
    const tenant = sanitizeTenantSlug(tenantRaw);
    if (!tenant) {
      return res.status(400).json({ success: false, error: 'Invalid tenant' });
    }

    const projectRoot = process.env.OPENCLAW_WORKSPACE || process.cwd();
    const defaultSources = [
      path.join(projectRoot, 'projects/vutler/docs'),
      path.join(projectRoot, 'projects/vutler/reports'),
      path.join(projectRoot, 'projects/vutler/specs'),
      path.join(projectRoot, 'projects/vutler'),
    ];

    const sourceDirs = Array.isArray(req.body?.sourceDirs) && req.body.sourceDirs.length
      ? req.body.sourceDirs.map((p) => path.resolve(String(p)))
      : defaultSources;

    const destinationRoot = path.join(DRIVE_ROOT, 'tenants', tenant, 'documentation');
    await fsp.mkdir(destinationRoot, { recursive: true });

    const addDateInFilename = req.body?.addDateInFilename !== false;
    const addedDateTag = formatAddedDateTag(new Date());

    let copied = 0;
    const skipped = [];

    for (const srcDir of sourceDirs) {
      if (!fs.existsSync(srcDir)) {
        skipped.push({ source: srcDir, reason: 'missing' });
        continue;
      }

      const stats = await fsp.stat(srcDir);
      if (!stats.isDirectory()) continue;

      const walk = async (current) => {
        const entries = await fsp.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
            continue;
          }

          if (!isDocumentationFile(entry.name)) continue;

          const relFromSource = path.relative(srcDir, fullPath);
          const sourceLabel = path.basename(srcDir);

          const relDir = path.dirname(relFromSource);
          const originalName = path.basename(relFromSource);
          const finalName = addDateInFilename
            ? withAddedDateInFileName(originalName, addedDateTag)
            : originalName;

          const dest = path.join(destinationRoot, sourceLabel, relDir, finalName);
          await copyFileSafe(fullPath, dest);
          copied += 1;
        }
      };

      await walk(srcDir);
    }

    return res.json({
      success: true,
      tenant,
      destination: destinationRoot,
      copied,
      skipped,
      addDateInFilename,
      addedDateTag,
    });
  } catch (err) {
    console.error('[DRIVE] sync-tenant-docs error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/folders', async (req, res) => {
  try {
    await ensureRoot();
    const name = String(req.body?.name || '').trim();
    if (!name || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid folder name' });
    }

    const reqPath = normalizeRequestPath(req.body?.path || '/');
    const folderPath = path.posix.join(reqPath === '/' ? '' : reqPath, name);
    const { full } = resolveSafePath(folderPath);
    await fsp.mkdir(full, { recursive: true });

    try {
      await driveIndex.onCreateFolder(req, folderPath);
    } catch (e) {
      console.warn('[DRIVE][DB] folder sync skipped:', e.message);
    }

    return res.json({
      success: true,
      folder: {
        name,
        path: folderPath,
      },
    });
  } catch (err) {
    const status = /traversal/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/storage', async (req, res) => {
  try {
    await ensureRoot();
    const root = path.resolve(DRIVE_ROOT);

    async function walk(dir) {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      let total = 0;
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) total += await walk(p);
        else if (e.isFile()) {
          const st = await fsp.stat(p);
          total += st.size || 0;
        }
      }
      return total;
    }

    const total = await walk(root);
    return res.json({ success: true, storage: { total_bytes: total } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/move', async (req, res) => {
  try {
    await ensureRoot();
    const fromPath = normalizeRequestPath(req.body?.fromPath || '');
    const toPath = normalizeRequestPath(req.body?.toPath || '/');

    if (!fromPath || fromPath === '/') {
      return res.status(400).json({ success: false, error: 'Invalid source path' });
    }

    const from = resolveSafePath(fromPath).full;
    const st = await fsp.stat(from);

    const targetDir = resolveSafePath(toPath).full;
    await fsp.mkdir(targetDir, { recursive: true });

    const baseName = path.basename(from);
    let dest = path.join(targetDir, baseName);
    if (fs.existsSync(dest)) {
      const ext = st.isDirectory() ? '' : path.extname(baseName);
      const base = st.isDirectory() ? baseName : path.basename(baseName, ext);
      let idx = 1;
      while (fs.existsSync(dest)) {
        dest = path.join(targetDir, `${base} (${idx})${ext}`);
        idx += 1;
      }
    }

    await fsp.rename(from, dest);

    const rel = `/${path.relative(path.resolve(DRIVE_ROOT), dest).replace(/\\/g, '/')}`;

    try {
      await driveIndex.onMove(req, fromPath, rel);
    } catch (e) {
      console.warn('[DRIVE][DB] move sync skipped:', e.message);
    }

    return res.json({ success: true, moved: { from: fromPath, to: rel } });
  } catch (err) {
    const status = /ENOENT|Invalid|traversal/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/delete', async (req, res) => {
  try {
    await ensureRoot();
    const targetPath = normalizeRequestPath(req.body?.path || '');

    if (!targetPath || targetPath === '/') {
      return res.status(400).json({ success: false, error: 'Invalid target path' });
    }

    const { full } = resolveSafePath(targetPath);
    const st = await fsp.stat(full);
    if (st.isDirectory()) await fsp.rm(full, { recursive: true, force: true });
    else await fsp.unlink(full);

    try {
      await driveIndex.onDelete(req, targetPath);
    } catch (e) {
      console.warn('[DRIVE][DB] delete sync skipped:', e.message);
    }

    return res.json({ success: true, deleted: { path: targetPath } });
  } catch (err) {
    const status = /ENOENT|Invalid|traversal/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'Missing query parameter: q' });
    }

    const pathPrefix = normalizeRequestPath(req.query.path || '/');
    const includeContent = String(req.query.includeContent || 'false').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    const results = await driveIndex.search(req, {
      q,
      pathPrefix,
      limit,
      includeContent,
    });

    return res.json({
      success: true,
      q,
      path: pathPrefix,
      includeContent,
      count: results.length,
      results,
      note: includeContent
        ? 'Content field is searched only when extraction has produced real content_text (content_extracted_at IS NOT NULL).'
        : 'Searching name/path fields only. Pass includeContent=true to additionally search extracted content_text when available.',
    });
  } catch (err) {
    console.error('[DRIVE] Search error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/preview/:id', async (req, res) => {
  try {
    const reqPath = normalizeRequestPath(req.query.path || '/');
    const { full } = resolveSafePath(reqPath);
    const entries = await fsp.readdir(full, { withFileTypes: true });

    let match = entries.find((e) => {
      if (e.isDirectory()) return false;
      const p = path.posix.join(reqPath === '/' ? '' : reqPath, e.name) || '/';
      return hashPathId(p) === req.params.id;
    });

    let file;
    let fileName;
    if (match) {
      file = path.join(full, match.name);
      fileName = match.name;
    } else {
      const tenantRoot = path.join(path.resolve(DRIVE_ROOT), 'tenants', DRIVE_TENANT);
      const found = await findFileByIdRecursive(tenantRoot, req.params.id, '/');
      if (!found) return res.status(404).json({ success: false, error: 'File not found' });
      file = found.fullPath;
      fileName = found.name;
    }

    const st = await fsp.stat(file);
    const ext = path.extname(fileName).toLowerCase();

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(ext)) {
      return res.json({ success: true, type: 'binary', url: `/api/v1/drive/download/${req.params.id}?path=${encodeURIComponent(reqPath)}`, name: fileName, modified: st.mtime.toISOString() });
    }

    const raw = await fsp.readFile(file, 'utf8');
    return res.json({ success: true, type: 'text', name: fileName, modified: st.mtime.toISOString(), content: raw.slice(0, 250000) });
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

router.get('/download/:id', async (req, res) => {
  try {
    // Preferred: explicit file path from UI
    const reqPath = normalizeRequestPath(req.query.path || '/');
    const { full } = resolveSafePath(reqPath);

    let targetFile = full;
    let st;
    try {
      st = await fsp.stat(targetFile);
    } catch {
      const tenantRoot = path.join(path.resolve(DRIVE_ROOT), 'tenants', DRIVE_TENANT);
      const found = await findFileByIdRecursive(tenantRoot, req.params.id, '/');
      if (!found) return res.status(404).json({ success: false, error: 'File not found' });
      targetFile = found.fullPath;
      st = await fsp.stat(targetFile);
    }

    if (st.isDirectory()) {
      const entries = await fsp.readdir(targetFile, { withFileTypes: true });
      const match = entries.find((e) => {
        if (e.isDirectory()) return false;
        const p = path.posix.join(reqPath === '/' ? '' : reqPath, e.name) || '/';
        return hashPathId(p) === req.params.id;
      });
      if (!match) {
        const tenantRoot = path.join(path.resolve(DRIVE_ROOT), 'tenants', DRIVE_TENANT);
        const found = await findFileByIdRecursive(tenantRoot, req.params.id, '/');
        if (!found) return res.status(404).json({ success: false, error: 'File not found' });
        targetFile = found.fullPath;
      } else {
        targetFile = path.join(targetFile, match.name);
      }
    }

    const fileName = path.basename(targetFile);
    return res.download(targetFile, fileName);
  } catch (err) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
});

module.exports = router;
