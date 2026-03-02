#!/usr/bin/env node
/**
 * @vutler/nexus CLI - Enhanced with multi-provider LLM support
 * Commands: init, start, stop, status, chat, config
 */
const { program } = require('commander');
const readline = require('readline');
const path = require('path');
const chalk = require('chalk');
const { exec } = require('child_process');

const config = require('../lib/config');
const { NexusTunnel } = require('../lib/tunnel');
const { AgentRuntime } = require('../lib/agent-runtime');
const { WebServer } = require('../lib/web-server');
const { listProviders } = require('../lib/llm-providers');
const NexusCloudOrchestrator = require('../lib/orchestrator-cloud');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');

let activeTunnel = null;
let agentRuntime = null;
let webServer = null;

function log(message) {
  console.log(chalk.blue('[nexus]'), message);
}

function error(message) {
  console.error(chalk.red('[nexus]'), message);
}

function success(message) {
  console.log(chalk.green('[nexus]'), message);
}

function warn(message) {
  console.log(chalk.yellow('[nexus]'), message);
}

function ask(question, defaultVal) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function askPassword(question) {
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });
  
  return new Promise(resolve => {
    rl.question(question + ': ', answer => {
      rl.close();
      resolve(answer.trim());
    });
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (stringToWrite.charCodeAt(0) === 13) {
        rl.output.write('\n');
      } else {
        rl.output.write('*');
      }
    };
  });
}

// Provider information
const providerInfo = {
  'claude-code': {
    name: 'Claude Code CLI',
    description: 'Uses Claude CLI (requires pip install claude-cli). Free with Anthropic Max subscription.',
    requiresApiKey: false,
    checkCommand: 'claude --version'
  },
  'anthropic': {
    name: 'Anthropic API',
    description: 'Direct Anthropic API access. Requires API key and pay-per-use.',
    requiresApiKey: true,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
  },
  'openai': {
    name: 'OpenAI Compatible',
    description: 'OpenAI-compatible APIs. Works with OpenAI, OpenRouter, Groq, Azure, etc.',
    requiresApiKey: true,
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o']
  },
  'ollama': {
    name: 'Ollama (Local)',
    description: 'Local models via Ollama. Completely offline and free.',
    requiresApiKey: false,
    models: ['llama2', 'codellama', 'mistral', 'neural-chat']
  },
  'kimi': {
    name: 'Kimi (Moonshot AI)',
    description: 'Moonshot AI API. Good for coding tasks. Requires API key.',
    requiresApiKey: true,
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  }
};

// Check if Claude CLI is available
function checkClaudeCLI() {
  return new Promise((resolve) => {
    exec('claude --version', (error, stdout, stderr) => {
      if (error) {
        resolve({ available: false, error: error.message });
      } else {
        resolve({ available: true, version: stdout.trim() });
      }
    });
  });
}

// Check if Ollama is available
function checkOllama() {
  return new Promise((resolve) => {
    exec('curl -s http://localhost:11434/api/tags', { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ available: false, error: error.message });
      } else {
        resolve({ available: true, models: JSON.parse(stdout || '{}').models || [] });
      }
    });
  });
}

// Format file size
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// === Auth helpers ===
function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(data);
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function authFlow() {
  console.log(chalk.blue('\n🔐 Vutler Account:'));
  const hasAccount = (await ask('Do you have a Vutler account? (y/n)', 'n')).toLowerCase().startsWith('y');
  
  if (hasAccount) {
    const email = await ask('Email');
    const password = await askPassword('Password');
    
    if (!email || !password) {
      warn('⚠️  Skipping auth — no credentials provided');
      return null;
    }
    
    log('Logging in...');
    try {
      const res = await httpPost('https://app.vutler.ai/api/custom/auth/login', { email, password });
      if (res.status === 200 && res.data?.token) {
        success('✅ Logged in successfully!');
        return { email, token: res.data.token, server: 'https://app.vutler.ai' };
      } else {
        warn('⚠️  Login failed: ' + (res.data?.message || res.data?.error || 'Unknown error'));
        return null;
      }
    } catch (e) {
      warn('⚠️  Login request failed: ' + e.message);
      return null;
    }
  } else {
    const name = await ask('Your name');
    const email = await ask('Email');
    const password = await askPassword('Password');
    const confirmPassword = await askPassword('Confirm password');
    
    if (!email || !password) {
      warn('⚠️  Skipping registration — no credentials provided');
      return null;
    }
    
    if (password !== confirmPassword) {
      warn('⚠️  Passwords do not match');
      return null;
    }
    
    log('Creating account...');
    try {
      const res = await httpPost('https://app.vutler.ai/api/custom/auth/register', { email, password, name });
      if (res.status === 200 && res.data?.token) {
        success('✅ Account created successfully!');
        return { email, token: res.data.token, server: 'https://app.vutler.ai' };
      } else if (res.status === 201 && res.data?.token) {
        success('✅ Account created successfully!');
        return { email, token: res.data.token, server: 'https://app.vutler.ai' };
      } else {
        warn('⚠️  Registration failed: ' + (res.data?.message || res.data?.error || 'Unknown error'));
        return null;
      }
    } catch (e) {
      warn('⚠️  Registration request failed: ' + e.message);
      return null;
    }
  }
}

