'use strict';

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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VUTLER_API_URL = 'https://app.vutler.ai';
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
