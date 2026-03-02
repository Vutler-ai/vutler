/**
 * @vutler/nexus — LLM Provider Registry
 * Abstraction layer for multiple LLM backends
 * 
 * Each provider must implement:
 * - name: string
 * - init(config): Promise<void> - Initialize provider with config
 * - chat(messages, options): Promise<{content: string, toolUses?: Array}>
 * - stream(messages, options): AsyncGenerator<{type: string, content: string}>
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');
const fs = require('fs');

class ClaudeCodeProvider {
  constructor() {
    this.name = 'claude-code';
    this.available = false;
  }

  async init(config) {
    // Check if Claude CLI is available
    return new Promise((resolve, reject) => {
      exec('claude --version', (error, stdout, stderr) => {
        if (error) {
          console.warn('[claude-code] ⚠️  Claude CLI not found. Install with: pip install claude-cli');
          this.available = false;
          reject(new Error('Claude CLI not available'));
        } else {
          console.log(`[claude-code] ✅ Claude CLI available: ${stdout.trim()}`);
          this.available = true;
          this.config = config;
          resolve();
        }
      });
    });
  }

  async chat(messages, options = {}) {
    if (!this.available) {
      throw new Error('Claude CLI not available');
    }

    // Build prompt from messages
    const prompt = this.buildPrompt(messages);
    
    return new Promise((resolve, reject) => {
      let fullContent = '';
      
      // Use echo + pipe approach for reliability
      const echoProcess = spawn('echo', [prompt]);
      const claudeProcess = spawn(this.config.claudePath || 'claude', ['--print', '--dangerously-skip-permissions'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Pipe echo output to claude input
      echoProcess.stdout.pipe(claudeProcess.stdin);
      
      // Handle claude output
      claudeProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        fullContent += chunk;
        
        if (options.stream && options.onChunk) {
          options.onChunk({ type: 'text', content: chunk });
        }
      });
      
      claudeProcess.stderr.on('data', (data) => {
        console.error('[claude-code] Error:', data.toString());
      });
      
      claudeProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}`));
          return;
        }
        
        // Parse response for tool uses (basic implementation)
        const parsed = this.parseResponse(fullContent);
        resolve(parsed);
      });
      
      echoProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Echo process failed with code ${code}`));
        }
      });
    });
  }

  async *stream(messages, options = {}) {
    const result = await this.chat(messages, {
      ...options,
      stream: true,
      onChunk: (chunk) => {
        // This will be handled by the generator
      }
    });
    
    // Simple implementation - yield full result at once
    // In a real streaming implementation, this would yield chunks as they arrive
    yield { type: 'text', content: result.content };
  }

  buildPrompt(messages) {
    let prompt = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `System: ${message.content}\n\n`;
      } else if (message.role === 'user') {
        prompt += `Human: ${message.content}\n\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n\n`;
      }
    }
    
    if (!prompt.includes('Assistant:')) {
      prompt += 'Assistant: ';
    }
    
    return prompt;
  }

  parseResponse(response) {
    // Basic parsing for tool usage - would be more sophisticated in production
    const toolUses = [];
    let content = response;
    
    // Look for simple tool patterns
    const readFileMatches = content.match(/read_file\(["']([^"']+)["']\)/g);
    if (readFileMatches) {
      for (const match of readFileMatches) {
        const pathMatch = match.match(/read_file\(["']([^"']+)["']\)/);
        if (pathMatch) {
          toolUses.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: 'read_file',
            input: { file_path: pathMatch[1] }
          });
        }
      }
    }
    
    return { content, toolUses };
  }
}

class AnthropicProvider {
  constructor() {
    this.name = 'anthropic';
    this.client = null;
  }

  async init(config) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key required');
    }

    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      this.client = new Anthropic({
        apiKey: config.apiKey,
      });
      this.config = config;
      console.log('[anthropic] ✅ Anthropic API initialized');
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk');
      }
      throw error;
    }
  }

  async chat(messages, options = {}) {
    if (!this.client) {
      throw new Error('Anthropic provider not initialized');
    }

    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    try {
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.7,
        system: systemMessage?.content,
        messages: chatMessages,
        stream: options.stream,
      });

      if (options.stream) {
        // Handle streaming response
        let fullContent = '';
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta') {
            const text = chunk.delta.text;
            fullContent += text;
            if (options.onChunk) {
              options.onChunk({ type: 'text', content: text });
            }
          }
        }
        return { content: fullContent, toolUses: [] };
      } else {
        return {
          content: response.content[0].text,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async *stream(messages, options = {}) {
    const result = await this.chat(messages, {
      ...options,
      stream: true,
      onChunk: function*(chunk) {
        yield chunk;
      }
    });
  }
}

class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.client = null;
  }

  async init(config) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required');
    }

    try {
      // Try to use openai package if available, fallback to fetch
      try {
        const { OpenAI } = require('openai');
        this.client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || 'https://api.openai.com/v1',
        });
        this.useSDK = true;
      } catch (sdkError) {
        console.log('[openai] Using fetch API (openai package not installed)');
        this.useSDK = false;
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      }
      
      this.config = config;
      console.log(`[openai] ✅ OpenAI API initialized (${config.baseUrl || 'api.openai.com'})`);
    } catch (error) {
      throw error;
    }
  }

  async chat(messages, options = {}) {
    if (this.useSDK && this.client) {
      return this.chatWithSDK(messages, options);
    } else {
      return this.chatWithFetch(messages, options);
    }
  }

  async chatWithSDK(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4',
        messages: messages,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.7,
        stream: options.stream,
      });

      if (options.stream) {
        let fullContent = '';
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullContent += text;
            if (options.onChunk) {
              options.onChunk({ type: 'text', content: text });
            }
          }
        }
        return { content: fullContent, toolUses: [] };
      } else {
        return {
          content: response.choices[0].message.content,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async chatWithFetch(messages, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'gpt-4',
          messages: messages,
          max_tokens: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0.7,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (options.stream) {
        // Handle streaming response with fetch
        const reader = response.body.getReader();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = data.choices[0]?.delta?.content || '';
                  if (text) {
                    fullContent += text;
                    if (options.onChunk) {
                      options.onChunk({ type: 'text', content: text });
                    }
                  }
                } catch (parseError) {
                  // Ignore parsing errors for malformed chunks
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        return { content: fullContent, toolUses: [] };
      } else {
        const data = await response.json();
        return {
          content: data.choices[0].message.content,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async *stream(messages, options = {}) {
    const result = await this.chat(messages, {
      ...options,
      stream: true,
      onChunk: function*(chunk) {
        yield chunk;
      }
    });
  }
}

class OpenRouterProvider extends OpenAIProvider {
  constructor() {
    super();
    this.name = 'openrouter';
  }

  async init(config) {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key required');
    }

    // OpenRouter uses OpenAI-compatible API
    this.config = {
      ...config,
      baseUrl: 'https://openrouter.ai/api/v1',
    };
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.useSDK = false; // Use fetch for OpenRouter

    // Test connection
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://vutler.ai',
          'X-Title': 'Vutler Nexus',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      console.log(`[openrouter] ✅ OpenRouter API initialized`);
    } catch (error) {
      console.warn(`[openrouter] ⚠️  Connection test failed: ${error.message}`);
    }
  }

  async chatWithFetch(messages, options = {}) {
    // Override to add OpenRouter-specific headers
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://vutler.ai',
          'X-Title': 'Vutler Nexus',
        },
        body: JSON.stringify({
          model: this.config.model || 'anthropic/claude-3.5-sonnet',
          messages: messages,
          max_tokens: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0.7,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      if (options.stream) {
        const reader = response.body.getReader();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = data.choices[0]?.delta?.content || '';
                  if (text) {
                    fullContent += text;
                    if (options.onChunk) {
                      options.onChunk({ type: 'text', content: text });
                    }
                  }
                } catch (parseError) {
                  // Ignore parsing errors
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        return { content: fullContent, toolUses: [] };
      } else {
        const data = await response.json();
        return {
          content: data.choices[0].message.content,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
  }
}

class OllamaProvider {
  constructor() {
    this.name = 'ollama';
  }

  async init(config) {
    this.config = {
      host: config.ollamaHost || 'localhost',
      port: config.ollamaPort || 11434,
      model: config.model || 'llama2',
      ...config
    };
    
    // Test connection
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      console.log(`[ollama] ✅ Ollama available at ${this.config.host}:${this.config.port}`);
    } catch (error) {
      throw new Error(`Ollama not available: ${error.message}`);
    }
  }

  async chat(messages, options = {}) {
    // Convert messages to Ollama format
    const prompt = this.buildPrompt(messages);
    
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: prompt,
          stream: options.stream || false,
          options: {
            temperature: this.config.temperature || 0.7,
            num_predict: this.config.maxTokens || 4096,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (options.stream) {
        // Handle streaming response
        const reader = response.body.getReader();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  fullContent += data.response;
                  if (options.onChunk) {
                    options.onChunk({ type: 'text', content: data.response });
                  }
                }
              } catch (parseError) {
                // Ignore parsing errors
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        return { content: fullContent, toolUses: [] };
      } else {
        const data = await response.json();
        return {
          content: data.response,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`Ollama error: ${error.message}`);
    }
  }

  async *stream(messages, options = {}) {
    const result = await this.chat(messages, {
      ...options,
      stream: true,
      onChunk: function*(chunk) {
        yield chunk;
      }
    });
  }

  buildPrompt(messages) {
    let prompt = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `System: ${message.content}\n\n`;
      } else if (message.role === 'user') {
        prompt += `Human: ${message.content}\n\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n\n`;
      }
    }
    
    return prompt;
  }
}

class KimiProvider {
  constructor() {
    this.name = 'kimi';
  }

  async init(config) {
    if (!config.apiKey) {
      throw new Error('Kimi API key required');
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: 'https://api.moonshot.cn/v1',
      model: config.model || 'moonshot-v1-8k',
      ...config
    };
    
    console.log('[kimi] ✅ Kimi (Moonshot) API initialized');
  }

  async chat(messages, options = {}) {
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          max_tokens: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0.7,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (options.stream) {
        // Handle streaming response
        const reader = response.body.getReader();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = data.choices[0]?.delta?.content || '';
                  if (text) {
                    fullContent += text;
                    if (options.onChunk) {
                      options.onChunk({ type: 'text', content: text });
                    }
                  }
                } catch (parseError) {
                  // Ignore parsing errors
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        return { content: fullContent, toolUses: [] };
      } else {
        const data = await response.json();
        return {
          content: data.choices[0].message.content,
          toolUses: []
        };
      }
    } catch (error) {
      throw new Error(`Kimi API error: ${error.message}`);
    }
  }

  async *stream(messages, options = {}) {
    const result = await this.chat(messages, {
      ...options,
      stream: true,
      onChunk: function*(chunk) {
        yield chunk;
      }
    });
  }
}

// Provider registry
const providers = {
  'claude-code': ClaudeCodeProvider,
  'anthropic': AnthropicProvider,
  'openai': OpenAIProvider,
  'openrouter': OpenRouterProvider,
  'ollama': OllamaProvider,
  'kimi': KimiProvider,
};

function getProvider(providerName) {
  const ProviderClass = providers[providerName];
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return new ProviderClass();
}

function listProviders() {
  return Object.keys(providers);
}

module.exports = {
  providers,
  getProvider,
  listProviders,
  ClaudeCodeProvider,
  AnthropicProvider,
  OpenAIProvider,
  OpenRouterProvider,
  OllamaProvider,
  KimiProvider,
};