// Vutler Nexus - Chat Interface JavaScript (with Tool Call UI)

class ChatInterface {
  constructor() {
    this.messages = [];
    this.isStreaming = true;
    this.currentStreamingMessage = null;
    
    this.initElements();
    this.bindEvents();
    this.loadStatus();
    this.loadHistory();
    
    document.getElementById('welcome-time').textContent = new Date().toLocaleTimeString();
  }

  initElements() {
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('message-input');
    this.sendButton = document.getElementById('send-button');
    this.sendText = document.getElementById('send-text');
    this.sendSpinner = document.getElementById('send-spinner');
    this.connectionStatus = document.getElementById('connection-status');
    
    this.clearHistoryBtn = document.getElementById('clear-history');
    this.exportChatBtn = document.getElementById('export-chat');
    this.toggleStreamBtn = document.getElementById('toggle-stream');
  }

  bindEvents() {
    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.messageInput.addEventListener('input', () => {
      this.messageInput.style.height = 'auto';
      this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    });

    this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    this.exportChatBtn.addEventListener('click', () => this.exportChat());
    this.toggleStreamBtn.addEventListener('click', () => this.toggleStreaming());
    this.updateToggleButton();
  }

  updateToggleButton() {
    this.toggleStreamBtn.textContent = this.isStreaming ? 'Disable Streaming' : 'Enable Streaming';
  }

  async loadStatus() {
    try {
      const response = await fetch('/api/status');
      const status = await response.json();
      this.updateConnectionStatus(status);
    } catch (error) {
      console.error('Failed to load status:', error);
      this.updateConnectionStatus({ server: 'error' });
    }
  }

  updateConnectionStatus(status) {
    const statusEl = this.connectionStatus;
    if (status.server === 'running' && status.agent?.llmConfigured) {
      statusEl.className = 'status success';
      const toolCount = status.agent?.toolsAvailable || 0;
      statusEl.innerHTML = `🟢 Online${toolCount ? ` (${toolCount} tools)` : ''}`;
    } else if (status.server === 'running') {
      statusEl.className = 'status warning';
      statusEl.innerHTML = '🟡 No LLM';
    } else {
      statusEl.className = 'status error';
      statusEl.innerHTML = '🔴 Offline';
    }
  }

