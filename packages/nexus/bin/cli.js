#!/usr/bin/env node
const { spawn } = require('child_process');
const { Command } = require('commander');
const { NexusNode } = require('../index');
const {
  getConfigPath,
  readRuntimeConfig,
  writeRuntimeConfig,
  buildRuntimeConfigFromToken,
} = require('../lib/runtime-config');

const program = new Command();
program.name('vutler-nexus').version('0.1.0').description('Vutler Nexus Agent Runtime');

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseJsonEnv(name, fallback = undefined) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function parseBoolEnv(name, fallback = undefined) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return fallback;
}

function parseNumEnv(name, fallback = undefined) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function openUrl(url) {
  if (!url) return;

  const platform = process.platform;
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (_) {
    // Ignore browser launch failures; the URL is still printed to stdout.
  }
}

async function handleStart(opts = {}, extra = {}) {
  const shouldOpenBrowser = extra.openBrowser === true;

  // Legacy local config fallback
  let localConfig = {};
  try { localConfig = JSON.parse(require('fs').readFileSync('.vutler-nexus.json', 'utf8')); } catch(e) {}

  // Global config from ~/.vutler/nexus.json (preferred)
  const globalConfig = readRuntimeConfig() || {};
  const envConfig = {
    mode: process.env.NEXUS_MODE || undefined,
    type: process.env.NEXUS_TYPE || undefined,
    node_name: process.env.NEXUS_NODE_NAME || undefined,
    port: parseNumEnv('NEXUS_PORT'),
    seats: parseNumEnv('NEXUS_SEATS'),
    primary_agent: process.env.NEXUS_PRIMARY_AGENT || undefined,
    agents: parseJsonEnv('NEXUS_AGENTS'),
    routing_rules: parseJsonEnv('NEXUS_ROUTING_RULES'),
    auto_spawn_rules: parseJsonEnv('NEXUS_AUTO_SPAWN_RULES'),
    available_pool: parseJsonEnv('NEXUS_AVAILABLE_POOL'),
    allow_create: parseBoolEnv('NEXUS_ALLOW_CREATE'),
    offline_config: parseJsonEnv('NEXUS_OFFLINE_CONFIG'),
    permissions: parseJsonEnv('NEXUS_PERMISSIONS'),
    llm: parseJsonEnv('NEXUS_LLM'),
    client_name: process.env.NEXUS_CLIENT_NAME || undefined,
    filesystem_root: process.env.NEXUS_FILESYSTEM_ROOT || undefined,
    role: process.env.NEXUS_ROLE || undefined,
    snipara_instance_id: process.env.NEXUS_SNIPARA_INSTANCE_ID || undefined,
    api_key: process.env.NEXUS_API_KEY || undefined,
    deploy_token: process.env.NEXUS_DEPLOY_TOKEN || process.env.NEXUS_TOKEN || undefined,
    server: process.env.NEXUS_SERVER || undefined,
  };

  const key = opts.key || localConfig.key || globalConfig.deploy_token || envConfig.deploy_token;
  const apiKey = opts.key || localConfig.key || globalConfig.api_key || envConfig.api_key || null;
  const runtimeKey = apiKey || key;

  const node = new NexusNode({
    key: runtimeKey,
    name: opts.name || localConfig.name || globalConfig.node_name || globalConfig.name || globalConfig.node_id || envConfig.node_name,
    port: parseInt(opts.port || envConfig.port || 3100, 10),
    type: opts.type || envConfig.type || 'local',
    server: opts.url || opts.server || localConfig.server || globalConfig.server || envConfig.server || 'https://app.vutler.ai',
    mode: envConfig.mode || globalConfig.mode || 'local',
    snipara_instance_id: envConfig.snipara_instance_id || globalConfig.snipara_instance_id,
    client_name: envConfig.client_name || globalConfig.client_name,
    filesystem_root: envConfig.filesystem_root || globalConfig.filesystem_root,
    role: envConfig.role || globalConfig.role,
    deploy_token: globalConfig.deploy_token || envConfig.deploy_token,
    permissions: envConfig.permissions || globalConfig.permissions,
    seats: envConfig.seats || globalConfig.seats,
    primary_agent: envConfig.primary_agent || globalConfig.primary_agent,
    agents: envConfig.agents || globalConfig.agents,
    routing_rules: envConfig.routing_rules || globalConfig.routing_rules,
    auto_spawn_rules: envConfig.auto_spawn_rules || globalConfig.auto_spawn_rules,
    available_pool: envConfig.available_pool || globalConfig.available_pool,
    allow_create: envConfig.allow_create ?? globalConfig.allow_create,
    offline_config: envConfig.offline_config || globalConfig.offline_config,
    llm: envConfig.llm || globalConfig.llm,
  });

  if (!runtimeKey) {
    console.log('[Nexus] No deploy token configured. Starting local setup dashboard...');
    await node.startDashboardOnly();
    const localUrl = `http://localhost:${node.discoveryPort || node.port}/`;
    console.log(`[Nexus] Open ${localUrl} to complete setup.`);
    if (shouldOpenBrowser) openUrl(localUrl);
  } else {
    await node.connect();
  }

  process.on('SIGINT', async () => {
    await node.disconnect();
    process.exit(0);
  });
}

