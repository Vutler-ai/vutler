'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_API_URL = 'https://app.vutler.ai';
const DEFAULT_API_KEY_PLACEHOLDER = 'vt_your_key_here';
const DEFAULT_SERVER_NAME = 'vutler';

const CLIENT_CONFIG_TEMPLATES = {
  'claude-code': {
    label: 'Claude Code',
    defaultPath: ({ cwd }) => path.join(cwd, '.mcp.json'),
  },
  'claude-desktop': {
    label: 'Claude Desktop',
    defaultPath: () => path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  },
  cursor: {
    label: 'Cursor',
    defaultPath: ({ cwd }) => path.join(cwd, '.mcp.json'),
  },
  continue: {
    label: 'Continue.dev',
    defaultPath: ({ cwd }) => path.join(cwd, '.mcp.json'),
  },
  vscode: {
    label: 'VS Code',
    defaultPath: ({ cwd }) => path.join(cwd, '.mcp.json'),
  },
};

function normalizeClientName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'claude-code';
  if (raw === 'claude' || raw === 'claude_desktop') return 'claude-desktop';
  if (raw === 'claudecode' || raw === 'claude_code') return 'claude-code';
  if (raw === 'continue.dev') return 'continue';
  if (raw === 'vs-code' || raw === 'vs_code' || raw === 'code') return 'vscode';
  return raw;
}

function getSupportedClients() {
  return Object.keys(CLIENT_CONFIG_TEMPLATES);
}

function getClientTemplate(clientName) {
  const normalized = normalizeClientName(clientName);
  const template = CLIENT_CONFIG_TEMPLATES[normalized];
  if (!template) {
    throw new Error(`Unsupported client "${clientName}". Supported clients: ${getSupportedClients().join(', ')}`);
  }
  return {
    key: normalized,
    ...template,
  };
}

function buildServerConfig({
  apiUrl = process.env.VUTLER_API_URL || DEFAULT_API_URL,
  apiKey = DEFAULT_API_KEY_PLACEHOLDER,
} = {}) {
  return {
    command: 'npx',
    args: ['-y', '@vutler/mcp'],
    env: {
      VUTLER_API_URL: apiUrl,
      VUTLER_API_KEY: apiKey,
    },
  };
}

function buildClientConfig(clientName, options = {}) {
  const template = getClientTemplate(clientName);
  return {
    label: template.label,
    client: template.key,
    config: {
      mcpServers: {
        [DEFAULT_SERVER_NAME]: buildServerConfig(options),
      },
    },
  };
}

function formatEnvTemplate({
  apiUrl = process.env.VUTLER_API_URL || DEFAULT_API_URL,
  apiKey = DEFAULT_API_KEY_PLACEHOLDER,
} = {}) {
  return `VUTLER_API_URL=${apiUrl}\nVUTLER_API_KEY=${apiKey}\n`;
}

function resolveDefaultConfigPath(clientName, { cwd = process.cwd(), explicitPath = null } = {}) {
  if (explicitPath) return path.resolve(explicitPath);
  const template = getClientTemplate(clientName);
  return path.resolve(template.defaultPath({ cwd }));
}

function mergeMcpConfig(existingConfig = {}, serverName, serverConfig) {
  const base = existingConfig && typeof existingConfig === 'object' && !Array.isArray(existingConfig)
    ? existingConfig
    : {};

  return {
    ...base,
    mcpServers: {
      ...(base.mcpServers && typeof base.mcpServers === 'object' && !Array.isArray(base.mcpServers)
        ? base.mcpServers
        : {}),
      [serverName]: serverConfig,
    },
  };
}

function writeClientConfig({
  clientName,
  apiUrl = process.env.VUTLER_API_URL || DEFAULT_API_URL,
  apiKey = DEFAULT_API_KEY_PLACEHOLDER,
  cwd = process.cwd(),
  filePath = null,
  dryRun = false,
  force = false,
} = {}) {
  const template = getClientTemplate(clientName);
  const resolvedPath = resolveDefaultConfigPath(template.key, { cwd, explicitPath: filePath });
  const nextConfig = buildClientConfig(template.key, { apiUrl, apiKey }).config;

  let existingConfig = {};
  let action = 'created';
  let backupPath = null;

  if (fs.existsSync(resolvedPath)) {
    const currentRaw = fs.readFileSync(resolvedPath, 'utf8');
    if (String(currentRaw).trim()) {
      try {
        existingConfig = JSON.parse(currentRaw);
      } catch (error) {
        if (!force) {
          throw new Error(`Existing config at ${resolvedPath} is not valid JSON. Re-run with --force to replace it.`);
        }
        backupPath = `${resolvedPath}.bak.${Date.now()}`;
        if (!dryRun) {
          fs.copyFileSync(resolvedPath, backupPath);
        }
        existingConfig = {};
      }
    }
    action = 'updated';
  }

  const merged = mergeMcpConfig(existingConfig, DEFAULT_SERVER_NAME, nextConfig.mcpServers[DEFAULT_SERVER_NAME]);
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;

  if (!dryRun) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, serialized, 'utf8');
  }

  return {
    client: template.key,
    label: template.label,
    path: resolvedPath,
    action,
    backupPath,
    dryRun,
    usedPlaceholderKey: apiKey === DEFAULT_API_KEY_PLACEHOLDER,
    config: merged,
  };
}

