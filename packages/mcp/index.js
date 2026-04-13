#!/usr/bin/env node
'use strict';

const { Buffer } = require('buffer');

const api = require('./lib/api-client');
const {
  DEFAULT_API_URL,
  DEFAULT_API_KEY_PLACEHOLDER,
  formatEnvTemplate,
  getSupportedClients,
  buildClientConfig,
  writeClientConfig,
} = require('./lib/bootstrap');
const {
  runDoctor,
  formatDoctorReport,
} = require('./lib/doctor');
const {
  getAllowedToolNames,
  isToolAllowed,
  resolveWorkspacePlanId,
} = require('./lib/plan-gating');

function printHelp() {
  process.stdout.write(
    'vutler-mcp\n\n' +
    'Usage:\n' +
    '  npx @vutler/mcp\n' +
    '  npx @vutler/mcp --help\n' +
    '  npx @vutler/mcp --list-clients\n' +
    '  npx @vutler/mcp --print-config [client]\n' +
    '  npx @vutler/mcp --bootstrap [client] [--path FILE] [--force] [--dry-run] [--embed-key] [--json]\n' +
    '  npx @vutler/mcp --setup [client] [--path FILE] [--force] [--dry-run] [--embed-key]\n' +
    '  npx @vutler/mcp --write-config [client] [--path FILE] [--force] [--dry-run] [--embed-key]\n' +
    '  npx @vutler/mcp --doctor [--client CLIENT] [--path FILE] [--json]\n' +
    '  npx @vutler/mcp --print-env\n\n' +
    `Supported clients: ${getSupportedClients().join(', ')}\n\n` +
    'Environment:\n' +
    `  VUTLER_API_URL   Optional, defaults to ${DEFAULT_API_URL}\n` +
    '  VUTLER_API_KEY   Required workspace API key\n'
  );
}

function printEnvTemplate() {
  process.stdout.write(formatEnvTemplate());
}

function printClientConfig(clientName) {
  const template = buildClientConfig(clientName || 'claude-code');

  process.stdout.write(
    `# ${template.label}\n${JSON.stringify(template.config, null, 2)}\n`
  );
}

function printClientList() {
  process.stdout.write(`${getSupportedClients().join('\n')}\n`);
}

function getArgValue(args, flagName) {
  const index = args.indexOf(flagName);
  if (index < 0) return null;
  const candidate = args[index + 1];
  if (!candidate || candidate.startsWith('--')) return null;
  return candidate;
}

function normalizeAgentList(result) {
  const agents = result?.agents || result?.data?.agents || result?.data || [];
  return Array.isArray(agents)
    ? agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      username: agent.username || null,
      role: agent.role || null,
      status: agent.status || null,
      model: agent.model || null,
      provider: agent.provider || null,
      capabilities: agent.capabilities || [],
      description: agent.description || null,
    }))
    : [];
}

function normalizeTaskList(result) {
  const tasks = result?.data || result?.tasks || [];
  return Array.isArray(tasks) ? tasks : [];
}

function normalizeFileList(result) {
  const files = result?.files || result?.data?.files || result?.data || [];
  return Array.isArray(files) ? files : [];
}

function normalizeEventList(result) {
  const events = result?.events || result?.data?.events || result?.data || [];
  return Array.isArray(events) ? events : [];
}

function normalizeEmailList(result) {
  const emails = result?.emails || result?.data?.emails || result?.data || [];
  return Array.isArray(emails) ? emails : [];
}

function normalizeClientList(result) {
  const clients = result?.clients || result?.data || [];
  return Array.isArray(clients)
    ? clients.map((client) => ({
      id: client.id,
      name: client.name,
      email: client.contact_email || client.email || null,
      notes: client.notes || null,
      logo_url: client.logo_url || null,
      created_at: client.created_at || null,
    }))
    : [];
}

function normalizeTaskResponse(result) {
  return result?.data?.task || result?.data || result?.task || result;
}

async function findEmailById(emailId, folder) {
  const folders = folder ? [folder] : ['inbox', 'sent', 'drafts', 'archive'];

  for (const candidateFolder of folders) {
    const result = await api.get('/api/v1/email', { folder: candidateFolder, limit: 200 });
    const emails = normalizeEmailList(result);
    const match = emails.find((email) => String(email.id || email.uid) === String(emailId));
    if (match) {
      return {
        id: match.id || match.uid,
        folder: match.folder || candidateFolder,
        from: match.from,
        to: match.to,
        subject: match.subject,
        body: match.body || '',
        html_body: match.htmlBody || null,
        unread: match.unread ?? !match.isRead,
        date: match.date || null,
      };
    }
  }

  throw new Error(`Email ${emailId} not found`);
}

