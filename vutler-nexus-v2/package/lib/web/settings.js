// Vutler Nexus - Settings Interface JavaScript (Updated for Claude CLI)

class SettingsInterface {
  constructor() {
    this.currentConfig = {};
    
    this.initElements();
    this.bindEvents();
    this.loadSettings();
    this.loadStatus();
  }

  initElements() {
    this.form = document.getElementById('settings-form');
    this.saveStatus = document.getElementById('save-status');
    this.agentStatus = document.getElementById('agent-status');
    this.connectionStatus = document.getElementById('connection-status');
    
    // Form fields
    this.agentName = document.getElementById('agent-name');
    this.workspacePath = document.getElementById('workspace-path');
    this.webPort = document.getElementById('web-port');
    
    this.llmProvider = document.getElementById('llm-provider');
    this.llmModel = document.getElementById('llm-model');
    this.apiKey = document.getElementById('api-key');
    this.maxTokens = document.getElementById('max-tokens');
    this.temperature = document.getElementById('temperature');
    
    // API key field group for conditional showing/hiding
    this.apiKeyGroup = this.apiKey.closest('.form-group');
    
    this.promptAuto = document.getElementById('prompt-auto');
    this.promptCustom = document.getElementById('prompt-custom');
    this.systemPrompt = document.getElementById('system-prompt');
    this.contextFiles = document.getElementById('context-files');
    this.customPromptGroup = document.getElementById('custom-prompt-group');
    
    this.cloudUrl = document.getElementById('cloud-url');
    this.pairingToken = document.getElementById('pairing-token');
    
    this.featureCloud = document.getElementById('feature-cloud');
    this.featureChat = document.getElementById('feature-chat');
    this.featureFiles = document.getElementById('feature-files');
    this.featureShell = document.getElementById('feature-shell');
    
    // Buttons
    this.testConnectionBtn = document.getElementById('test-connection');
    this.loadDefaultsBtn = document.getElementById('load-defaults');
  }

  bindEvents() {
    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // Provider selection change
    this.llmProvider.addEventListener('change', () => this.toggleProviderFields());

    // Prompt mode toggle
    this.promptAuto.addEventListener('change', () => this.togglePromptMode());
    this.promptCustom.addEventListener('change', () => this.togglePromptMode());

    // Buttons
    this.testConnectionBtn.addEventListener('click', () => this.testConnection());
    this.loadDefaultsBtn.addEventListener('click', () => this.loadDefaults());

    // Auto-save API key changes (masked)
    this.apiKey.addEventListener('input', () => {
      if (this.apiKey.value && !this.apiKey.value.includes('...')) {
        // Only update if it's a real API key, not a masked one
        this.currentConfig.llm = this.currentConfig.llm || {};
        this.currentConfig.llm.apiKey = this.apiKey.value;
      }
    });
  }

  toggleProviderFields() {
    const provider = this.llmProvider.value;
    
    if (provider === 'claude-code') {
      // Hide API key field for Claude Code CLI
      this.apiKeyGroup.style.display = 'none';
      this.testConnectionBtn.textContent = 'Test Claude CLI';
    } else if (provider === 'anthropic-api' || provider === 'openrouter') {
      // Show API key field for API-based providers
      this.apiKeyGroup.style.display = 'block';
      this.testConnectionBtn.textContent = 'Test API Connection';
    }
  }

