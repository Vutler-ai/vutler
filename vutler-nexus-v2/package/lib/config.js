/**
 * @vutler/nexus — Enhanced Config Manager
 * Reads/writes ~/.vutler/config.json with full agent configuration
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.vutler');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  cloudUrl: 'app.vutler.ai',
  token: null,
  connectedAt: null,
  lastSync: null,
  workspace: path.join(os.homedir(), '.vutler', 'workspace'),
  webPort: 3939,
  llm: {
    provider: 'claude-code', // claude-code | anthropic | openai | ollama | kimi
    model: 'claude-sonnet-4-20250514',
    apiKey: null, // Required for anthropic, openai, kimi
    baseUrl: '', // Optional for openai (default: https://api.openai.com/v1)
    ollamaHost: 'localhost', // For ollama provider
    ollamaPort: 11434, // For ollama provider
    maxTokens: 4096,
    temperature: 0.7,
    claudePath: 'claude' // Path to claude CLI executable (claude-code provider)
  },
  agent: {
    name: 'Jarvis',
    systemPrompt: 'auto',
    contextFiles: ['SOUL.md', 'MEMORY.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md']
  },
  permissions: {
    shell: true,
    fileRead: true,
    fileWrite: true,
    network: true,
    system: true,
    apps: false,
    clipboard: false,
    screenshot: false,
    allowedPaths: [],
    blockedCommands: ["rm -rf /", "sudo rm", "mkfs", "dd if=", ":(){:|:&};:", "chmod -R 777 /"]
  },
  features: {
    webInterface: true,
    cloudSync: true,
    localChat: true,
    fileAccess: true,
    shellAccess: false
  }
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function ensureWorkspace(workspacePath) {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  // Ensure memory directory exists
  const memoryDir = path.join(workspacePath, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
}

function read() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Deep merge with defaults
    return {
      ...DEFAULTS,
      ...parsed,
      llm: { ...DEFAULTS.llm, ...(parsed.llm || {}) },
      agent: { ...DEFAULTS.agent, ...(parsed.agent || {}) },
      features: { ...DEFAULTS.features, ...(parsed.features || {}) },
      permissions: { ...DEFAULTS.permissions, ...(parsed.permissions || {}) }
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data) {
  ensureDir();
  const current = read();
  const merged = { ...current, ...data };
  
  // Deep merge nested objects
  if (data.llm) merged.llm = { ...current.llm, ...data.llm };
  if (data.agent) merged.agent = { ...current.agent, ...data.agent };
  if (data.features) merged.features = { ...current.features, ...data.features };
  if (data.permissions) merged.permissions = { ...current.permissions, ...data.permissions };
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  
  // Ensure workspace directory exists
  if (merged.workspace) {
    ensureWorkspace(merged.workspace);
  }
  
  return merged;
}

function clear() {
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
}

function getWorkspacePath() {
  const config = read();
  return config.workspace;
}

function isConfigured() {
  const config = read();
  return !!(config.token || canRunOffline());
}

function canRunOffline() {
  const config = read();
  // Can run offline with any provider that has proper configuration
  if (config.llm?.provider === 'claude-code') {
    return true; // Assumes claude CLI is available
  }
  if (config.llm?.provider === 'ollama') {
    return true; // Local ollama doesn't need API key
  }
  // API-based providers need API keys
  return !!(config.llm?.apiKey);
}

function canUseLLM() {
  const config = read();
  
  // Cloud mode
  if (config.mode === 'cloud') {
    return !!(config.vutlerApiKey);
  }
  
  // Local mode
  if (config.llm?.provider === 'claude-code') {
    return true; // Assume claude CLI is available
  }
  if (config.llm?.provider === 'ollama') {
    return true; // Local provider doesn't need API key
  }
  // API-based providers need API keys
  return !!(config.llm?.apiKey);
}

// Get provider-specific configuration
function getProviderConfig(providerName) {
  const config = read();
  const llmConfig = config.llm || {};
  
  const baseConfig = {
    provider: providerName || llmConfig.provider,
    model: llmConfig.model,
    maxTokens: llmConfig.maxTokens,
    temperature: llmConfig.temperature,
  };
  
  switch (providerName || llmConfig.provider) {
    case 'claude-code':
      return {
        ...baseConfig,
        claudePath: llmConfig.claudePath || 'claude'
      };
      
    case 'anthropic':
      return {
        ...baseConfig,
        apiKey: llmConfig.apiKey
      };
      
    case 'openai':
      return {
        ...baseConfig,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl || 'https://api.openai.com/v1'
      };
      
    case 'ollama':
      return {
        ...baseConfig,
        ollamaHost: llmConfig.ollamaHost || 'localhost',
        ollamaPort: llmConfig.ollamaPort || 11434
      };
      
    case 'kimi':
      return {
        ...baseConfig,
        apiKey: llmConfig.apiKey,
        baseUrl: 'https://api.moonshot.cn/v1'
      };
      
    default:
      return baseConfig;
  }
}

// Validate provider configuration
function validateProviderConfig(providerName, config = null) {
  const cfg = config || read();
  const llmConfig = cfg.llm || {};
  
  const errors = [];
  
  switch (providerName || llmConfig.provider) {
    case 'claude-code':
      // Claude CLI validation would require checking if it's installed
      break;
      
    case 'anthropic':
      if (!llmConfig.apiKey) {
        errors.push('API key required for Anthropic provider');
      }
      break;
      
    case 'openai':
      if (!llmConfig.apiKey) {
        errors.push('API key required for OpenAI provider');
      }
      break;
      
    case 'kimi':
      if (!llmConfig.apiKey) {
        errors.push('API key required for Kimi provider');
      }
      break;
      
    case 'ollama':
      // Ollama validation would require checking if service is running
      break;
      
    default:
      errors.push(`Unknown provider: ${providerName || llmConfig.provider}`);
  }
  
  return errors;
}

module.exports = { 
  read, 
  write, 
  clear, 
  CONFIG_FILE, 
  CONFIG_DIR,
  ensureDir,
  ensureWorkspace,
  getWorkspacePath,
  isConfigured,
  canRunOffline,
  canUseLLM,
  getProviderConfig,
  validateProviderConfig
};