function parseFilename(disposition, fallback = null) {
  const match = /filename="?([^"]+)"?/i.exec(disposition || '');
  return match ? match[1] : fallback;
}

const ALL_TOOLS = [
  {
    name: 'list_agents',
    description: 'List agents available in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['online', 'offline'],
          description: 'Optional agent status filter.',
        },
        role: {
          type: 'string',
          description: 'Optional agent role filter.',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, role }) {
      const result = await api.get('/api/v1/agents', { status, role });
      const agents = normalizeAgentList(result);
      return { agents, count: agents.length };
    },
  },
  {
    name: 'run_agent',
    description: 'Run a Vutler agent by creating a task assigned to that agent.',
    inputSchema: {
      type: 'object',
      required: ['agent_id', 'instructions'],
      properties: {
        agent_id: { type: 'string', description: 'Agent ID or username.' },
        instructions: { type: 'string', description: 'Task instructions for the agent.' },
        title: { type: 'string', description: 'Optional task title.' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Optional task priority.',
        },
        context: { type: 'string', description: 'Optional extra context appended to the instructions.' },
      },
      additionalProperties: false,
    },
    async handler({ agent_id, instructions, title, priority, context }) {
      let description = instructions;
      if (context) description += `\n\n## Context\n\n${context}`;

      const result = await api.post('/api/v1/tasks-v2', {
        title: title || `Run agent ${agent_id}`,
        description,
        assignee: agent_id,
        priority: priority || 'medium',
      });

      const task = normalizeTaskResponse(result);
      return {
        success: true,
        agent_id,
        task_id: task?.id || task?.task_id || task?.snipara_task_id || null,
        status: task?.status || 'queued',
        message: `Agent ${agent_id} was queued through the Vutler task runtime.`,
        raw: task,
      };
    },
  },
  {
    name: 'stop_agent',
    description: 'Stop a Vutler agent runtime.',
    inputSchema: {
      type: 'object',
      required: ['agent_id'],
      properties: {
        agent_id: { type: 'string', description: 'Agent ID or username.' },
      },
      additionalProperties: false,
    },
    handler({ agent_id }) {
      return api.post(`/api/v1/agents/${encodeURIComponent(agent_id)}/stop`, {});
    },
  },
  {
    name: 'send_email',
    description: 'Send an email from the Vutler workspace.',
    inputSchema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: { type: 'string', description: 'Primary recipient address.' },
        subject: { type: 'string', description: 'Email subject.' },
        body: { type: 'string', description: 'Email body.' },
        htmlBody: { type: 'string', description: 'Optional HTML body.' },
      },
      additionalProperties: false,
    },
    handler({ to, subject, body, htmlBody }) {
      return api.post('/api/v1/email/send', { to, subject, body, htmlBody });
    },
  },
  {
    name: 'list_emails',
    description: 'List emails in a Vutler mailbox folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Mailbox folder, defaults to inbox.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return.',
        },
      },
      additionalProperties: false,
    },
    async handler({ folder = 'inbox', limit = 50 }) {
      const result = await api.get('/api/v1/email', { folder, limit });
      const emails = normalizeEmailList(result);
      return { emails, count: emails.length, folder };
    },
  },
  {
    name: 'read_email',
    description: 'Read a single email by ID.',
    inputSchema: {
      type: 'object',
      required: ['email_id'],
      properties: {
        email_id: { type: 'string', description: 'Email ID returned by list_emails.' },
        folder: { type: 'string', description: 'Optional folder hint to narrow the search.' },
      },
      additionalProperties: false,
    },
    handler({ email_id, folder }) {
      return findEmailById(email_id, folder);
    },
  },
  {
    name: 'list_tasks',
    description: 'List Vutler tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Optional task status filter.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of tasks to return.',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, limit = 100 }) {
      const result = await api.get('/api/v1/tasks-v2', { status, limit });
      const tasks = normalizeTaskList(result);
      return { tasks, count: tasks.length };
    },
  },
  {
    name: 'create_task',
    description: 'Create a task in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Task title.' },
        description: { type: 'string', description: 'Task description.' },
        assignee: { type: 'string', description: 'Agent ID or username to assign.' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority.',
        },
      },
      additionalProperties: false,
    },
    async handler({ title, description, assignee, priority }) {
      const result = await api.post('/api/v1/tasks-v2', { title, description, assignee, priority });
      return normalizeTaskResponse(result);
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing Vutler task.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string', description: 'Task ID.' },
        status: { type: 'string', description: 'New task status.' },
        title: { type: 'string', description: 'Updated title.' },
        description: { type: 'string', description: 'Updated description.' },
      },
      additionalProperties: false,
    },
    handler({ task_id, status, title, description }) {
      return api.patch(`/api/v1/tasks-v2/${encodeURIComponent(task_id)}`, {
        status,
        title,
        description,
      });
    },
  },
  {
    name: 'list_files',
    description: 'List files in Vutler Drive.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path to list.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of files to return.',
        },
      },
      additionalProperties: false,
    },
    async handler({ path = '/', limit = 100 }) {
      const result = await api.get('/api/v1/drive/files', { path, limit });
      const files = normalizeFileList(result);
      return { files, count: files.length, path };
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file into Vutler Drive from text or base64 content.',
    inputSchema: {
      type: 'object',
      required: ['file_name', 'content'],
      properties: {
        file_name: { type: 'string', description: 'File name to create.' },
        content: { type: 'string', description: 'File content as UTF-8 text or base64.' },
        path: { type: 'string', description: 'Destination folder path.' },
        mime_type: { type: 'string', description: 'Optional MIME type.' },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          description: 'Content encoding, defaults to utf8.',
        },
      },
      additionalProperties: false,
    },
    async handler({ file_name, content, path = '/', mime_type, encoding = 'utf8' }) {
      const buffer = encoding === 'base64'
        ? Buffer.from(content, 'base64')
        : Buffer.from(content, 'utf8');
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mime_type || 'application/octet-stream' }), file_name);
      formData.append('path', path);
      const result = await api.postForm('/api/v1/drive/upload', formData);
      return result?.file || result;
    },
  },
  {
    name: 'download_file',
    description: 'Download a file from Vutler Drive as base64.',
    inputSchema: {
      type: 'object',
      required: ['file_id'],
      properties: {
        file_id: { type: 'string', description: 'Drive file ID.' },
        path: { type: 'string', description: 'Optional parent path hint.' },
      },
      additionalProperties: false,
    },
    async handler({ file_id, path }) {
      const response = await api.requestRaw(
        'GET',
        `/api/v1/drive/download/${encodeURIComponent(file_id)}`,
        { query: path ? { path } : undefined }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Failed to download file: ${detail}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        file_id,
        path: path || null,
        file_name: parseFilename(response.headers.get('content-disposition')),
        content_type: response.headers.get('content-type') || 'application/octet-stream',
        size_bytes: buffer.length,
        content_base64: buffer.toString('base64'),
      };
    },
  },
  {
    name: 'list_events',
    description: 'List calendar events in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date/time in ISO format.' },
        end: { type: 'string', description: 'End date/time in ISO format.' },
        source: { type: 'string', description: 'Optional source filter.' },
      },
      additionalProperties: false,
    },
    async handler({ start, end, source }) {
      const result = await api.get('/api/v1/calendar', { start, end, source });
      const events = normalizeEventList(result);
      return { events, count: events.length };
    },
  },
  {
    name: 'create_event',
    description: 'Create a calendar event in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      required: ['title', 'start'],
      properties: {
        title: { type: 'string', description: 'Event title.' },
        start: { type: 'string', description: 'Event start date/time in ISO format.' },
        end: { type: 'string', description: 'Optional event end date/time in ISO format.' },
        description: { type: 'string', description: 'Optional event description.' },
        color: { type: 'string', description: 'Optional event color.' },
      },
      additionalProperties: false,
    },
    handler({ title, start, end, description, color }) {
      return api.post('/api/v1/calendar/events', {
        title,
        start,
        end,
        description,
        color,
        source: 'agent',
      });
    },
  },
  {
    name: 'send_chat',
    description: 'Send a message to a Vutler chat channel.',
    inputSchema: {
      type: 'object',
      required: ['channel_id', 'message'],
      properties: {
        channel_id: { type: 'string', description: 'Chat channel ID.' },
        message: { type: 'string', description: 'Message body.' },
      },
      additionalProperties: false,
    },
    handler({ channel_id, message }) {
      return api.post('/api/v1/chat/send', { channel_id, message });
    },
  },
  {
    name: 'search_memory',
    description: 'Search shared workspace and agent memory in Vutler.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query.' },
      },
      additionalProperties: false,
    },
    async handler({ query }) {
      const result = await api.get('/api/v1/memory/search', { q: query });
      const results = Array.isArray(result?.results) ? result.results : [];
      return { results, count: results.length };
    },
  },
  {
    name: 'list_clients',
    description: 'List client records in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      const result = await api.get('/api/v1/clients');
      const clients = normalizeClientList(result);
      return { clients, count: clients.length };
    },
  },
  {
    name: 'create_client',
    description: 'Create a client record in the Vutler workspace.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Client name.' },
        email: { type: 'string', description: 'Primary client email.' },
        notes: { type: 'string', description: 'Optional notes.' },
        logo_url: { type: 'string', description: 'Optional logo URL.' },
      },
      additionalProperties: false,
    },
    async handler({ name, email, notes, logo_url }) {
      const result = await api.post('/api/v1/clients', {
        name,
        contact_email: email,
        notes,
        logo_url,
      });
      return result?.data || result;
    },
  },
];