  togglePromptMode() {
    const isCustom = this.promptCustom.checked;
    this.customPromptGroup.style.display = isCustom ? 'block' : 'none';
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      
      this.currentConfig = config;
      this.populateForm(config);
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showStatus('error', 'Failed to load settings');
    }
  }

  populateForm(config) {
    // Agent settings
    this.agentName.value = config.agent?.name || 'Jarvis';
    this.workspacePath.value = config.workspace || '';
    this.webPort.value = config.webPort || 3939;

    // LLM settings
    this.llmProvider.value = config.llm?.provider || 'claude-code';
    this.llmModel.value = config.llm?.model || 'claude-sonnet-4-20250514';
    this.apiKey.value = config.llm?.apiKey || '';
    this.maxTokens.value = config.llm?.maxTokens || 4096;
    this.temperature.value = config.llm?.temperature || 0.7;

    // Toggle provider-specific fields
    this.toggleProviderFields();

    // System prompt
    if (config.agent?.systemPrompt === 'auto' || !config.agent?.systemPrompt) {
      this.promptAuto.checked = true;
      this.promptCustom.checked = false;
    } else {
      this.promptAuto.checked = false;
      this.promptCustom.checked = true;
      this.systemPrompt.value = config.agent.systemPrompt;
    }
    this.togglePromptMode();

    // Context files
    const contextFiles = config.agent?.contextFiles || ['SOUL.md', 'MEMORY.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md'];
    this.contextFiles.value = contextFiles.join(',');

    // Cloud settings
    this.cloudUrl.value = config.cloudUrl || 'app.vutler.ai';
    this.pairingToken.value = config.token || '';

    // Features
    this.featureCloud.checked = config.features?.cloudSync !== false;
    this.featureChat.checked = config.features?.localChat !== false;
    this.featureFiles.checked = config.features?.fileAccess !== false;
    this.featureShell.checked = config.features?.shellAccess === true;
  }

  async saveSettings() {
    try {
      const config = this.gatherFormData();
      
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        this.currentConfig = { ...this.currentConfig, ...config };
        this.showStatus('success', 'Configuration saved successfully! Some changes may require restart.');
        this.loadStatus(); // Refresh status
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Save error:', error);
      this.showStatus('error', 'Failed to save: ' + error.message);
    }
  }

  gatherFormData() {
    const config = {};

    // Agent settings
    config.agent = {
      name: this.agentName.value || 'Jarvis',
      systemPrompt: this.promptAuto.checked ? 'auto' : this.systemPrompt.value,
      contextFiles: this.contextFiles.value.split(',').map(f => f.trim()).filter(f => f)
    };

    config.workspace = this.workspacePath.value;
    config.webPort = parseInt(this.webPort.value) || 3939;

    // LLM settings
    config.llm = {
      provider: this.llmProvider.value,
      model: this.llmModel.value,
      maxTokens: parseInt(this.maxTokens.value) || 4096,
      temperature: parseFloat(this.temperature.value) || 0.7
    };

    // Only include API key for API-based providers and if it's not masked
    const apiProviders = ['anthropic-api', 'openrouter', 'openai', 'kimi'];
    if (apiProviders.includes(this.llmProvider.value) && this.apiKey.value && !this.apiKey.value.includes('...')) {
      config.llm.apiKey = this.apiKey.value;
    }

    // Cloud settings
    config.cloudUrl = this.cloudUrl.value;
    if (this.pairingToken.value && !this.pairingToken.value.includes('...')) {
      config.token = this.pairingToken.value;
    }

    // Features
    config.features = {
      webInterface: true, // Always enabled
      cloudSync: this.featureCloud.checked,
      localChat: this.featureChat.checked,
      fileAccess: this.featureFiles.checked,
      shellAccess: this.featureShell.checked
    };

    return config;
  }

  async testConnection() {
    this.testConnectionBtn.disabled = true;
    const originalText = this.testConnectionBtn.textContent;
    this.testConnectionBtn.textContent = 'Testing...';

    try {
      const provider = this.llmProvider.value;
      
      if (provider === 'claude-code') {
        // Test Claude CLI availability
        const response = await fetch('/api/test-claude-cli');
        if (response.ok) {
          const result = await response.json();
          this.showStatus('success', `Claude CLI test successful: ${result.message}`);
        } else {
          throw new Error('Claude CLI not available. Please install with: pip install claude-cli');
        }
      } else if (provider === 'anthropic-api') {
        // Test API key format
        const apiKey = this.apiKey.value;
        
        if (!apiKey || apiKey.includes('...')) {
          throw new Error('Please enter your Anthropic API key');
        }

        if (!apiKey.startsWith('sk-ant-')) {
          throw new Error('API key should start with sk-ant-');
        }

        this.showStatus('success', 'API key format looks correct! Save settings to test fully.');
      } else if (provider === 'openrouter') {
        // Test OpenRouter API key format
        const apiKey = this.apiKey.value;
        
        if (!apiKey || apiKey.includes('...')) {
          throw new Error('Please enter your OpenRouter API key');
        }

        if (!apiKey.startsWith('sk-or-')) {
          throw new Error('API key should start with sk-or-');
        }

        this.showStatus('success', 'OpenRouter API key format looks correct! Save settings to test fully.');
      }

    } catch (error) {
      this.showStatus('error', 'Connection test failed: ' + error.message);
    } finally {
      this.testConnectionBtn.disabled = false;
      this.testConnectionBtn.textContent = originalText;
    }
  }

  loadDefaults() {
    if (!confirm('This will reset all settings to defaults. Continue?')) return;

    // Load default values
    this.agentName.value = 'Jarvis';
    this.workspacePath.value = '';
    this.webPort.value = 3939;
    
    this.llmProvider.value = 'claude-code';
    this.llmModel.value = 'claude-sonnet-4-20250514';
    this.apiKey.value = '';
    this.maxTokens.value = 4096;
    this.temperature.value = 0.7;
    
    this.toggleProviderFields(); // Update UI based on provider
    
    this.promptAuto.checked = true;
    this.promptCustom.checked = false;
    this.systemPrompt.value = '';
    this.contextFiles.value = 'SOUL.md,MEMORY.md,USER.md,IDENTITY.md,TOOLS.md';
    this.togglePromptMode();
    
    this.cloudUrl.value = 'app.vutler.ai';
    this.pairingToken.value = '';
    
    this.featureCloud.checked = true;
    this.featureChat.checked = true;
    this.featureFiles.checked = true;
    this.featureShell.checked = false;

    this.showStatus('warning', 'Defaults loaded. Click Save to apply.');
  }

  async loadStatus() {
    try {
      const response = await fetch('/api/status');
      const status = await response.json();
      
      this.updateConnectionStatus(status);
      this.updateAgentStatus(status);
    } catch (error) {
      console.error('Failed to load status:', error);
      this.updateConnectionStatus({ server: 'error' });
    }
  }

  updateConnectionStatus(status) {
    const statusEl = this.connectionStatus;
    
    if (status.server === 'running' && status.agent?.llmConfigured) {
      statusEl.className = 'status success';
      statusEl.innerHTML = '🟢 Online';
    } else if (status.server === 'running') {
      statusEl.className = 'status warning';
      statusEl.innerHTML = '🟡 No LLM';
    } else {
      statusEl.className = 'status error';
      statusEl.innerHTML = '🔴 Offline';
    }
  }

  updateAgentStatus(status) {
    const agentEl = this.agentStatus;
    
    if (!status.agent) {
      agentEl.className = 'status error';
      agentEl.innerHTML = '❌ Agent runtime not initialized';
      return;
    }

    const agent = status.agent;
    let statusText = `🤖 ${status.config?.agentName || 'Agent'} | `;
    
    if (agent.llmConfigured) {
      let provider;
      if (agent.llmProvider === 'claude-code') {
        provider = '🖥️ Claude CLI';
      } else if (agent.llmProvider === 'openrouter') {
        provider = '🔀 OpenRouter';
      } else {
        provider = '🌐 API';
      }
      statusText += `${provider} ${status.config?.model || 'LLM'} | `;
    }
    
    statusText += `💬 ${agent.conversationLength || 0} messages | `;
    statusText += `📁 ${status.config?.workspace || 'No workspace'}`;

    if (agent.llmConfigured && agent.systemPromptLoaded) {
      agentEl.className = 'status success';
      agentEl.innerHTML = statusText;
    } else if (!agent.llmConfigured) {
      let providerText;
      if (agent.llmProvider === 'claude-code') {
        providerText = 'Claude CLI not available';
      } else if (agent.llmProvider === 'openrouter') {
        providerText = 'OpenRouter API key not set';
      } else {
        providerText = 'API key not set';
      }
      agentEl.className = 'status warning';
      agentEl.innerHTML = `⚠️ LLM not configured - ${providerText}`;
    } else {
      agentEl.className = 'status warning';
      agentEl.innerHTML = '⚠️ System prompt not loaded';
    }
  }

  showStatus(type, message) {
    this.saveStatus.className = `status ${type}`;
    this.saveStatus.textContent = message;
    this.saveStatus.classList.remove('hidden');
    
    // Hide after 5 seconds
    setTimeout(() => {
      this.saveStatus.classList.add('hidden');
    }, 5000);
  }
}

// Initialize settings interface when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const settings = new SettingsInterface();

  // Periodically update status
  setInterval(() => {
    settings.loadStatus();
  }, 30000); // Every 30 seconds
});