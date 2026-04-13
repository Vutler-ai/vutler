'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildClientConfig,
  resolveDefaultConfigPath,
  writeClientConfig,
} = require('../packages/mcp/lib/bootstrap');

describe('vutler mcp bootstrap helpers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vutler-mcp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('builds a project-scoped MCP config with placeholder credentials', () => {
    const config = buildClientConfig('claude-code');

    expect(config.label).toBe('Claude Code');
    expect(config.config.mcpServers.vutler.command).toBe('npx');
    expect(config.config.mcpServers.vutler.args).toEqual(['-y', '@vutler/mcp']);
    expect(config.config.mcpServers.vutler.env.VUTLER_API_KEY).toBe('vt_your_key_here');
  });

  test('writes config and preserves existing MCP servers', () => {
    const filePath = path.join(tempDir, '.mcp.json');
    fs.writeFileSync(filePath, JSON.stringify({
      mcpServers: {
        other: {
          command: 'uvx',
          args: ['other-mcp'],
        },
      },
    }, null, 2));

    const result = writeClientConfig({
      clientName: 'cursor',
      cwd: tempDir,
      filePath,
      apiUrl: 'https://app.vutler.ai',
    });

    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(result.action).toBe('updated');
    expect(written.mcpServers.other.command).toBe('uvx');
    expect(written.mcpServers.vutler.command).toBe('npx');
  });

  test('replaces invalid JSON only when force is enabled and keeps a backup', () => {
    const filePath = path.join(tempDir, '.mcp.json');
    fs.writeFileSync(filePath, '{invalid');

    expect(() => writeClientConfig({
      clientName: 'vscode',
      cwd: tempDir,
      filePath,
    })).toThrow('is not valid JSON');

    const result = writeClientConfig({
      clientName: 'vscode',
      cwd: tempDir,
      filePath,
      force: true,
    });

    expect(result.backupPath).toContain('.bak.');
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(resolveDefaultConfigPath('claude-code', { cwd: tempDir })).toBe(path.join(tempDir, '.mcp.json'));
  });
});
