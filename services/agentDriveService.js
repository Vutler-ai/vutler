'use strict';

const crypto = require('crypto');
const path = require('path');
const s3Driver = require('../app/custom/services/s3Driver');
const { resolveWorkspaceDriveRoot } = require('./drivePlacementPolicy');

const SCHEMA = 'tenant_vutler';
const AGENTS_FOLDER_NAME = 'Agents';
const AGENT_SUBFOLDERS = ['Inbox', 'Chat', 'Generated'];

function normalizeVirtualPath(inputPath = '/') {
  if (typeof inputPath !== 'string') {
    throw new Error('Path must be a string');
  }

  if (inputPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const normalized = path.posix.normalize(inputPath.replace(/\\/g, '/'));
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash === '/.' ? '/' : withLeadingSlash;
}

function safeFileName(fileName = '') {
  const base = path.basename(String(fileName || '')).replace(/[\r\n]/g, '').trim();
  return base || `upload-${Date.now()}`;
}

function parentPathFor(filePath) {
  const parent = path.posix.dirname(filePath);
  return parent === '.' ? '/' : parent;
}

function generateS3Key(virtualPath, fileName) {
  const normalized = normalizeVirtualPath(virtualPath);
  if (normalized === '/') return fileName;
  return `${normalized.slice(1)}/${fileName}`;
}

function slugifyAgentFolderSegment(value = '') {
  const normalized = String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || '';
}

function buildLegacyAgentFolderName(agent = {}) {
  const id = String(agent.id || '').trim();
  if (!id) {
    throw new Error('Agent id is required to resolve the assigned drive folder');
  }
  return id;
}

function buildAgentFolderName(agent = {}) {
  const username = slugifyAgentFolderSegment(agent.username || '');
  if (username) return username;

  const name = slugifyAgentFolderSegment(agent.name || '');
  if (name) return name;

  return buildLegacyAgentFolderName(agent);
}

function buildAgentFolderCandidates(agent = {}) {
  return Array.from(new Set([
    buildAgentFolderName(agent),
    buildLegacyAgentFolderName(agent),
  ]));
}

async function getWorkspaceBucket(pg, workspaceId) {
  const result = await pg.query(
    `SELECT slug, storage_bucket
     FROM ${SCHEMA}.workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId]
  );

  if (!result.rows[0]) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const workspace = result.rows[0];
  const bucketName = workspace.storage_bucket || s3Driver.getBucketName(workspace.slug || 'default');
  await s3Driver.ensureBucket(bucketName);

  if (workspace.storage_bucket !== bucketName) {
    await pg.query(
      `UPDATE ${SCHEMA}.workspaces
       SET storage_bucket = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [bucketName, workspaceId]
    );
  }

  return bucketName;
}

async function resolveAgentDriveRoot(workspaceId, agent) {
  const workspaceRoot = normalizeVirtualPath(await resolveWorkspaceDriveRoot(workspaceId));
  return normalizeVirtualPath(`${workspaceRoot}/${AGENTS_FOLDER_NAME}/${buildAgentFolderName(agent)}`);
}

async function resolveAgentDriveSubfolder(workspaceId, agent, folderName = 'Chat') {
  return normalizeVirtualPath(`${await resolveAgentDriveRoot(workspaceId, agent)}/${folderName}`);
}

async function ensureFolderRecord(pg, workspaceId, folderPath, uploadedBy = null) {
  const normalized = normalizeVirtualPath(folderPath);
  const name = path.posix.basename(normalized);
  const parentPath = parentPathFor(normalized);

  await pg.query(
    `INSERT INTO ${SCHEMA}.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'inode/directory', 0, $5, NULL, false, 'folder')
     ON CONFLICT (workspace_id, path)
     DO UPDATE SET
       is_deleted = false,
       uploaded_by = COALESCE(EXCLUDED.uploaded_by, ${SCHEMA}.drive_files.uploaded_by),
       updated_at = NOW()`,
    [workspaceId, name, normalized, parentPath, uploadedBy]
  );
}

async function folderRecordExists(pg, workspaceId, folderPath) {
  const result = await pg.query(
    `SELECT 1
     FROM ${SCHEMA}.drive_files
     WHERE workspace_id = $1
       AND path = $2
       AND is_deleted = false
     LIMIT 1`,
    [workspaceId, normalizeVirtualPath(folderPath)]
  );

  return result.rows.length > 0;
}

