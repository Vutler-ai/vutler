#!/usr/bin/env node
const { Command } = require('commander');
const { NexusNode } = require('../index');

const program = new Command();
program.name('vutler-nexus').version('0.1.0').description('Vutler Nexus Agent Runtime');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfigPath() {
  const os = require('os');
  const path = require('path');
  return path.join(os.homedir(), '.vutler', 'nexus.json');
}

function readConfig() {
  const fs = require('fs');
  const configPath = getConfigPath();
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function decodeDeployToken(token) {
  // Deploy tokens are structured as: header.payload.signature (base64url encoded parts)
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format — expected header.payload.signature');

  const payload = parts[1];
  // base64url → base64 → Buffer
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json);
}

// ─── init <token> ────────────────────────────────────────────────────────────

program.command('init <token>')
  .description('Initialize Nexus with a deploy token')
  .action((token) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    let payload;
    try {
      payload = decodeDeployToken(token);
    } catch (e) {
      console.error('Error: Failed to decode token —', e.message);
      process.exit(1);
    }

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.error('Error: Token has expired.');
      process.exit(1);
    }

    const configDir = path.join(os.homedir(), '.vutler');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const config = {
      deploy_token: token,
      mode: payload.mode || 'standard',
      node_id: payload.node_id || null,
      snipara_instance_id: payload.snipara_instance_id || null,
      permissions: payload.permissions || {},
      server: payload.server || 'https://app.vutler.ai',
      updated_at: new Date().toISOString(),
    };

    // Enterprise-only fields
    if (payload.mode === 'enterprise') {
      config.client_name = payload.client_name || null;
      config.filesystem_root = payload.filesystem_root || null;
    }

    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));

    console.log('Config saved to ~/.vutler/nexus.json');
    console.log('');
    console.log('  mode:                ', config.mode);
    console.log('  node_id:             ', config.node_id || '(assigned on first connect)');
    console.log('  snipara_instance_id: ', config.snipara_instance_id || '(none)');
    console.log('  permissions:         ', JSON.stringify(config.permissions));

    if (payload.mode === 'enterprise') {
      console.log('  client_name:         ', config.client_name || '(none)');
      console.log('  filesystem_root:     ', config.filesystem_root || '(none)');
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
  .action(async (opts) => {
    // Legacy local config fallback
    let localConfig = {};
    try { localConfig = JSON.parse(require('fs').readFileSync('.vutler-nexus.json', 'utf8')); } catch(e) {}

    // Global config from ~/.vutler/nexus.json (preferred)
    const globalConfig = readConfig() || {};

    const key = opts.key || localConfig.key || globalConfig.deploy_token;
    if (!key) {
      console.error('Error: No API key or deploy token found. Run `vutler-nexus init <token>` or pass --key.');
      process.exit(1);
    }

    const node = new NexusNode({
      key,
      name: opts.name || localConfig.name || globalConfig.node_id,
      port: parseInt(opts.port),
      type: opts.type,
      server: opts.url || opts.server || localConfig.server || globalConfig.server || 'https://app.vutler.ai',
      mode: globalConfig.mode,
      snipara_instance_id: globalConfig.snipara_instance_id,
      client_name: globalConfig.client_name,
      filesystem_root: globalConfig.filesystem_root,
      role: globalConfig.role,
      deploy_token: globalConfig.deploy_token,
      permissions: globalConfig.permissions,
    });

    await node.connect();

    process.on('SIGINT', async () => {
      await node.disconnect();
      process.exit(0);
    });
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

    const config = readConfig();
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
    const key = config.deploy_token;

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
    const modelInput = (await ask('Model [gpt-4o]: ')).trim();
    const model = modelInput || 'gpt-4o';
    const system_prompt = (await ask('System prompt: ')).trim();
    rl.close();

    const nodeId = payload.node_id;
    const server = opts.server || config.server || 'https://app.vutler.ai';
    const apiKey = config.deploy_token;

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

program.parse();