const TOOL_HANDLERS = Object.fromEntries(ALL_TOOLS.map((tool) => [tool.name, tool.handler]));
const ALL_TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);

function createServer() {
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
  } = require('@modelcontextprotocol/sdk/types.js');

  const server = new Server(
    {
      name: 'vutler-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const planId = await resolveWorkspacePlanId();
    const allowedToolNames = getAllowedToolNames(planId, ALL_TOOL_NAMES);
    const tools = ALL_TOOLS
      .filter((tool) => allowedToolNames.has(tool.name))
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const planId = await resolveWorkspacePlanId();

    if (!isToolAllowed(planId, name, ALL_TOOL_NAMES)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Tool "${name}" is not available on the current workspace plan.`,
              tool: name,
              planId: planId || 'unknown',
            }),
          },
        ],
        isError: true,
      };
    }

    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await handler(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err.message || 'An unexpected error occurred.',
              tool: name,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--list-clients')) {
    printClientList();
    return;
  }

  if (args.includes('--print-env')) {
    printEnvTemplate();
    return;
  }

  if (args.includes('--print-config')) {
    printClientConfig(getArgValue(args, '--print-config') || 'claude-code');
    return;
  }

  const shouldBootstrap = args.includes('--bootstrap');
  const shouldWriteConfig = shouldBootstrap || args.includes('--setup') || args.includes('--write-config');

  if (shouldWriteConfig) {
    const clientName = getArgValue(args, '--bootstrap')
      || getArgValue(args, '--setup')
      || getArgValue(args, '--write-config')
      || 'claude-code';
    const cwd = getArgValue(args, '--cwd') || process.cwd();
    const result = writeClientConfig({
      clientName,
      apiKey: args.includes('--embed-key')
        ? (process.env.VUTLER_API_KEY || DEFAULT_API_KEY_PLACEHOLDER)
        : DEFAULT_API_KEY_PLACEHOLDER,
      cwd,
      filePath: getArgValue(args, '--path'),
      dryRun: args.includes('--dry-run'),
      force: args.includes('--force'),
    });

    process.stdout.write(
      `[vutler-mcp] ${result.dryRun ? 'Prepared' : 'Wrote'} ${result.label} config (${result.action}) at ${result.path}\n`
    );
    if (result.backupPath) {
      process.stdout.write(`[vutler-mcp] Backup created at ${result.backupPath}\n`);
    }
    if (result.usedPlaceholderKey) {
      process.stdout.write('[vutler-mcp] Placeholder API key written. Replace it or export VUTLER_API_KEY before use.\n');
    }

    if (shouldBootstrap || args.includes('--doctor')) {
      if (result.dryRun) {
        process.stdout.write('[vutler-mcp] Doctor skipped because --dry-run did not write a real client config.\n');
      } else {
        const doctor = await runDoctor({
          allToolNames: ALL_TOOL_NAMES,
          clientName,
          filePath: result.path,
          cwd,
        });
        process.stdout.write(`\n${formatDoctorReport(doctor, { json: args.includes('--json') })}`);
        if (!doctor.ok) process.exitCode = 1;
      }
    }
    return;
  }

  if (args.includes('--doctor')) {
    const doctor = await runDoctor({
      allToolNames: ALL_TOOL_NAMES,
      clientName: getArgValue(args, '--client'),
      filePath: getArgValue(args, '--path'),
      cwd: getArgValue(args, '--cwd') || process.cwd(),
    });
    process.stdout.write(formatDoctorReport(doctor, { json: args.includes('--json') }));
    if (!doctor.ok) process.exitCode = 1;
    return;
  }

  if (!process.env.VUTLER_API_KEY) {
    process.stderr.write('[vutler-mcp] WARNING: VUTLER_API_KEY is not set. All API calls will likely fail.\n');
  }

  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[vutler-mcp] Server started. ${ALL_TOOLS.length} tools registered.\n` +
    `[vutler-mcp] API URL: ${process.env.VUTLER_API_URL || DEFAULT_API_URL}\n`
  );
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[vutler-mcp] Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  ALL_TOOLS,
  ALL_TOOL_NAMES,
  createServer,
  printHelp,
  printEnvTemplate,
  printClientConfig,
  printClientList,
  getArgValue,
  main,
};