async function migrateLegacyAgentDriveRoot(pg, workspaceId, fromRoot, toRoot) {
  const legacyRoot = normalizeVirtualPath(fromRoot);
  const nextRoot = normalizeVirtualPath(toRoot);
  if (!workspaceId || legacyRoot === nextRoot) return false;

  const [legacyExists, nextExists] = await Promise.all([
    folderRecordExists(pg, workspaceId, legacyRoot),
    folderRecordExists(pg, workspaceId, nextRoot),
  ]);

  if (!legacyExists || nextExists) return false;

  const legacyLike = `${legacyRoot}/%`;
  await pg.query(
    `UPDATE ${SCHEMA}.drive_files
        SET path = CASE
              WHEN path = $2 THEN $3
              WHEN path LIKE $4 THEN $3 || SUBSTRING(path FROM char_length($2) + 1)
              ELSE path
            END,
            parent_path = CASE
              WHEN parent_path = $2 THEN $3
              WHEN parent_path LIKE $4 THEN $3 || SUBSTRING(parent_path FROM char_length($2) + 1)
              ELSE parent_path
            END,
            s3_key = CASE
              WHEN s3_key = trim(leading '/' FROM $2) THEN trim(leading '/' FROM $3)
              WHEN s3_key LIKE trim(leading '/' FROM $2) || '/%' THEN trim(leading '/' FROM $3) || SUBSTRING(s3_key FROM char_length(trim(leading '/' FROM $2)) + 1)
              ELSE s3_key
            END,
            name = CASE
              WHEN path = $2 THEN $5
              ELSE name
            END,
            updated_at = NOW()
      WHERE workspace_id = $1
        AND is_deleted = false
        AND (
          path = $2
          OR path LIKE $4
          OR parent_path = $2
          OR parent_path LIKE $4
        )`,
    [workspaceId, legacyRoot, nextRoot, legacyLike, path.posix.basename(nextRoot)]
  );

  return true;
}

async function migrateLegacyAgentDriveObjects(pg, workspaceId, fromRoot, toRoot) {
  const legacyRoot = normalizeVirtualPath(fromRoot);
  const nextRoot = normalizeVirtualPath(toRoot);
  if (!workspaceId || legacyRoot === nextRoot) return 0;
  if (typeof s3Driver.list !== 'function' || typeof s3Driver.move !== 'function') return 0;

  const bucket = await getWorkspaceBucket(pg, workspaceId).catch(() => null);
  if (!bucket) return 0;

  const legacyPrefix = `${legacyRoot.slice(1).replace(/\/+$/, '')}/`;
  const nextPrefix = `${nextRoot.slice(1).replace(/\/+$/, '')}/`;
  const prefixedLegacyPrefix = s3Driver.prefixKey(legacyPrefix);
  const prefixedNextPrefix = s3Driver.prefixKey(nextPrefix);
  const { files = [] } = await s3Driver.list(bucket, prefixedLegacyPrefix).catch(() => ({ files: [] }));

  let movedCount = 0;
  for (const file of files) {
    const oldKey = String(file?.key || '');
    if (!oldKey || !oldKey.startsWith(prefixedLegacyPrefix)) continue;
    const suffix = oldKey.slice(prefixedLegacyPrefix.length);
    const newKey = `${prefixedNextPrefix}${suffix}`;
    await s3Driver.move(bucket, oldKey, newKey);
    movedCount += 1;
  }

  return movedCount;
}