program
  .name('vutler-nexus')
  .description('Vutler Nexus — Complete local agent runtime with multi-provider LLM support')
  .version('1.0.0');

program
  .command('init')
  .description('Interactive setup for Vutler Nexus')
  .action(async () => {
    console.log(chalk.cyan('\n🔧 Vutler Nexus — Interactive Setup\n'));
    
    // Agent configuration
    console.log(chalk.blue('🤖 Agent Configuration:'));
    const agentName = await ask('Agent name', 'Jarvis');
    const workspace = await ask('Workspace path', path.join(process.env.HOME || process.cwd(), '.vutler', 'workspace'));
    const webPort = parseInt(await ask('Web interface port', '3939')) || 3939;
    
    // Runtime Mode Selection (Local vs Cloud)
    console.log(chalk.blue('\n🌐 Execution Mode:'));
    const modes = [
      { key: 'local', name: 'Local (Claude CLI)', desc: 'Run agents locally using Claude CLI' },
      { key: 'cloud', name: 'Cloud (Vutler API)', desc: 'Route tasks to Vutler cloud agents' }
    ];
    modes.forEach((m, i) => {
      console.log(`  ${i + 1}. ${chalk.cyan(m.name)} - ${m.desc}`);
    });
    const modeIndex = parseInt(await ask('Select execution mode (number)', '1')) || 1;
    const selectedMode = modes[modeIndex - 1];
    
    if (!selectedMode) {
      error('Invalid mode selection');
      process.exit(1);
    }
    
    let cloudConfig = null;
    if (selectedMode.key === 'cloud') {
      console.log(chalk.green(`\n📡 Cloud Mode Configuration:`));
      const vutlerUrl = await ask('Vutler API URL', 'https://app.vutler.ai');
      const apiKey = await askPassword('VUTLER_API_KEY');
      
      if (!apiKey) {
        warn('⚠️  No API key provided. Cloud mode requires VUTLER_API_KEY');
        process.exit(1);
      }
      
      cloudConfig = {
        mode: 'cloud',
        vutlerUrl,
        vutlerApiKey: apiKey
      };
      console.log(chalk.green('✅ Cloud mode configured'));
    }

    // LLM Provider Selection (only for local mode)
    console.log(chalk.blue('\n🧠 LLM Provider Selection:'));
    
    // Check available providers
    const claudeStatus = await checkClaudeCLI();
    const ollamaStatus = await checkOllama();
    
    console.log(chalk.gray('Available providers:'));
    let providerIndex = 1;
    const availableProviders = [];
    
    for (const [key, info] of Object.entries(providerInfo)) {
      let status = '';
      let available = true;
      
      if (key === 'claude-code') {
        status = claudeStatus.available ? chalk.green('✅ Available') : chalk.red('❌ Not installed');
        if (!claudeStatus.available) available = false;
      } else if (key === 'ollama') {
        status = ollamaStatus.available ? chalk.green('✅ Running') : chalk.yellow('⚠️  Not running');
      } else {
        status = chalk.blue('🔑 Requires API key');
      }
      
      console.log(`  ${providerIndex}. ${chalk.cyan(info.name)} - ${info.description} ${status}`);
      availableProviders.push({ key, info, available, index: providerIndex });
      providerIndex++;
    }
    
    const selectedIndex = parseInt(await ask('\nSelect provider (number)', '1')) || 1;
    const selectedProvider = availableProviders.find(p => p.index === selectedIndex);
    
    if (!selectedProvider) {
      error('Invalid provider selection');
      process.exit(1);
    }
    
    const provider = selectedProvider.key;
    const providerData = selectedProvider.info;
    
    console.log(chalk.green(`\n📡 Selected: ${providerData.name}`));
    
    // Configure selected provider
    let llmConfig = {
      provider: provider,
      maxTokens: parseInt(await ask('Max tokens', '4096')) || 4096,
      temperature: parseFloat(await ask('Temperature (0.0-1.0)', '0.7')) || 0.7,
    };
    
    // Provider-specific configuration
    switch (provider) {
      case 'claude-code':
        if (!claudeStatus.available) {
          warn('⚠️  Claude CLI not found. Install with: pip install claude-cli');
        }
        llmConfig.model = await ask('Claude model hint', 'claude-sonnet-4-20250514');
        llmConfig.claudePath = await ask('Claude CLI path', 'claude');
        break;
        
      case 'anthropic':
        llmConfig.model = await ask('Claude model', providerData.models[0]);
        llmConfig.apiKey = await askPassword('Anthropic API key (sk-ant-...)');
        break;
        
      case 'openai':
        llmConfig.model = await ask('Model', providerData.models[0]);
        llmConfig.apiKey = await askPassword('API key');
        const baseUrl = await ask('Base URL (leave empty for OpenAI)', '');
        if (baseUrl) llmConfig.baseUrl = baseUrl;
        break;
        
      case 'ollama':
        if (ollamaStatus.available && ollamaStatus.models.length > 0) {
          console.log(chalk.blue('\nAvailable Ollama models:'));
          ollamaStatus.models.forEach((model, i) => {
            console.log(`  ${i + 1}. ${model.name}`);
          });
        }
        llmConfig.model = await ask('Model name', providerData.models[0]);
        llmConfig.ollamaHost = await ask('Ollama host', 'localhost');
        llmConfig.ollamaPort = parseInt(await ask('Ollama port', '11434')) || 11434;
        break;
        
      case 'kimi':
        llmConfig.model = await ask('Kimi model', providerData.models[0]);
        llmConfig.apiKey = await askPassword('Kimi API key');
        break;
    }
    
    // Cloud configuration (optional)
    console.log(chalk.blue('\n☁️  Cloud Integration (optional):'));
    const cloudUrl = await ask('Cloud URL', 'app.vutler.ai');
    const token = await ask('Pairing token (leave empty to skip)');
    
    // Features
    console.log(chalk.blue('\n🔧 Features:'));
    const enableShell = (await ask('Enable shell access? (y/N)', 'N')).toLowerCase().startsWith('y');
    const enableFileWrite = (await ask('Enable file write? (Y/n)', 'Y')).toLowerCase().startsWith('y') || true;
    const enableNetwork = (await ask('Enable network access? (Y/n)', 'Y')).toLowerCase().startsWith('y') || true;
    const enableApps = false;
    const enableClipboard = false;
    const enableScreenshot = false;
    
    // Auth flow
    const authResult = await authFlow();
    
    // Build configuration
    const newConfig = {
      mode: cloudConfig?.mode || 'local',
      vutlerUrl: cloudConfig?.vutlerUrl,
      vutlerApiKey: cloudConfig?.vutlerApiKey,
      cloudUrl,
      token: token || null,
      workspace,
      webPort,
      llm: cloudConfig ? { provider: 'cloud' } : llmConfig,
      auth: authResult || undefined,
      agent: {
        name: agentName,
        systemPrompt: 'auto',
        contextFiles: ['SOUL.md', 'MEMORY.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md']
      },
      permissions: {
        shell: enableShell,
        fileRead: true,
        fileWrite: enableFileWrite,
        network: enableNetwork,
        system: true,
        apps: enableApps,
        clipboard: enableClipboard,
        screenshot: enableScreenshot,
        allowedPaths: [],
        blockedCommands: ['rm -rf /', 'sudo rm', 'mkfs', 'dd if=', ':(){:|:&};:', 'chmod -R 777 /']
      },
      features: {
        webInterface: true,
        cloudSync: !!token,
        localChat: true,
        fileAccess: true,
        shellAccess: enableShell
      }
    };
    
    // Validate configuration
    if (providerData.requiresApiKey && !llmConfig.apiKey) {
      warn(`⚠️  No API key provided for ${providerData.name}. You can add it later via settings.`);
    }
    
    // Save configuration
    config.write(newConfig);
    
    console.log(chalk.green(`\n✅ Configuration saved to ${config.CONFIG_FILE}`));
    console.log(`   Agent: ${chalk.cyan(agentName)}`);
    console.log(`   Mode: ${chalk.cyan(selectedMode.name)}`);
    if (cloudConfig) {
      console.log(`   Vutler API: ${chalk.cyan(cloudConfig.vutlerUrl)}`);
    } else {
      console.log(`   LLM: ${chalk.cyan(providerData.name)}`);
    }
    console.log(`   Workspace: ${chalk.cyan(workspace)}`);
    console.log(`   Web UI: ${chalk.cyan(`http://localhost:${webPort}`)}`);
    if (token) {
      console.log(`   Cloud: ${chalk.cyan(cloudUrl)}`);
    }
    if (authResult) {
      console.log(`   Account: ${chalk.cyan(authResult.email)}`);
    }
    console.log('\n💡 Run `vutler-nexus start` to begin!');
  });

program
  .command('start')
  .description('Start the complete Nexus agent runtime')
  .option('--no-web', 'Disable web interface')
  .option('--no-cloud', 'Disable cloud connection')
  .action(async (options) => {
    const cfg = config.read();
    
    if (!config.canUseLLM()) {
      error('❌ LLM not configured. Run `vutler-nexus init` first.');
      process.exit(1);
    }
    
    log('🚀 Starting Vutler Nexus Agent Runtime...\n');
    
    try {
      // Check mode
      if (cfg.mode === 'cloud') {
        // Set environment variable for cloud orchestrator
        if (cfg.vutlerApiKey) {
          process.env.VUTLER_API_KEY = cfg.vutlerApiKey;
        }
        log(`☁️  Cloud Mode - Vutler API: ${cfg.vutlerUrl || 'https://app.vutler.ai'}`);
      }
      
      // Initialize agent runtime
      const providerName = cfg.mode === 'cloud' ? 'Cloud (Vutler API)' : (cfg.llm?.provider || 'unknown');
      log(`🧠 Initializing Agent Runtime (${providerName})...`);
      agentRuntime = new AgentRuntime(cfg);
      success('✅ Agent Runtime ready');
      
      // Start web server
      if (options.web !== false && cfg.features?.webInterface !== false) {
        log('🌐 Starting Web Server...');
        webServer = new WebServer(cfg, agentRuntime);
        
        webServer.on('configUpdated', (newConfig) => {
          // Save updated config
          config.write(newConfig);
          success('🔄 Configuration updated');
        });
        
        const port = await webServer.start();
        success(`✅ Web Interface available at ${chalk.cyan(`http://localhost:${port}`)}`);
      }
      
      // Connect to cloud (optional)
      if (options.cloud !== false && cfg.token && cfg.features?.cloudSync) {
        log('☁️  Connecting to Vutler Cloud...');
        activeTunnel = new NexusTunnel(cfg);
        
        activeTunnel.on('connected', () => {
          config.write({ connectedAt: new Date().toISOString() });
          success('✅ Cloud connection established');
        });
        
        activeTunnel.on('disconnected', (code) => {
          warn(`☁️  Cloud disconnected (${code})`);
        });
        
        // Handle cloud messages
        activeTunnel.on('command', async (msg) => {
          if (agentRuntime) {
            try {
              log(`📨 Cloud command: ${msg.command}`);
              const response = await agentRuntime.processMessage(msg.command);
              activeTunnel.send('command_result', {
                id: msg.id,
                result: response.content
              });
            } catch (error) {
              activeTunnel.send('command_result', {
                id: msg.id,
                error: error.message
              });
            }
          }
        });
        
        activeTunnel.on('sync', (msg) => {
          config.write({ lastSync: new Date().toISOString() });
        });
        
        activeTunnel.connect();
      }
      
      success('\n🎉 Vutler Nexus is running!');
      if (webServer) {
        console.log(chalk.blue(`   Web UI: http://localhost:${cfg.webPort || 3939}`));
      }
      if (activeTunnel) {
        console.log(chalk.blue(`   Cloud: ${cfg.cloudUrl}`));
      }
      
      if (cfg.mode !== 'cloud') {
        const llmProviderName = providerInfo[cfg.llm?.provider]?.name || cfg.llm?.provider || 'Unknown';
        console.log(chalk.blue(`   LLM: ${llmProviderName}`));
      }
      console.log(chalk.gray('\n   Press Ctrl+C to stop'));
      
    } catch (error) {
      error(`❌ Failed to start: ${error.message}`);
      process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async () => {
      log('\n⏹  Stopping Nexus...');
      
      if (activeTunnel) {
        activeTunnel.disconnect();
        activeTunnel = null;
      }
      
      if (webServer) {
        await webServer.stop();
        webServer = null;
      }
      
      success('👋 Nexus stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('stop')
  .description('Stop any running Nexus processes')
  .action(() => {
    // For now, just inform user how to stop
    if (activeTunnel || webServer) {
      log('⏹  Stopping active processes...');
      if (activeTunnel) {
        activeTunnel.disconnect();
        activeTunnel = null;
      }
      if (webServer) {
        webServer.stop();
        webServer = null;
      }
      success('👋 Nexus stopped');
    } else {
      warn('ℹ️  No active Nexus processes in this session.');
      log('💡 If Nexus is running in another terminal, use Ctrl+C there.');
      log('   Or kill the process: `pkill -f vutler-nexus`');
    }
  });

program
  .command('status')
  .description('Show Nexus status and configuration')
  .action(async () => {
    const cfg = config.read();
    
    console.log(chalk.cyan('\n📊 Vutler Nexus Status\n'));
    
    // Configuration status
    console.log(chalk.blue('🔧 Configuration:'));
    console.log(`  Agent Name:   ${cfg.agent?.name || 'not set'}`);
    console.log(`  Workspace:    ${cfg.workspace || 'not set'}`);
    console.log(`  Web Port:     ${cfg.webPort || 'not set'}`);
    
    // LLM status
    // Determine execution mode
    const mode = cfg.mode || 'local';
    console.log(chalk.blue('\n🌐 Execution Mode:'));
    console.log(`  Mode:         ${mode === 'cloud' ? 'Cloud (Vutler API)' : 'Local'}`);
    
    if (mode === 'cloud') {
      console.log(`  Vutler API:   ${cfg.vutlerUrl || 'https://app.vutler.ai'}`);
      console.log(`  API Key:      ${cfg.vutlerApiKey ? cfg.vutlerApiKey.slice(0, 8) + '...' : 'not set'}`);
    }
    
    console.log(chalk.blue('\n🧠 LLM Configuration:'));
    const provider = mode === 'cloud' ? 'cloud' : (cfg.llm?.provider || 'not set');
    const providerName = mode === 'cloud' ? 'Cloud Agents' : (providerInfo[provider]?.name || provider);
    console.log(`  Provider:     ${providerName}`);
    
    if (mode !== 'cloud') {
      if (provider === 'claude-code') {
        const claudeStatus = await checkClaudeCLI();
        if (claudeStatus.available) {
          console.log(`  Claude CLI:   ✅ ${claudeStatus.version}`);
        } else {
          console.log(`  Claude CLI:   ❌ not found (install with: pip install claude-cli)`);
        }
        console.log(`  Cost:         $0 (uses Max subscription)`);
      } else if (provider === 'ollama') {
        const ollamaStatus = await checkOllama();
        if (ollamaStatus.available) {
          console.log(`  Ollama:       ✅ running (${ollamaStatus.models.length} models)`);
        } else {
          console.log(`  Ollama:       ❌ not running (start with: ollama serve)`);
        }
        console.log(`  Cost:         $0 (local models)`);
      } else if (providerInfo[provider]?.requiresApiKey) {
        console.log(`  API Key:      ${cfg.llm?.apiKey ? cfg.llm.apiKey.slice(0, 8) + '...' : 'not set'}`);
        console.log(`  Cost:         per token usage`);
      }
      
      console.log(`  Model:        ${cfg.llm?.model || 'not set'}`);
      console.log(`  Max Tokens:   ${cfg.llm?.maxTokens || 'not set'}`);
      console.log(`  Temperature:  ${cfg.llm?.temperature || 'not set'}`);
    } else {
      console.log(`  Cost:         per cloud agent usage`);
    }
    
    // Cloud status
    console.log(chalk.blue('\n☁️  Cloud Integration:'));
    console.log(`  Cloud URL:    ${cfg.cloudUrl || 'not set'}`);
    console.log(`  Token:        ${cfg.token ? cfg.token.slice(0, 8) + '...' : 'not set'}`);
    console.log(`  Connected:    ${cfg.connectedAt || 'never'}`);
    console.log(`  Last Sync:    ${cfg.lastSync || 'never'}`);
    
    // Features
    console.log(chalk.blue('\n🔧 Features:'));
    console.log(`  Web Interface: ${cfg.features?.webInterface !== false ? '✅ enabled' : '❌ disabled'}`);
    console.log(`  Local Chat:    ${cfg.features?.localChat !== false ? '✅ enabled' : '❌ disabled'}`);
    console.log(`  File Access:   ${cfg.features?.fileAccess !== false ? '✅ enabled' : '❌ disabled'}`);
    console.log(`  Shell Access:  ${cfg.features?.shellAccess === true ? '⚠️  enabled' : '❌ disabled'}`);
    console.log(`  Cloud Sync:    ${cfg.features?.cloudSync !== false ? '✅ enabled' : '❌ disabled'}`);
    
    // Runtime status
    if (activeTunnel || webServer) {
      console.log(chalk.blue('\n🟢 Live Status:'));
      if (webServer) {
        const webStatus = webServer.getStatus();
        console.log(`  Web Server:    🟢 running on port ${webStatus.port}`);
        console.log(`  Connections:   ${webStatus.connections}`);
      }
      if (activeTunnel) {
        const tunnelStatus = activeTunnel.getStatus();
        console.log(`  Cloud Tunnel:  ${tunnelStatus.connected ? '🟢 connected' : '🔴 disconnected'}`);
        console.log(`  Agents:        ${tunnelStatus.agentCount || 0}`);
      }
      if (agentRuntime) {
        const agentStatus = agentRuntime.getStatus();
        console.log(`  Agent Runtime: 🟢 running`);
        console.log(`  LLM Ready:     ${agentStatus.llmConfigured ? '✅ yes' : '❌ no'}`);
        console.log(`  Messages:      ${agentStatus.conversationLength}`);
      }
    }
  });

program
  .command('chat')
  .description('Terminal-based chat with the agent')
  .action(async () => {
    const cfg = config.read();
    
    if (!config.canUseLLM()) {
      error('❌ LLM not configured. Run `vutler-nexus init` first.');
      process.exit(1);
    }
    
    console.log(chalk.cyan('\n💬 Vutler Nexus Terminal Chat'));
    const providerName = providerInfo[cfg.llm?.provider]?.name || cfg.llm?.provider || 'Unknown';
    console.log(chalk.gray(`Using: ${providerName}`));
    console.log(chalk.gray('Type "exit" to quit, "clear" to clear history\n'));
    
    // Initialize agent runtime
    agentRuntime = new AgentRuntime(cfg);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue('You: ')
    });
    
    rl.prompt();
    
    rl.on('line', async (input) => {
      const message = input.trim();
      
      if (message === 'exit' || message === 'quit') {
        console.log(chalk.cyan('\n👋 Goodbye!'));
        rl.close();
        return;
      }
      
      if (message === 'clear') {
        agentRuntime.clearHistory();
        console.log(chalk.yellow('🗑️  History cleared'));
        rl.prompt();
        return;
      }
      
      if (!message) {
        rl.prompt();
        return;
      }
      
      try {
        console.log(chalk.green('\nAssistant: '));
        
        await agentRuntime.processMessage(message, {
          stream: true,
          onChunk: (chunk) => {
            if (chunk.type === 'text') {
              process.stdout.write(chunk.content);
            }
          }
        });
        
        console.log('\n');
        
      } catch (error) {
        console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
      }
      
      rl.prompt();
    });
    
    rl.on('close', () => {
      process.exit(0);
    });
  });

program
  .command('config')
  .description('Show or edit configuration')
  .option('-e, --edit', 'Edit configuration in default editor')
  .option('-s, --set <key=value>', 'Set a configuration value')
  .option('-l, --list-providers', 'List available providers')
  .action(async (options) => {
    const cfg = config.read();
    
    if (options.listProviders) {
      console.log(chalk.cyan('\n🔌 Available LLM Providers:\n'));
      
      for (const [key, info] of Object.entries(providerInfo)) {
        console.log(chalk.blue(`${info.name} (${key}):`));
        console.log(`  ${info.description}`);
        console.log(`  API Key: ${info.requiresApiKey ? 'Required' : 'Not required'}`);
        if (info.models) {
          console.log(`  Models: ${info.models.join(', ')}`);
        }
        console.log('');
      }
      return;
    }
    
    if (options.set) {
      const [key, value] = options.set.split('=');
      if (!key || value === undefined) {
        error('❌ Invalid format. Use: --set key=value');
        process.exit(1);
      }
      
      // Simple dot notation support
      const keys = key.split('.');
      let target = cfg;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!target[keys[i]]) target[keys[i]] = {};
        target = target[keys[i]];
      }
      
      target[keys[keys.length - 1]] = value;
      
      config.write(cfg);
      success(`✅ Set ${key} = ${value}`);
      return;
    }
    
    if (options.edit) {
      console.log(`📝 Configuration file: ${config.CONFIG_FILE}`);
      console.log('💡 Edit with your preferred editor, or use the web interface');
      return;
    }
    
    // Show current configuration (safe version)
    console.log(chalk.cyan('\n📋 Current Configuration:\n'));
    
    const safeConfig = JSON.parse(JSON.stringify(cfg));
    if (safeConfig.llm?.apiKey) {
      safeConfig.llm.apiKey = safeConfig.llm.apiKey.slice(0, 8) + '...';
    }
    if (safeConfig.token) {
      safeConfig.token = safeConfig.token.slice(0, 8) + '...';
    }
    
    console.log(JSON.stringify(safeConfig, null, 2));
    console.log(chalk.gray(`\n📁 Config file: ${config.CONFIG_FILE}`));
    console.log(chalk.gray('💡 Use --edit to modify, or use the web interface'));
  });

// Additional utility commands
program
  .command('workspace')
  .description('Show workspace information')
  .action(() => {
    const cfg = config.read();
    const workspacePath = cfg.workspace;
    
    if (!workspacePath) {
      error('❌ Workspace not configured');
      return;
    }
    
    console.log(chalk.cyan('\n📁 Workspace Information\n'));
    console.log(`Path: ${chalk.blue(workspacePath)}`);
    
    try {
      const fs = require('fs');
      
      if (!fs.existsSync(workspacePath)) {
        warn('⚠️  Workspace directory does not exist');
        return;
      }
      
      // List key files
      const keyFiles = ['SOUL.md', 'MEMORY.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md'];
      console.log(chalk.blue('\n📄 Key Files:'));
      
      for (const file of keyFiles) {
        const filePath = path.join(workspacePath, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`  ✅ ${file} (${formatBytes(stats.size)})`);
        } else {
          console.log(`  ❌ ${file} (missing)`);
        }
      }
      
      // Check memory directory
      const memoryDir = path.join(workspacePath, 'memory');
      if (fs.existsSync(memoryDir)) {
        const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
        console.log(chalk.blue(`\n🧠 Memory Files: ${memoryFiles.length}`));
        if (memoryFiles.length > 0) {
          const recent = memoryFiles.slice(-3);
          recent.forEach(file => {
            const filePath = path.join(memoryDir, file);
            const stats = fs.statSync(filePath);
            console.log(`  📝 ${file} (${formatBytes(stats.size)})`);
          });
        }
      } else {
        warn('⚠️  Memory directory does not exist');
      }
      
    } catch (error) {
      error(`❌ Error reading workspace: ${error.message}`);
    }
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    const pkg = require('../package.json');
    console.log(chalk.cyan('\n🚀 Vutler Nexus\n'));
    console.log(`Version: ${chalk.blue(pkg.version)}`);
    console.log(`Node.js: ${chalk.blue(process.version)}`);
    console.log(`Platform: ${chalk.blue(process.platform)} ${process.arch}`);
    console.log('\nBuilt with ❤️  by Starbox Group');
  });

program.parse();