/**
 * @vutler/nexus — Local Tools System
 * Modular tool system for agent function calling: shell, files, web, system
 */
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT = 30000; // 30s
const MAX_TIMEOUT = 300000; // 300s
const MAX_OUTPUT = 100000; // 100KB truncation for tool output

// ─── Tool Definitions (Claude/OpenAI compatible schema) ───

const TOOL_DEFINITIONS = {
  shell_exec: {
    name: 'shell_exec',
    description: 'Run a shell command and return stdout/stderr. Use for system tasks, installing packages, git operations, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in seconds (default 30, max 300)' },
        cwd: { type: 'string', description: 'Working directory (default: workspace)' }
      },
      required: ['command']
    },
    permission: 'shell'
  },
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file. Supports text files up to 10MB.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to workspace)' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' }
      },
      required: ['path']
    },
    permission: 'fileRead'
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories automatically.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to workspace)' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    },
    permission: 'fileWrite'
  },
  edit_file: {
    name: 'edit_file',
    description: 'Search and replace text in a file. The old_text must match exactly.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_text: { type: 'string', description: 'Exact text to find' },
        new_text: { type: 'string', description: 'Replacement text' }
      },
      required: ['path', 'old_text', 'new_text']
    },
    permission: 'fileWrite'
  },
  list_directory: {
    name: 'list_directory',
    description: 'List files and directories with metadata (size, type, modified date).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (default: workspace root)' },
        recursive: { type: 'boolean', description: 'List recursively (default: false)' },
        max_depth: { type: 'number', description: 'Max depth for recursive listing (default: 3)' }
      }
    },
    permission: 'fileRead'
  },
  search_files: {
    name: 'search_files',
    description: 'Search for text/pattern across files using grep.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (supports regex)' },
        path: { type: 'string', description: 'Directory to search in (default: workspace)' },
        include: { type: 'string', description: 'File glob pattern to include (e.g. "*.js")' },
        max_results: { type: 'number', description: 'Maximum results (default: 50)' }
      },
      required: ['pattern']
    },
    permission: 'fileRead'
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web and return results with titles, URLs, and snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (default: 5, max: 10)' }
      },
      required: ['query']
    },
    permission: 'network'
  },
  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch content from a URL and return as text.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        max_chars: { type: 'number', description: 'Maximum characters to return (default: 50000)' }
      },
      required: ['url']
    },
    permission: 'network'
  },
  system_info: {
    name: 'system_info',
    description: 'Get system information: OS, CPU, memory, disk usage, uptime.',
    input_schema: {
      type: 'object',
      properties: {}
    },
    permission: 'system'
  },
  open_app: {
    name: 'open_app',
    description: 'Open an application or file with the default system handler.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Application name, file path, or URL to open' }
      },
      required: ['target']
    },
    permission: 'apps'
  },
  clipboard_read: {
    name: 'clipboard_read',
    description: 'Read the current clipboard contents.',
    input_schema: { type: 'object', properties: {} },
    permission: 'clipboard'
  },
  clipboard_write: {
    name: 'clipboard_write',
    description: 'Write text to the clipboard.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to copy to clipboard' }
      },
      required: ['text']
    },
    permission: 'clipboard'
  },
  screenshot: {
    name: 'screenshot',
    description: 'Take a screenshot and save it to a file.',
    input_schema: {
      type: 'object',
      properties: {
        output: { type: 'string', description: 'Output file path (default: screenshot-<timestamp>.png)' }
      }
    },
    permission: 'screenshot'
  }
};

// ─── Default Permissions ───

const DEFAULT_PERMISSIONS = {
  shell: true,
  fileRead: true,
  fileWrite: true,
  network: true,
  system: true,
  apps: false,
  clipboard: false,
  screenshot: false,
  allowedPaths: [],
  blockedCommands: ['rm -rf /', 'sudo rm', 'mkfs', 'dd if=', ':(){:|:&};:', 'chmod -R 777 /']
};

// ─── Tool Logger ───

class ToolLogger {
  constructor(configDir) {
    this.logFile = path.join(configDir, 'tool-log.jsonl');
  }

  log(entry) {
    try {
      const line = JSON.stringify({
        ...entry,
        timestamp: new Date().toISOString()
      }) + '\n';
      fs.appendFileSync(this.logFile, line, 'utf8');
    } catch (e) {
      console.error('[tools] Failed to write log:', e.message);
    }
  }
}

