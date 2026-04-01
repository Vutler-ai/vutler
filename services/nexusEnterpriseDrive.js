'use strict';

const s3 = require('./s3Storage');

function slugify(value, fallback = 'nexus') {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

async function ensureFolder(workspaceId, folderPath) {
  const key = String(folderPath || '').replace(/^\/+/, '').replace(/\/?$/, '/');
  if (!key) return;
  await s3.uploadFile(
    workspaceId,
    key,
    Buffer.alloc(0),
    'application/x-directory',
    { created_at: new Date().toISOString() }
  );
}

async function ensureFile(workspaceId, filePath, content, contentType = 'text/markdown') {
  const key = String(filePath || '').replace(/^\/+/, '');
  if (!key) return;
  await s3.uploadFile(
    workspaceId,
    key,
    Buffer.from(String(content || ''), 'utf8'),
    contentType,
    { created_at: new Date().toISOString() }
  );
}

async function ensureEnterpriseDriveLayout({ workspaceId, clientName, nodeName }) {
  const clientSlug = slugify(clientName, 'client');
  const nodeSlug = slugify(nodeName, 'node');
  const rootPath = `/Nexus Enterprise/${clientSlug}-${nodeSlug}`;

  const shared = `${rootPath}/shared`;
  const nodes = `${rootPath}/nodes`;
  const nodeRoot = `${nodes}/${nodeSlug}`;
  const folders = [
    `${rootPath}/`,
    `${shared}/`,
    `${shared}/context/`,
    `${shared}/inventory/`,
    `${shared}/reports/`,
    `${shared}/playbooks/`,
    `${shared}/policies/`,
    `${shared}/event-subscriptions/`,
    `${nodeRoot}/`,
    `${nodeRoot}/imports/`,
    `${nodeRoot}/artifacts/`,
    `${nodeRoot}/logs/`,
  ];

  for (const folder of folders) {
    await ensureFolder(workspaceId, folder);
  }

  await ensureFile(
    workspaceId,
    `${shared}/context/README.md`,
    [
      '# Nexus Enterprise Context',
      '',
      'Use this Drive repo as the shared context space for the enterprise deployment.',
      '',
      'Recommended folders:',
      '- `shared/context/`: documentation, client notes, architecture context',
      '- `shared/inventory/`: AV/IT inventories, room lists, CSV/XLSX imports',
      '- `shared/playbooks/`: remediation playbooks and operating procedures',
      '- `shared/policies/`: governance notes and policy exports',
      '- `shared/reports/`: generated reports for stakeholders',
      `- \`nodes/${nodeSlug}/imports/\`: node-specific imports and raw files`,
      `- \`nodes/${nodeSlug}/artifacts/\`: diagnostics, captures, evidence`,
      '',
      'Credentials should not remain in Drive permanently. Import them, normalize them into governed registries or a vault, then restrict or remove the source file.',
      '',
    ].join('\n')
  );

  return {
    rootPath,
    clientSlug,
    nodeSlug,
    sharedPaths: {
      context: `${shared}/context/`,
      inventory: `${shared}/inventory/`,
      reports: `${shared}/reports/`,
      playbooks: `${shared}/playbooks/`,
      policies: `${shared}/policies/`,
      eventSubscriptions: `${shared}/event-subscriptions/`,
    },
    nodePaths: {
      root: `${nodeRoot}/`,
      imports: `${nodeRoot}/imports/`,
      artifacts: `${nodeRoot}/artifacts/`,
      logs: `${nodeRoot}/logs/`,
    },
  };
}

module.exports = {
  ensureEnterpriseDriveLayout,
};