async function ensureAgentDriveProvisioned(pg, workspaceId, agent, options = {}) {
  const uploadedBy = options.uploadedBy || null;
  const workspaceRoot = normalizeVirtualPath(await resolveWorkspaceDriveRoot(workspaceId));
  const agentsRoot = normalizeVirtualPath(`${workspaceRoot}/${AGENTS_FOLDER_NAME}`);
  const agentRoot = await resolveAgentDriveRoot(workspaceId, agent);
  const legacyAgentRoot = normalizeVirtualPath(`${workspaceRoot}/${AGENTS_FOLDER_NAME}/${buildLegacyAgentFolderName(agent)}`);

  if (legacyAgentRoot !== agentRoot) {
    const migrated = await migrateLegacyAgentDriveRoot(pg, workspaceId, legacyAgentRoot, agentRoot);
    if (migrated) {
      await migrateLegacyAgentDriveObjects(pg, workspaceId, legacyAgentRoot, agentRoot);
    }
  }

  const folders = [
    agentsRoot,
    agentRoot,
    ...AGENT_SUBFOLDERS.map((folderName) => normalizeVirtualPath(`${agentRoot}/${folderName}`)),
  ];

  for (const folder of folders) {
    await ensureFolderRecord(pg, workspaceId, folder, uploadedBy);
  }

  return {
    workspaceRoot,
    agentsRoot,
    agentRoot,
    chatRoot: normalizeVirtualPath(`${agentRoot}/Chat`),
  };
}

async function uploadFileToAgentDrive(pg, options = {}) {
  const {
    workspaceId,
    agent,
    uploadedBy = null,
    file,
    targetSubfolder = 'Chat',
  } = options;

  if (!workspaceId) throw new Error('workspaceId is required');
  if (!agent?.id) throw new Error('agent.id is required');
  if (!file?.buffer) throw new Error('file.buffer is required');

  await ensureAgentDriveProvisioned(pg, workspaceId, agent, { uploadedBy });
  const parentPath = await resolveAgentDriveSubfolder(workspaceId, agent, targetSubfolder);
  const cleanName = safeFileName(file.originalname || file.name || 'upload.bin');
  const fileId = crypto.randomUUID();
  const s3Key = generateS3Key(parentPath, `${fileId}-${cleanName}`);
  const bucket = await getWorkspaceBucket(pg, workspaceId);
  const mimeType = file.mimetype || file.mimeType || 'application/octet-stream';
  const size = Number(file.size || file.buffer.length || 0);
  const itemPath = normalizeVirtualPath(`${parentPath}/${cleanName}`);

  await s3Driver.upload(bucket, s3Driver.prefixKey(s3Key), file.buffer, mimeType);
  await pg.query(
    `INSERT INTO ${SCHEMA}.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'file')`,
    [fileId, workspaceId, cleanName, itemPath, parentPath, mimeType, size, uploadedBy, s3Key]
  );

  return {
    id: fileId,
    name: cleanName,
    mimeType,
    size,
    path: itemPath,
    parentPath,
    s3Key,
    bucket,
  };
}

async function findAssignedAgentForPath(pg, workspaceId, filePath) {
  if (!workspaceId || !filePath) return null;

  const workspaceRoot = normalizeVirtualPath(await resolveWorkspaceDriveRoot(workspaceId));
  const prefix = normalizeVirtualPath(`${workspaceRoot}/${AGENTS_FOLDER_NAME}`);
  const normalized = normalizeVirtualPath(filePath);

  if (normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
    return null;
  }

  const relative = normalized.slice(prefix.length).replace(/^\/+/, '');
  const agentFolder = relative.split('/')[0];
  if (!agentFolder) return null;

  const result = await pg.query(
    `SELECT id, name, username, workspace_id
     FROM ${SCHEMA}.agents
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  const agent = (result.rows || []).find((row) => buildAgentFolderCandidates(row).includes(agentFolder));
  if (!agent) return null;

  return {
    agent,
    agentDriveRoot: normalizeVirtualPath(`${prefix}/${buildAgentFolderName(agent)}`),
  };
}

function buildAgentDrivePlacementInstruction(agentDriveRoot) {
  const normalized = normalizeVirtualPath(agentDriveRoot || '/projects/Vutler');
  return `Your assigned drive folder is ${normalized}. Use this folder by default for drive reads and writes unless the user explicitly asks for another path.`;
}

module.exports = {
  AGENTS_FOLDER_NAME,
  AGENT_SUBFOLDERS,
  buildAgentFolderCandidates,
  buildAgentFolderName,
  buildAgentDrivePlacementInstruction,
  ensureAgentDriveProvisioned,
  findAssignedAgentForPath,
  normalizeVirtualPath,
  resolveAgentDriveRoot,
  resolveAgentDriveSubfolder,
  uploadFileToAgentDrive,
};