// ─── init <token> ────────────────────────────────────────────────────────────

program.command('init <token>')
  .description('Initialize Nexus with a deploy token')
  .action((token) => {
    let config;
    try {
      config = buildRuntimeConfigFromToken(token);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }

    writeRuntimeConfig(config);

    console.log('Config saved to ~/.vutler/nexus.json');
    console.log('');
    console.log('  mode:                ', config.mode);
    console.log('  node_id:             ', config.node_id || '(assigned on first connect)');
    console.log('  node_name:           ', config.node_name || '(default hostname)');
    console.log('  snipara_instance_id: ', config.snipara_instance_id || '(none)');
    console.log('  permissions:         ', JSON.stringify(config.permissions));

    if (config.mode === 'enterprise') {
      console.log('  client_name:         ', config.client_name || '(none)');
      console.log('  filesystem_root:     ', config.filesystem_root || '(none)');
      console.log('  seats:               ', config.seats || '(none)');
    }
  });

// ─── start ───────────────────────────────────────────────────────────────────

program.command('start')
  .option('--key <key>', 'Workspace API key')
  .option('--name <name>', 'Node name')
  .option('--port <port>', 'Health check port', '3100')
  .option('--type <type>', 'Node type (local|docker|kubernetes)', 'local')
  .option('--server <url>', 'Server URL', 'https://app.vutler.ai')
  .option('--url <url>', 'Server URL (alias for --server)')
  .option('--open-browser', 'Open the local dashboard in the browser')
  .action(async (opts) => {
    await handleStart(opts, { openBrowser: Boolean(opts.openBrowser) });
  });

// ─── dev ─────────────────────────────────────────────────────────────────────

program.command('dev')
  .option('--key <key>', 'Workspace API key')
  .option('--server <url>', 'Server URL', 'http://localhost:3001')
  .option('--url <url>', 'Server URL (alias for --server)')
  .action(async (opts) => {
    let config = {};
    try { config = JSON.parse(require('fs').readFileSync('.vutler-nexus.json', 'utf8')); } catch(e) {}

    const node = new NexusNode({
      key: opts.key || config.key,
      type: 'local',
      name: require('os').hostname() + '-dev',
      server: opts.url || opts.server || 'http://localhost:3001'
    });

    console.log('[Nexus Dev] Starting in development mode...');
    await node.connect();

    process.on('SIGINT', async () => {
      await node.disconnect();
      process.exit(0);
    });
  });

// ─── status ──────────────────────────────────────────────────────────────────

program.command('status')
  .option('--port <port>', 'Local health check port', '3100')
  .description('Show current Nexus node status')
  .action(async (opts) => {
    const http = require('http');
    const https = require('https');

    const config = readRuntimeConfig();
    if (!config) {
      console.log('No config found. Run `vutler-nexus init <token>` first.');
      process.exit(1);
    }

    console.log('Config (~/.vutler/nexus.json):');
    console.log('  mode:       ', config.mode || 'standard');
    console.log('  node_id:    ', config.node_id || '(none)');
    console.log('  server:     ', config.server || 'https://app.vutler.ai');
    console.log('  updated_at: ', config.updated_at || '(unknown)');
    console.log('');

    const server = config.server || 'https://app.vutler.ai';

    // Check cloud API health
    process.stdout.write('Cloud API (' + server + '/health) ... ');
    try {
      await new Promise((resolve, reject) => {
        const url = new URL('/health', server);
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.get({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname }, (res) => {
          res.resume();
          if (res.statusCode < 400) { console.log('OK (' + res.statusCode + ')'); } else { console.log('FAIL (' + res.statusCode + ')'); }
          resolve();
        });
        req.on('error', (e) => { console.log('UNREACHABLE (' + e.message + ')'); resolve(); });
        req.setTimeout(5000, () => { console.log('TIMEOUT'); req.destroy(); resolve(); });
      });
    } catch (e) {
      console.log('ERROR:', e.message);
    }

    // Check local health server
    const port = parseInt(opts.port);
    process.stdout.write('Local health (http://localhost:' + port + '/health) ... ');
    try {
      await new Promise((resolve) => {
        const req = http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const body = JSON.parse(data);
              console.log('OK — node ' + (body.nodeId || '?') + ', uptime ' + Math.round(body.uptime || 0) + 's');
            } catch (e) {
              console.log('OK');
            }
            resolve();
          });
        });
        req.on('error', (e) => { console.log('OFFLINE (' + e.message + ')'); resolve(); });
        req.setTimeout(3000, () => { console.log('TIMEOUT'); req.destroy(); resolve(); });
      });
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  });

