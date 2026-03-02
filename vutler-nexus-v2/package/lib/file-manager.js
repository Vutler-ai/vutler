/**
 * @vutler/nexus — File Manager
 * Handles local workspace file operations and context loading
 */
const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.ensureWorkspace();
  }

  ensureWorkspace() {
    if (!fs.existsSync(this.workspacePath)) {
      fs.mkdirSync(this.workspacePath, { recursive: true });
    }
    
    // Ensure memory directory exists
    const memoryDir = path.join(this.workspacePath, 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
  }

  // Read file content (tool function)
  readFile(filePath) {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!this.isPathSafe(fullPath)) {
        throw new Error('Access denied: path outside workspace');
      }
      if (!fs.existsSync(fullPath)) {
        throw new Error('File not found');
      }
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  // Write file content (tool function)
  writeFile(filePath, content) {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!this.isPathSafe(fullPath)) {
        throw new Error('Access denied: path outside workspace');
      }
      
      // Ensure parent directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content, 'utf8');
      return 'File written successfully';
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  // List files in directory (tool function)
  listFiles(dirPath = '.') {
    try {
      const fullPath = this.resolvePath(dirPath);
      if (!this.isPathSafe(fullPath)) {
        throw new Error('Access denied: path outside workspace');
      }
      if (!fs.existsSync(fullPath)) {
        throw new Error('Directory not found');
      }
      
      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      return items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, item.name)
      }));
    } catch (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  // Search for files containing text (tool function)
  searchFiles(query, fileExtensions = ['.md', '.txt', '.json']) {
    try {
      const results = [];
      this.searchInDirectory(this.workspacePath, query, fileExtensions, results);
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  searchInDirectory(dirPath, query, extensions, results) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        this.searchInDirectory(itemPath, query, extensions, results);
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (extensions.includes(ext)) {
          try {
            const content = fs.readFileSync(itemPath, 'utf8');
            if (content.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                file: path.relative(this.workspacePath, itemPath),
                matches: this.findMatches(content, query)
              });
            }
          } catch (e) {
            // Skip files that can't be read
          }
        }
      }
    }
  }

  findMatches(content, query) {
    const lines = content.split('\\n');
    const matches = [];
    const queryLower = query.toLowerCase();
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matches.push({
          line: i + 1,
          text: lines[i].trim()
        });
      }
    }
    
    return matches;
  }

  // Load context files for agent system prompt
  loadContextFiles(contextFiles) {
    const context = [];
    
    for (const fileName of contextFiles) {
      try {
        const filePath = path.join(this.workspacePath, fileName);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          context.push(`## ${fileName}\\n${content}`);
        }
      } catch (error) {
        console.warn(`Warning: Could not load context file ${fileName}: ${error.message}`);
      }
    }
    
    return context.join('\\n\\n');
  }

  // Get today memory file path
  getTodayMemoryFile() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.workspacePath, 'memory', `${today}.md`);
  }

  // Append to today memory file
  appendToMemory(content) {
    const memoryFile = this.getTodayMemoryFile();
    const timestamp = new Date().toLocaleTimeString();
    const entry = `\\n[${timestamp}] ${content}\\n`;
    
    try {
      fs.appendFileSync(memoryFile, entry, 'utf8');
      return 'Memory updated';
    } catch (error) {
      throw new Error(`Failed to update memory: ${error.message}`);
    }
  }

  // Utility functions
  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workspacePath, filePath);
  }

  isPathSafe(fullPath) {
    const normalized = path.normalize(fullPath);
    const workspaceNormalized = path.normalize(this.workspacePath);
    return normalized.startsWith(workspaceNormalized);
  }

  // Get file manager tools for agent
  getTools() {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file relative to workspace root'
            }
          },
          required: ['file_path']
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the workspace',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file relative to workspace root'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['file_path', 'content']
        }
      },
      {
        name: 'list_files',
        description: 'List files and directories in a workspace directory',
        parameters: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory path relative to workspace root (default: current directory)',
              default: '.'
            }
          }
        }
      },
      {
        name: 'search_files',
        description: 'Search for text within files in the workspace',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Text to search for'
            },
            extensions: {
              type: 'array',
              items: { type: 'string' },
              description: 'File extensions to search (default: .md, .txt, .json)',
              default: ['.md', '.txt', '.json']
            }
          },
          required: ['query']
        }
      },
      {
        name: 'append_memory',
        description: 'Add an entry to today memory file',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to add to memory'
            }
          },
          required: ['content']
        }
      }
    ];
  }

  // Execute tool function
  async executeTool(toolName, parameters) {
    switch (toolName) {
      case 'read_file':
        return this.readFile(parameters.file_path);
      case 'write_file':
        return this.writeFile(parameters.file_path, parameters.content);
      case 'list_files':
        return this.listFiles(parameters.directory);
      case 'search_files':
        return this.searchFiles(parameters.query, parameters.extensions);
      case 'append_memory':
        return this.appendToMemory(parameters.content);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

module.exports = { FileManager };
