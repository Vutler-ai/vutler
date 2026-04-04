'use strict';

jest.mock('../lib/vaultbrix', () => ({ query: jest.fn() }));

const dashboardRouter = require('../api/dashboard');
const { fetchDashboardData } = require('../api/dashboard');

function getDashboardHandler() {
  const layer = dashboardRouter.stack.find((entry) => entry.route?.path === '/' && entry.route?.methods?.get);
  return layer.route.stack[0].handle;
}

describe('dashboard api', () => {
  test('scopes dashboard queries by workspace and uses usage summary totals', async () => {
    const pg = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM tenant_vutler.agents')) {
          expect(sql).toMatch(/WHERE workspace_id = \$1/);
          expect(params).toEqual(['ws-1']);
          return {
            rows: [
              { id: 'agent-1', name: 'Alpha', username: 'alpha', email: 'alpha@acme.test', status: 'online', type: 'bot', role: 'ops', avatar: null, mbti: null, model: 'claude-sonnet-4' },
              { id: 'agent-2', name: 'Beta', username: 'beta', email: 'beta@acme.test', status: 'active', type: 'bot', role: 'sales', avatar: '/static/avatars/lead-gen.png', mbti: null, model: 'gpt-5.4' },
              { id: 'agent-3', name: 'Gamma', username: 'gamma', email: 'gamma@acme.test', status: 'inactive', type: 'bot', role: 'support', avatar: null, mbti: null, model: 'claude-sonnet-4' },
            ],
          };
        }

        if (sql.includes('FROM tenant_vutler.chat_messages')) {
          expect(sql).toMatch(/workspace_id = \$1/);
          expect(params).toEqual(['ws-1']);
          return { rows: [{ count: 7 }] };
        }

        if (sql.includes('FROM tenant_vutler.llm_usage_logs')) {
          expect(params).toEqual(['ws-1']);
          return { rows: [{ total: 4321 }] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const payload = await fetchDashboardData(pg, 'ws-1');

    expect(payload.stats).toEqual({
      totalAgents: 3,
      activeAgents: 2,
      messagesToday: 7,
      totalTokens: 4321,
    });
    expect(payload.agents[0].avatar).toBe('/sprites/agent-alpha.png');
    expect(payload.agents[1].avatar).toBe('/static/avatars/lead-gen.png');
  });

  test('rejects dashboard requests without a workspace context', async () => {
    const handler = getDashboardHandler();
    const req = { app: { locals: {} } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required',
    });
  });
});