// ─── logs ────────────────────────────────────────────────────────────────────

program.command('logs')
  .description('Show Nexus logs')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .action((opts) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const readline = require('readline');

    const logPath = path.join(os.homedir(), '.vutler', 'logs', 'nexus.log');

    if (!fs.existsSync(logPath)) {
      console.log('No log file found at', logPath);
      process.exit(0);
    }

    if (opts.follow) {
      // Stream new lines as they arrive
      const stream = fs.createReadStream(logPath);
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      const buffer = [];

      rl.on('line', (line) => buffer.push(line));
      rl.on('close', () => {
        // Print last N lines from the initial read
        const n = parseInt(opts.lines);
        buffer.slice(-n).forEach(l => console.log(l));

        // Then watch for new content
        let pos = fs.statSync(logPath).size;
        fs.watchFile(logPath, { interval: 500 }, () => {
          const stat = fs.statSync(logPath);
          if (stat.size <= pos) return;
          const chunk = Buffer.alloc(stat.size - pos);
          const fd = fs.openSync(logPath, 'r');
          fs.readSync(fd, chunk, 0, chunk.length, pos);
          fs.closeSync(fd);
          pos = stat.size;
          process.stdout.write(chunk.toString());
        });

        process.on('SIGINT', () => {
          fs.unwatchFile(logPath);
          process.exit(0);
        });
      });
    } else {
      // Print last N lines
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const n = parseInt(opts.lines);
      lines.slice(-n).forEach(l => console.log(l));
    }
  });

// ─── test ────────────────────────────────────────────────────────────────────

program.command('test')
  .description('Test Nexus connectivity and providers')
  .action(async () => {
    const https = require('https');
    const http = require('http');

    const config = readConfig() || {};
    const server = config.server || 'https://app.vutler.ai';
    const key = config.api_key || config.deploy_token;

    function apiGet(url, authKey) {
      return new Promise((resolve) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const reqOpts = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname,
          method: 'GET',
          headers: authKey ? { 'Authorization': 'Bearer ' + authKey } : {},
        };
        const req = lib.request(reqOpts, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
            catch (e) { resolve({ status: res.statusCode, body: data }); }
          });
        });
        req.on('error', (e) => resolve({ status: null, error: e.message }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ status: null, error: 'timeout' }); });
        req.end();
      });
    }

    function apiPost(url, authKey, body) {
      return new Promise((resolve) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(body);
        const reqOpts = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...(authKey ? { 'Authorization': 'Bearer ' + authKey } : {}),
          },
        };
        const req = lib.request(reqOpts, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
            catch (e) { resolve({ status: res.statusCode, body: data }); }
          });
        });
        req.on('error', (e) => resolve({ status: null, error: e.message }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ status: null, error: 'timeout' }); });
        req.write(payload);
        req.end();
      });
    }

    function pass(label) { console.log('  [PASS]', label); }
    function fail(label, reason) { console.log('  [FAIL]', label, reason ? '— ' + reason : ''); }

    console.log('Running Nexus connectivity tests...\n');

    // 1. Cloud API health
    process.stdout.write('1. Cloud API health ... ');
    const healthRes = await apiGet(server + '/api/v1/health');
    if (healthRes.status && healthRes.status < 400) {
      pass('GET /api/v1/health (' + healthRes.status + ')');
    } else {
      fail('GET /api/v1/health', healthRes.error || 'HTTP ' + healthRes.status);
    }

    // 2. Auth (dry-run register)
    process.stdout.write('2. Auth (register dry-run) ... ');
    if (!key) {
      fail('POST /api/v1/nexus/register', 'no token — run `vutler-nexus init <token>` first');
    } else {
      const regRes = await apiPost(server + '/api/v1/nexus/register', key, {
        name: require('os').hostname() + '-test',
        type: 'local',
        host: require('os').hostname(),
        port: 0,
        dry_run: true,
        mode: config.mode || 'standard',
      });
      if (regRes.status && regRes.status < 500) {
        pass('POST /api/v1/nexus/register (HTTP ' + regRes.status + ')');
      } else {
        fail('POST /api/v1/nexus/register', regRes.error || 'HTTP ' + regRes.status);
      }
    }

    // 3. Providers check
    console.log('3. Providers:');
    const providerNames = ['fs', 'shell', 'env', 'network', 'llm', 'av'];
    const permissions = config.permissions || {};
    for (const name of providerNames) {
      const enabled = Object.keys(permissions).length === 0 || permissions[name] !== false;
      if (enabled) {
        pass('provider:' + name + ' (enabled)');
      } else {
        console.log('  [SKIP]', 'provider:' + name, '— disabled by permissions');
      }
    }

    console.log('\nDone.');
  });