function inspectClientConfig({
  clientName,
  cwd = process.cwd(),
  filePath = null,
} = {}) {
  const template = getClientTemplate(clientName);
  const resolvedPath = resolveDefaultConfigPath(template.key, { cwd, explicitPath: filePath });
  const report = {
    client: template.key,
    label: template.label,
    path: resolvedPath,
    exists: false,
    validJson: false,
    hasVutlerServer: false,
    usesExpectedPackage: false,
    apiUrl: DEFAULT_API_URL,
    apiKeyState: 'missing',
    command: null,
    args: [],
    ready: false,
    issues: [],
  };

  if (!fs.existsSync(resolvedPath)) {
    report.issues.push(`No config file found at ${resolvedPath}.`);
    return report;
  }

  report.exists = true;

  const currentRaw = fs.readFileSync(resolvedPath, 'utf8');
  if (!String(currentRaw).trim()) {
    report.issues.push(`Config file at ${resolvedPath} is empty.`);
    return report;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(currentRaw);
    report.validJson = true;
  } catch (_) {
    report.issues.push(`Config file at ${resolvedPath} is not valid JSON.`);
    return report;
  }

  const serverConfig = parsed?.mcpServers?.[DEFAULT_SERVER_NAME];
  if (!serverConfig || typeof serverConfig !== 'object' || Array.isArray(serverConfig)) {
    report.issues.push(`Config file at ${resolvedPath} does not define mcpServers.${DEFAULT_SERVER_NAME}.`);
    return report;
  }

  report.hasVutlerServer = true;
  report.command = typeof serverConfig.command === 'string' ? serverConfig.command : null;
  report.args = Array.isArray(serverConfig.args) ? serverConfig.args : [];
  report.usesExpectedPackage = report.command === 'npx' && report.args.includes('@vutler/mcp');

  if (!report.usesExpectedPackage) {
    report.issues.push(`mcpServers.${DEFAULT_SERVER_NAME} is not configured to launch @vutler/mcp via npx.`);
  }

  const env = serverConfig.env && typeof serverConfig.env === 'object' && !Array.isArray(serverConfig.env)
    ? serverConfig.env
    : {};

  if (typeof env.VUTLER_API_URL === 'string' && env.VUTLER_API_URL.trim()) {
    report.apiUrl = env.VUTLER_API_URL.trim();
  }

  const apiKey = typeof env.VUTLER_API_KEY === 'string' ? env.VUTLER_API_KEY.trim() : '';
  if (!apiKey) {
    report.apiKeyState = 'missing';
    report.issues.push(`Config file at ${resolvedPath} does not set VUTLER_API_KEY.`);
  } else if (apiKey === DEFAULT_API_KEY_PLACEHOLDER) {
    report.apiKeyState = 'placeholder';
    report.issues.push(`Config file at ${resolvedPath} still uses the placeholder VUTLER_API_KEY.`);
  } else {
    report.apiKeyState = 'embedded';
  }

  report.ready = report.exists
    && report.validJson
    && report.hasVutlerServer
    && report.usesExpectedPackage
    && report.apiKeyState === 'embedded';

  return report;
}

module.exports = {
  CLIENT_CONFIG_TEMPLATES,
  DEFAULT_API_URL,
  DEFAULT_API_KEY_PLACEHOLDER,
  DEFAULT_SERVER_NAME,
  normalizeClientName,
  getSupportedClients,
  getClientTemplate,
  buildServerConfig,
  buildClientConfig,
  formatEnvTemplate,
  resolveDefaultConfigPath,
  mergeMcpConfig,
  writeClientConfig,
  inspectClientConfig,
};
