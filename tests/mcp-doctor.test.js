'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../packages/mcp/lib/api-client', () => ({
  get: jest.fn(),
}));

jest.mock('../packages/mcp/lib/plan-gating', () => ({
  getAllowedToolNames: jest.fn(() => new Set(['list_agents', 'run_agent'])),
  resolveWorkspacePlanId: jest.fn(() => Promise.resolve('office_team')),
}));

const api = require('../packages/mcp/lib/api-client');
const planGating = require('../packages/mcp/lib/plan-gating');
const { runDoctor, formatDoctorReport } = require('../packages/mcp/lib/doctor');

describe('vutler mcp doctor', () => {
  const originalApiKey = process.env.VUTLER_API_KEY;
  const originalApiUrl = process.env.VUTLER_API_URL;
  let tempDir;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VUTLER_API_URL = 'https://app.vutler.ai';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vutler-mcp-doctor-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env.VUTLER_API_KEY = originalApiKey;
    process.env.VUTLER_API_URL = originalApiUrl;
  });

  test('reports success with authenticated API access and plan gating', async () => {
    process.env.VUTLER_API_KEY = 'vt_live_key';
    api.get.mockResolvedValue({ agents: [] });

    const result = await runDoctor({ allToolNames: ['list_agents', 'run_agent', 'send_email'] });

    expect(result.ok).toBe(true);
    expect(result.planId).toBe('office_team');
    expect(result.allowedTools).toEqual(['list_agents', 'run_agent']);
    expect(api.get).toHaveBeenCalledWith('/api/v1/agents', { limit: 1 });
    expect(planGating.resolveWorkspacePlanId).toHaveBeenCalled();
    expect(formatDoctorReport(result)).toContain('[ok] workspace_api');
  });

  test('validates the resolved client config when a client is specified', async () => {
    process.env.VUTLER_API_KEY = 'vt_live_key';
    api.get.mockResolvedValue({ agents: [] });

    const filePath = path.join(tempDir, '.mcp.json');
    fs.writeFileSync(filePath, JSON.stringify({
      mcpServers: {
        vutler: {
          command: 'npx',
          args: ['-y', '@vutler/mcp'],
          env: {
            VUTLER_API_URL: 'https://app.vutler.ai',
            VUTLER_API_KEY: 'vt_live_key',
          },
        },
      },
    }, null, 2));

    const result = await runDoctor({
      allToolNames: ['list_agents', 'run_agent'],
      clientName: 'claude-code',
      filePath,
      cwd: tempDir,
    });

    expect(result.ok).toBe(true);
    expect(result.clientConfig.ready).toBe(true);
    expect(formatDoctorReport(result)).toContain('Config ready: yes');
    expect(formatDoctorReport(result)).toContain('[ok] client_config_api_key');
  });

  test('fails doctor when the client config still uses the placeholder key', async () => {
    process.env.VUTLER_API_KEY = 'vt_live_key';
    api.get.mockResolvedValue({ agents: [] });

    const filePath = path.join(tempDir, '.mcp.json');
    fs.writeFileSync(filePath, JSON.stringify({
      mcpServers: {
        vutler: {
          command: 'npx',
          args: ['-y', '@vutler/mcp'],
          env: {
            VUTLER_API_URL: 'https://app.vutler.ai',
            VUTLER_API_KEY: 'vt_your_key_here',
          },
        },
      },
    }, null, 2));

    const result = await runDoctor({
      allToolNames: ['list_agents'],
      clientName: 'claude-code',
      filePath,
      cwd: tempDir,
    });

    expect(result.ok).toBe(false);
    expect(result.clientConfig.ready).toBe(false);
    expect(formatDoctorReport(result)).toContain('[fail] client_config_api_key');
  });

  test('reports missing credentials without attempting remote checks', async () => {
    delete process.env.VUTLER_API_KEY;

    const result = await runDoctor({ allToolNames: ['list_agents'] });

    expect(result.ok).toBe(false);
    expect(result.hasApiKey).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
    expect(result.allowedTools).toEqual([]);
    expect(formatDoctorReport(result, { json: true })).toContain('"hasApiKey": false');
  });
});