// ─── agents ──────────────────────────────────────────────────────────────────

program.command('agents')
  .description('List running agents on this node')
  .option('--port <port>', 'Local health check port', '3100')
  .action(async (opts) => {
    const http = require('http');

    const config = readConfig();
    if (!config) {
      console.log('No config found. Run `vutler-nexus init <token>` first.');
      process.exit(1);
    }

    const port = parseInt(opts.port);

    // Try to read agents from local health endpoint
    await new Promise((resolve) => {
      const req = http.get({ hostname: 'localhost', port, path: '/agents' }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            const agents = body.agents || [];

            if (!agents.length) {
              console.log('No agents running on this node.');
              return resolve();
            }

            // Determine column widths
            const nameW = Math.max(4, ...agents.map(a => (a.name || '').length));
            const modelW = Math.max(5, ...agents.map(a => (a.model || '').length));
            const statusW = Math.max(6, ...agents.map(a => (a.status || '').length));
            const tasksW = Math.max(5, ...agents.map(a => String(a.tasks ?? 0).length));

            const pad = (s, w) => String(s || '').padEnd(w);
            const line = (ch) => ch.repeat(nameW + modelW + statusW + tasksW + 13);

            console.log('┌' + '─'.repeat(nameW + 2) + '┬' + '─'.repeat(modelW + 2) + '┬' + '─'.repeat(statusW + 2) + '┬' + '─'.repeat(tasksW + 2) + '┐');
            console.log('│ ' + pad('Name', nameW) + ' │ ' + pad('Model', modelW) + ' │ ' + pad('Status', statusW) + ' │ ' + pad('Tasks', tasksW) + ' │');
            console.log('├' + '─'.repeat(nameW + 2) + '┼' + '─'.repeat(modelW + 2) + '┼' + '─'.repeat(statusW + 2) + '┼' + '─'.repeat(tasksW + 2) + '┤');
            for (const a of agents) {
              console.log('│ ' + pad(a.name, nameW) + ' │ ' + pad(a.model, modelW) + ' │ ' + pad(a.status, statusW) + ' │ ' + pad(a.tasks ?? 0, tasksW) + ' │');
            }
            console.log('└' + '─'.repeat(nameW + 2) + '┴' + '─'.repeat(modelW + 2) + '┴' + '─'.repeat(statusW + 2) + '┴' + '─'.repeat(tasksW + 2) + '┘');

            const maxSeats = body.max_seats || null;
            const seatInfo = maxSeats !== null ? `${agents.length}/${maxSeats}` : `${agents.length}`;
            console.log('Seats: ' + seatInfo + ' used');
          } catch (e) {
            console.error('Error: Could not parse agent list from local runtime —', e.message);
          }
          resolve();
        });
      });
      req.on('error', () => {
        // Fall back to token payload
        try {
          const payload = decodeDeployToken(config.deploy_token);
          const agentIds = payload.agents || (payload.primary_agent ? [payload.primary_agent] : []);
          if (!agentIds.length) {
            console.log('Node is offline and no agent info found in token.');
          } else {
            console.log('[offline] Agents in token: ' + agentIds.join(', '));
            const seats = payload.seats || agentIds.length;
            const maxSeats = payload.max_seats || null;
            console.log('Seats: ' + seats + (maxSeats ? '/' + maxSeats : '') + ' used (from token)');
          }
        } catch (_) {
          console.log('Node is offline (http://localhost:' + port + '/agents unreachable).');
        }
        resolve();
      });
      req.setTimeout(3000, () => { req.destroy(); });
    });
  });

// ─── spawn <agent-name> ───────────────────────────────────────────────────────