// ─── Tool Executor ───

class ToolExecutor {
  constructor(config) {
    this.workspace = config.workspace || path.join(os.homedir(), '.vutler', 'workspace');
    this.permissions = { ...DEFAULT_PERMISSIONS, ...(config.permissions || {}) };
    this.configDir = config.configDir || path.join(os.homedir(), '.vutler');
    this.logger = new ToolLogger(this.configDir);
  }

  // Get tools available based on permissions
  getAvailableTools() {
    const available = [];
    for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
      if (this.permissions[def.permission]) {
        available.push(def);
      }
    }
    return available;
  }

  // Get tool definitions in Claude format
  getClaudeTools() {
    return this.getAvailableTools().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));
  }

  // Get tool definitions in OpenAI format
  getOpenAITools() {
    return this.getAvailableTools().map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));
  }

  // Get tools description for system prompt
  getToolsDescription() {
    const tools = this.getAvailableTools();
    if (tools.length === 0) return '';
    const lines = tools.map(t => `- **${t.name}**: ${t.description}`);
    return `\n\nYou have access to these tools:\n${lines.join('\n')}\n\nUse tools when needed to help the user. You can call multiple tools in sequence.`;
  }

  // Check permission for a tool
  checkPermission(toolName) {
    const def = TOOL_DEFINITIONS[toolName];
    if (!def) return { allowed: false, reason: `Unknown tool: ${toolName}` };
    if (!this.permissions[def.permission]) {
      return { allowed: false, reason: `Permission '${def.permission}' is disabled for tool '${toolName}'` };
    }
    return { allowed: true };
  }

  // Check if a command is blocked
  isCommandBlocked(command) {
    const blocked = this.permissions.blockedCommands || [];
    const cmdLower = command.toLowerCase().trim();
    for (const pattern of blocked) {
      if (cmdLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  // Check if a path is allowed
  isPathAllowed(filePath) {
    const allowed = this.permissions.allowedPaths || [];
    if (allowed.length === 0) return true; // empty = all paths
    const resolved = path.resolve(this.workspace, filePath);
    return allowed.some(p => resolved.startsWith(path.resolve(p)));
  }

  // Resolve path relative to workspace
  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(this.workspace, filePath);
  }

  // Truncate output if too long
  truncate(text, max = MAX_OUTPUT) {
    if (!text || text.length <= max) return text;
    return text.substring(0, max) + `\n\n... [truncated, ${text.length - max} chars omitted]`;
  }

  // Execute a tool by name
  async execute(toolName, input) {
    const startTime = Date.now();
    const perm = this.checkPermission(toolName);
    
    if (!perm.allowed) {
      const result = { success: false, error: perm.reason };
      this.logger.log({ tool: toolName, input, ...result, durationMs: Date.now() - startTime });
      return result;
    }

    try {
      let output;
      switch (toolName) {
        case 'shell_exec': output = await this._shellExec(input); break;
        case 'read_file': output = await this._readFile(input); break;
        case 'write_file': output = await this._writeFile(input); break;
        case 'edit_file': output = await this._editFile(input); break;
        case 'list_directory': output = await this._listDirectory(input); break;
        case 'search_files': output = await this._searchFiles(input); break;
        case 'web_search': output = await this._webSearch(input); break;
        case 'web_fetch': output = await this._webFetch(input); break;
        case 'system_info': output = await this._systemInfo(input); break;
        case 'open_app': output = await this._openApp(input); break;
        case 'clipboard_read': output = await this._clipboardRead(input); break;
        case 'clipboard_write': output = await this._clipboardWrite(input); break;
        case 'screenshot': output = await this._screenshot(input); break;
        default:
          output = { success: false, error: `Unknown tool: ${toolName}` };
      }

      const result = typeof output === 'string' ? { success: true, output } : output;
      this.logger.log({ tool: toolName, input, success: result.success !== false, durationMs: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = { success: false, error: err.message };
      this.logger.log({ tool: toolName, input, ...result, durationMs: Date.now() - startTime });
      return result;
    }
  }

  // ─── Tool Implementations ───

  async _shellExec({ command, timeout, cwd }) {
    if (this.isCommandBlocked(command)) {
      return { success: false, error: `Command blocked by safety filter: ${command}` };
    }

    const timeoutMs = Math.min((timeout || 30) * 1000, MAX_TIMEOUT);
    const workDir = cwd ? this.resolvePath(cwd) : this.workspace;

    return new Promise((resolve) => {
      exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, HOME: os.homedir() }
      }, (error, stdout, stderr) => {
        if (error && error.killed) {
          resolve({ success: false, error: `Command timed out after ${timeout || 30}s` });
        } else {
          const output = this.truncate((stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : ''));
          resolve({
            success: !error,
            output: output || '(no output)',
            exitCode: error ? error.code : 0
          });
        }
      });
    });
  }

  async _readFile({ path: filePath, offset, limit }) {
    const resolved = this.resolvePath(filePath);
    if (!this.isPathAllowed(resolved)) {
      return { success: false, error: 'Path not in allowed paths' };
    }
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const stat = fs.statSync(resolved);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 10MB)` };
    }

    let content = fs.readFileSync(resolved, 'utf8');
    
    if (offset || limit) {
      const lines = content.split('\n');
      const start = (offset || 1) - 1;
      const end = limit ? start + limit : lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return { success: true, output: this.truncate(content) };
  }

  async _writeFile({ path: filePath, content }) {
    const resolved = this.resolvePath(filePath);
    if (!this.isPathAllowed(resolved)) {
      return { success: false, error: 'Path not in allowed paths' };
    }

    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolved, content, 'utf8');
    return { success: true, output: `Written ${content.length} bytes to ${filePath}` };
  }

  async _editFile({ path: filePath, old_text, new_text }) {
    const resolved = this.resolvePath(filePath);
    if (!this.isPathAllowed(resolved)) {
      return { success: false, error: 'Path not in allowed paths' };
    }
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    let content = fs.readFileSync(resolved, 'utf8');
    if (!content.includes(old_text)) {
      return { success: false, error: 'old_text not found in file' };
    }

    content = content.replace(old_text, new_text);
    fs.writeFileSync(resolved, content, 'utf8');
    return { success: true, output: `Replaced text in ${filePath}` };
  }

  async _listDirectory({ path: dirPath, recursive, max_depth }) {
    const resolved = this.resolvePath(dirPath || '.');
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `Directory not found: ${dirPath || '.'}` };
    }

    const items = [];
    const listDir = (dir, depth = 0) => {
      if (recursive && depth > (max_depth || 3)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && depth > 0) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(resolved, fullPath);
        try {
          const stat = fs.statSync(fullPath);
          items.push({
            name: relPath || entry.name,
            type: entry.isDirectory() ? 'dir' : 'file',
            size: entry.isFile() ? stat.size : undefined,
            modified: stat.mtime.toISOString()
          });
          if (recursive && entry.isDirectory()) {
            listDir(fullPath, depth + 1);
          }
        } catch (e) { /* skip */ }
      }
    };

    listDir(resolved);
    
    const lines = items.map(i => {
      const size = i.size !== undefined ? ` (${this._formatBytes(i.size)})` : '';
      return `${i.type === 'dir' ? '📁' : '📄'} ${i.name}${size}`;
    });

    return { success: true, output: lines.join('\n') || '(empty directory)' };
  }

  async _searchFiles({ pattern, path: searchPath, include, max_results }) {
    const resolved = this.resolvePath(searchPath || '.');
    const maxRes = max_results || 50;
    const includeFlag = include ? `--include='${include}'` : '';

    return new Promise((resolve) => {
      const cmd = `grep -rn ${includeFlag} -m ${maxRes} '${pattern.replace(/'/g, "'\\''")}' '${resolved}' 2>/dev/null | head -${maxRes}`;
      exec(cmd, { timeout: DEFAULT_TIMEOUT, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (!stdout || !stdout.trim()) {
          resolve({ success: true, output: 'No matches found.' });
        } else {
          resolve({ success: true, output: this.truncate(stdout.trim()) });
        }
      });
    });
  }

  async _webSearch({ query, count }) {
    const n = Math.min(count || 5, 10);
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vutler/1.0)' }
      });
      const html = await response.text();
      
      // Parse results from DuckDuckGo HTML
      const results = [];
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      
      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < n) {
        results.push({ url: match[1], title: match[2].replace(/<[^>]+>/g, '').trim() });
      }
      
      let i = 0;
      while ((match = snippetRegex.exec(html)) !== null && i < results.length) {
        results[i].snippet = match[1].replace(/<[^>]+>/g, '').trim();
        i++;
      }

      if (results.length === 0) {
        return { success: true, output: `No results found for "${query}"` };
      }

      const output = results.map((r, idx) =>
        `${idx + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || ''}`
      ).join('\n\n');

      return { success: true, output };
    } catch (err) {
      return { success: false, error: `Web search failed: ${err.message}` };
    }
  }

  async _webFetch({ url, max_chars }) {
    const maxChars = max_chars || 50000;
    try {
      new URL(url); // validate URL
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vutler/1.0)' },
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      let text = await response.text();
      
      // Strip HTML tags for basic readability
      if (contentType.includes('html')) {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (text.length > maxChars) {
        text = text.substring(0, maxChars) + `\n\n... [truncated]`;
      }

      return { success: true, output: text };
    } catch (err) {
      return { success: false, error: `Fetch failed: ${err.message}` };
    }
  }

  async _systemInfo() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    let diskInfo = '';
    try {
      diskInfo = execSync("df -h / 2>/dev/null | tail -1", { timeout: 5000 }).toString().trim();
    } catch (e) { diskInfo = 'unavailable'; }

    let topProcesses = '';
    try {
      topProcesses = execSync("ps aux --sort=-%cpu 2>/dev/null | head -6 || ps aux | head -6", { timeout: 5000 }).toString().trim();
    } catch (e) { topProcesses = 'unavailable'; }

    const info = [
      `OS: ${os.type()} ${os.release()} (${os.arch()})`,
      `Hostname: ${os.hostname()}`,
      `CPU: ${cpus[0]?.model || 'unknown'} (${cpus.length} cores)`,
      `Memory: ${this._formatBytes(totalMem - freeMem)} / ${this._formatBytes(totalMem)} (${Math.round((1 - freeMem / totalMem) * 100)}% used)`,
      `Uptime: ${this._formatUptime(os.uptime())}`,
      `Disk: ${diskInfo}`,
      `\nTop Processes:\n${topProcesses}`
    ];

    return { success: true, output: info.join('\n') };
  }

  async _openApp({ target }) {
    const platform = os.platform();
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    
    return new Promise((resolve) => {
      exec(`${cmd} '${target.replace(/'/g, "'\\''")}' 2>&1`, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: `Failed to open: ${error.message}` });
        } else {
          resolve({ success: true, output: `Opened: ${target}` });
        }
      });
    });
  }

  async _clipboardRead() {
    const platform = os.platform();
    const cmd = platform === 'darwin' ? 'pbpaste' : platform === 'win32' ? 'powershell Get-Clipboard' : 'xclip -selection clipboard -o';
    
    return new Promise((resolve) => {
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve({ success: false, error: `Clipboard read failed: ${error.message}` });
        } else {
          resolve({ success: true, output: stdout });
        }
      });
    });
  }

  async _clipboardWrite({ text }) {
    const platform = os.platform();
    const cmd = platform === 'darwin' ? 'pbcopy' : platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
    
    return new Promise((resolve) => {
      const proc = exec(cmd, { timeout: 5000 }, (error) => {
        if (error) {
          resolve({ success: false, error: `Clipboard write failed: ${error.message}` });
        } else {
          resolve({ success: true, output: 'Copied to clipboard' });
        }
      });
      proc.stdin.write(text);
      proc.stdin.end();
    });
  }

  async _screenshot({ output }) {
    const platform = os.platform();
    const outPath = output || path.join(this.workspace, `screenshot-${Date.now()}.png`);
    
    let cmd;
    if (platform === 'darwin') {
      cmd = `screencapture -x '${outPath}'`;
    } else if (platform === 'linux') {
      cmd = `import -window root '${outPath}' 2>/dev/null || scrot '${outPath}'`;
    } else {
      return { success: false, error: 'Screenshots not supported on this platform' };
    }

    return new Promise((resolve) => {
      exec(cmd, { timeout: 10000 }, (error) => {
        if (error) {
          resolve({ success: false, error: `Screenshot failed: ${error.message}` });
        } else {
          resolve({ success: true, output: `Screenshot saved to: ${outPath}` });
        }
      });
    });
  }

  // ─── Helpers ───

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  _formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }
}

module.exports = { ToolExecutor, TOOL_DEFINITIONS, DEFAULT_PERMISSIONS };
