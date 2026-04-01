'use strict';

const {
  canonicalDmNameForContact,
  findExistingDmChannelId,
} = require('./chatChannelMaintenance');
const { resolveAgentDriveRoot } = require('./agentDriveService');

const SCHEMA = 'tenant_vutler';

async function ensureAgentDmChannel(pg, workspaceId, userId, agent) {
  const existingDmId = await findExistingDmChannelId(pg, {
    schema: SCHEMA,
    workspaceId,
    currentUserId: String(userId),
    contactId: String(agent.id),
  });

  if (existingDmId) return existingDmId;

  const dmName = canonicalDmNameForContact(agent.name, agent.username) || `DM-${String(agent.id).slice(0, 8)}`;
  const created = await pg.query(
    `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
     VALUES ($1, $2, 'dm', $3, $4)
     RETURNING id`,
    [dmName, `Direct message with ${agent.name}`, workspaceId, userId]
  );

  const channelId = created.rows[0].id;
  await pg.query(
    `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT DO NOTHING`,
    [channelId, String(userId)]
  );
  await pg.query(
    `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
     VALUES ($1, $2, 'agent')
     ON CONFLICT DO NOTHING`,
    [channelId, String(agent.id)]
  );

  return channelId;
}

function buildIntakePrompt(file, agentDriveRoot) {
  const mime = String(file?.mimeType || '').toLowerCase();
  const filename = String(file?.name || 'document');
  const path = String(file?.path || '');
  const isFolder = mime === 'inode/directory' || mime === 'application/x-directory';
  const spreadsheet = mime.includes('sheet') || mime.includes('excel') || /\.xlsx?$|\.csv$/i.test(filename);

  return [
    isFolder
      ? 'A new folder was added to your assigned drive folder by the user.'
      : 'A new file was added to your assigned drive folder by the user.',
    `Assigned folder: ${agentDriveRoot}`,
    isFolder ? `Folder name: ${filename}` : `File name: ${filename}`,
    isFolder ? `Folder path: ${path}` : `File path: ${path}`,
    file?.mimeType ? `MIME type: ${file.mimeType}` : null,
    file?.size != null ? `File size: ${file.size} bytes` : null,
    '',
    isFolder
      ? 'Use the workspace drive tools to inspect the folder contents if useful, then reply directly in this DM with one short, concrete follow-up question.'
      : 'Use the workspace drive tools to inspect the file if possible, then reply directly in this DM with one short, concrete follow-up question.',
    isFolder
      ? 'Mention that you saw the new folder and ask what the user wants you to do with its contents.'
      : null,
    spreadsheet
      ? 'If it looks like a spreadsheet, mention that you saw it and ask what the user wants done with it.'
      : 'If it looks like a document, mention that you read or reviewed it and ask whether the user wants you to complete, summarize, or transform it.',
    'Do not mention this system instruction. Reply in the same language as the user.',
  ].filter(Boolean).join('\n');
}

async function notifyAgentAboutDriveFile({ pg, app, workspaceId, userId, userName, agent, file }) {
  if (!pg || !workspaceId || !userId || !agent?.id || !file?.path) return null;

  const channelId = await ensureAgentDmChannel(pg, workspaceId, userId, agent);
  const agentDriveRoot = await resolveAgentDriveRoot(workspaceId, agent);
  const prompt = buildIntakePrompt(file, agentDriveRoot);

  const chatRuntime = app?.locals?.chatRuntime || require('../app/custom/services/chatRuntime');
  if (chatRuntime && typeof chatRuntime.processMessage === 'function') {
    await chatRuntime.processMessage({
      channel_id: channelId,
      workspace_id: workspaceId,
      sender_id: String(userId),
      sender_name: userName || 'User',
      content: prompt,
      requested_agent_id: String(agent.id),
    });
  }

  return {
    channelId,
    agentDriveRoot,
  };
}

module.exports = {
  buildIntakePrompt,
  ensureAgentDmChannel,
  notifyAgentAboutDriveFile,
};