program.command('spawn <agent-name>')
  .description('Enterprise: spawn an agent from the available pool')
  .option('--port <port>', 'Local health check port', '3100')
  .action(async (agentName, opts) => {
    const http = require('http');

    const config = readConfig();
    if (!config) {
      console.log('No config found. Run `vutler-nexus init <token>` first.');
      process.exit(1);
    }

    let payload;
    try {
      payload = decodeDeployToken(config.deploy_token);
    } catch (e) {
      console.error('Error: Failed to decode token —', e.message);
      process.exit(1);
    }

    if (payload.mode !== 'enterprise') {
      console.error('Error: `spawn` is only available in enterprise mode.');
      process.exit(1);
    }

    const pool = payload.available_pool || [];
    if (!pool.length) {
      console.error('Error: No available_pool found in token. Re-issue the deploy token with poolAgentIds.');
      process.exit(1);
    }

    console.log('[Nexus] Spawning agent "' + agentName + '" from available pool...');

    const port = parseInt(opts.port);
    const spawnBody = JSON.stringify({ agentName });

    await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/agents/spawn',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(spawnBody) },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (body.success === false) {
              console.error('[Nexus] Spawn failed:', body.error || 'unknown error');
              return resolve();
            }
            const agent = body.agent || {};
            console.log('[Nexus] Agent "' + (agent.name || agentName) + '" loaded (' + (agent.model || 'unknown model') + ')');
            const seats = body.seats || {};
            if (seats.used !== undefined) {
              console.log('[Nexus] Seats: ' + seats.used + (seats.max ? '/' + seats.max : '') + ' used');
            }
          } catch (e) {
            console.error('[Nexus] Unexpected response:', e.message);
          }
          resolve();
        });
      });
      req.on('error', (e) => {
        console.error('[Nexus] Could not reach local runtime (http://localhost:' + port + ') —', e.message);
        console.log('[Nexus] Make sure the node is running with `vutler-nexus start`.');
        resolve();
      });
      req.setTimeout(5000, () => { req.destroy(); });
      req.write(spawnBody);
      req.end();
    });
  });

// ─── create-agent ─────────────────────────────────────────────────────────────

program.command('create-agent')
  .description('Enterprise: interactive wizard to create a new agent on this node')
  .option('--server <url>', 'Override server URL')
  .action(async (opts) => {
    const readline = require('readline');
    const https = require('https');
    const http = require('http');

    const config = readConfig();
    if (!config) {
      console.log('No config found. Run `vutler-nexus init <token>` first.');
      process.exit(1);
    }

    let payload;
    try {
      payload = decodeDeployToken(config.deploy_token);
    } catch (e) {
      console.error('Error: Failed to decode token —', e.message);
      process.exit(1);
    }

    if (payload.mode !== 'enterprise') {
      console.error('Error: `create-agent` is only available in enterprise mode.');
      process.exit(1);
    }

    if (payload.allow_create === false) {
      console.error('Error: This token does not permit agent creation (allow_create is false).');
      process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    const name = (await ask('Agent name: ')).trim();
    if (!name) { console.error('Error: Agent name is required.'); rl.close(); process.exit(1); }

    const role = (await ask('Role: ')).trim() || 'general';
    const description = (await ask('Description: ')).trim();
    const modelInput = (await ask('Model [gpt-5.4]: ')).trim();
    const model = modelInput || 'gpt-5.4';
    const system_prompt = (await ask('System prompt: ')).trim();
    rl.close();

    const nodeId = config.node_id || payload.node_id;
    const server = opts.server || config.server || 'https://app.vutler.ai';
    const apiKey = config.api_key || config.deploy_token;

    console.log('[Nexus] Creating agent "' + name + '"...');

    const body = JSON.stringify({ name, role, description, model, system_prompt });
    const parsed = new URL(`/api/v1/nexus/${nodeId}/agents/create`, server);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve) => {
      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': 'Bearer ' + apiKey,
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const resp = JSON.parse(data);
            if (!resp.success) {
              console.error('[Nexus] Error:', resp.error || 'Agent creation failed');
              return resolve();
            }
            const agent = resp.agent || {};
            console.log('[Nexus] Agent created (id: ' + agent.id + ')');
            const seats = resp.seats || {};
            if (seats.used !== undefined) {
              console.log('[Nexus] Seats: ' + seats.used + (seats.max ? '/' + seats.max : '') + ' used');
            }
          } catch (e) {
            console.error('[Nexus] Unexpected response:', e.message);
          }
          resolve();
        });
      });
      req.on('error', (e) => {
        console.error('[Nexus] Request failed —', e.message);
        resolve();
      });
      req.setTimeout(10000, () => { req.destroy(); console.error('[Nexus] Request timed out.'); resolve(); });
      req.write(body);
      req.end();
    });
  });

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    await handleStart({}, { openBrowser: true });
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