  async loadHistory() {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      this.messages = data.history || [];
      this.renderMessages();
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  renderMessages() {
    const welcomeMsg = this.messagesContainer.querySelector('.message.system');
    this.messagesContainer.innerHTML = '';
    if (welcomeMsg) this.messagesContainer.appendChild(welcomeMsg);
    this.messages.forEach(msg => this.addMessageToDOM(msg));
    this.scrollToBottom();
  }

  addMessageToDOM(message, isStreaming = false) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.role}`;
    
    const content = this.formatMessageContent(message.content);
    const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    messageEl.innerHTML = `
      <div class="content">${content}</div>
      <div class="timestamp">${timestamp}</div>
    `;

    if (isStreaming) messageEl.classList.add('streaming');
    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
    return messageEl;
  }

  // Create a tool call block in the chat
  addToolCallBlock(toolName, input, status = 'running', output = null, parentEl = null) {
    const container = parentEl || this.messagesContainer;
    const block = document.createElement('div');
    block.className = `tool-call-block tool-${status}`;
    block.setAttribute('data-tool-id', input?._id || `tool-${Date.now()}`);
    
    const statusIcon = status === 'running' ? '⏳' : status === 'done' ? '✅' : '❌';
    const inputStr = input ? JSON.stringify(input, null, 2) : '';
    const inputPreview = inputStr.length > 200 ? inputStr.substring(0, 200) + '...' : inputStr;
    
    let outputHtml = '';
    if (output) {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      const outputTruncated = outputStr.length > 500 ? outputStr.substring(0, 500) + '\n... [truncated]' : outputStr;
      outputHtml = `<div class="tool-output"><pre>${this.escapeHtml(outputTruncated)}</pre></div>`;
    }

    block.innerHTML = `
      <div class="tool-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="tool-status">${statusIcon}</span>
        <span class="tool-name">${toolName}</span>
        <span class="tool-toggle">▶</span>
      </div>
      <div class="tool-details">
        <div class="tool-input"><strong>Input:</strong><pre>${this.escapeHtml(inputPreview)}</pre></div>
        ${outputHtml}
      </div>
    `;

    container.appendChild(block);
    this.scrollToBottom();
    return block;
  }

  // Update an existing tool call block
  updateToolCallBlock(block, status, output) {
    if (!block) return;
    
    const statusIcon = status === 'done' ? '✅' : '❌';
    block.className = `tool-call-block tool-${status} expanded`;
    block.querySelector('.tool-status').textContent = statusIcon;
    
    if (output) {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      const outputTruncated = outputStr.length > 500 ? outputStr.substring(0, 500) + '\n... [truncated]' : outputStr;
      
      let outputEl = block.querySelector('.tool-output');
      if (!outputEl) {
        outputEl = document.createElement('div');
        outputEl.className = 'tool-output';
        block.querySelector('.tool-details').appendChild(outputEl);
      }
      outputEl.innerHTML = `<pre>${this.escapeHtml(outputTruncated)}</pre>`;
    }
    
    this.scrollToBottom();
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  formatMessageContent(content) {
    if (typeof content !== 'string') return JSON.stringify(content);
    
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    return formatted;
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    this.messageInput.value = '';
    this.messageInput.style.height = 'auto';

    const userMsg = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    this.messages.push(userMsg);
    this.addMessageToDOM(userMsg);
    this.setSending(true);

    try {
      if (this.isStreaming) {
        await this.sendStreamingMessage(message);
      } else {
        await this.sendRegularMessage(message);
      }
    } catch (error) {
      console.error('Send message error:', error);
      this.addErrorMessage(error.message);
    } finally {
      this.setSending(false);
    }
  }

  async sendStreamingMessage(message) {
    const assistantMsg = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };

    this.currentStreamingMessage = this.addMessageToDOM(assistantMsg, true);
    const contentEl = this.currentStreamingMessage.querySelector('.content');
    
    // Track active tool blocks
    const activeToolBlocks = {};

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stream: true })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'text') {
                accumulatedContent += data.content;
                contentEl.innerHTML = this.formatMessageContent(accumulatedContent);
                this.scrollToBottom();
              } else if (data.type === 'tool_start') {
                // Insert tool block before the streaming message
                const block = this.addToolCallBlock(data.tool, data.input, 'running', null, this.messagesContainer);
                // Move streaming message after tool block
                this.messagesContainer.appendChild(this.currentStreamingMessage);
                activeToolBlocks[data.id] = block;
              } else if (data.type === 'tool_result') {
                const block = activeToolBlocks[data.tool_use_id] || activeToolBlocks[data.id];
                const output = data.result?.output || data.result?.error || JSON.stringify(data.result);
                if (block) {
                  this.updateToolCallBlock(block, data.status || 'done', output);
                } else {
                  // Create block for tool result without prior start event
                  this.addToolCallBlock(data.name, data.input, data.status || 'done', output, this.messagesContainer);
                  this.messagesContainer.appendChild(this.currentStreamingMessage);
                }
              } else if (data.type === 'tool_results') {
                // Legacy: batch tool results
                if (data.results) {
                  for (const r of data.results) {
                    this.addToolCallBlock(r.name || 'tool', r.input || {}, r.result?.success !== false ? 'done' : 'error', r.result?.output || r.result?.error, this.messagesContainer);
                  }
                  this.messagesContainer.appendChild(this.currentStreamingMessage);
                }
              } else if (data.type === 'complete') {
                assistantMsg.content = accumulatedContent;
                this.messages.push(assistantMsg);
                this.currentStreamingMessage.classList.remove('streaming');
                this.currentStreamingMessage = null;
                return;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e;
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

      // Fallback
      assistantMsg.content = accumulatedContent;
      this.messages.push(assistantMsg);
      if (this.currentStreamingMessage) {
        this.currentStreamingMessage.classList.remove('streaming');
        this.currentStreamingMessage = null;
      }

    } catch (error) {
      if (this.currentStreamingMessage) {
        this.currentStreamingMessage.remove();
        this.currentStreamingMessage = null;
      }
      throw error;
    }
  }

  async sendRegularMessage(message) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stream: false })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Show tool results if any
    if (data.toolResults && data.toolResults.length > 0) {
      for (const r of data.toolResults) {
        this.addToolCallBlock(r.name, r.input, r.status || 'done', r.result?.output || r.result?.error);
      }
    }

    const assistantMsg = {
      role: 'assistant',
      content: data.content,
      timestamp: new Date().toISOString()
    };

    this.messages.push(assistantMsg);
    this.addMessageToDOM(assistantMsg);
  }

  addErrorMessage(error) {
    const errorMsg = {
      role: 'system',
      content: `❌ Error: ${error}`,
      timestamp: new Date().toISOString()
    };
    this.addMessageToDOM(errorMsg);
  }

  setSending(sending) {
    this.sendButton.disabled = sending;
    this.messageInput.disabled = sending;
    
    if (sending) {
      this.sendText.classList.add('hidden');
      this.sendSpinner.classList.remove('hidden');
    } else {
      this.sendText.classList.remove('hidden');
      this.sendSpinner.classList.add('hidden');
    }
  }

  async clearHistory() {
    if (!confirm('Are you sure you want to clear the conversation history?')) return;
    try {
      const response = await fetch('/api/history/clear', { method: 'POST' });
      if (response.ok) {
        this.messages = [];
        this.renderMessages();
      } else {
        throw new Error('Failed to clear history');
      }
    } catch (error) {
      console.error('Clear history error:', error);
      alert('Failed to clear history: ' + error.message);
    }
  }

  exportChat() {
    const chatData = {
      timestamp: new Date().toISOString(),
      messages: this.messages,
      agent: 'Vutler Nexus'
    };
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vutler-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleStreaming() {
    this.isStreaming = !this.isStreaming;
    this.updateToggleButton();
    localStorage.setItem('vutler-streaming', this.isStreaming);
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedStreaming = localStorage.getItem('vutler-streaming');
  const chat = new ChatInterface();
  if (savedStreaming !== null) {
    chat.isStreaming = savedStreaming === 'true';
    chat.updateToggleButton();
  }
  setInterval(() => chat.loadStatus(), 30000);
});
