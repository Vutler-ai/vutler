'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('email api list limits', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('drafts route honors the requested limit', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes("FROM tenant_vutler.emails WHERE folder = 'drafts'")) {
        expect(sql).toContain('LIMIT $2');
        expect(params).toEqual(['ws-1', 5]);
        return {
          rows: Array.from({ length: 5 }, (_, index) => ({
            id: `draft-${index}`,
            from_addr: 'nora@starbox-group.com',
            to_addr: 'alex@starbox-group.com',
            subject: `Draft ${index}`,
            body: `Body ${index}`,
            html_body: null,
            is_read: false,
            flagged: false,
            folder: 'drafts',
            agent_id: null,
            created_at: `2026-04-06T10:0${index}:00.000Z`,
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../services/workspaceEmailService', () => ({
      assignEmailToAgent: jest.fn(),
      moveEmailToFolder: jest.fn(),
      resolveSenderAddress: jest.fn(),
      toggleEmailFlag: jest.fn(),
      updateEmailReadState: jest.fn(),
    }));
    jest.doMock('../services/postalMailer', () => ({
      sendPostalMail: jest.fn(),
    }));

    const router = require('../app/custom/api/email');
    const handler = findRouteHandler(router, 'get', '/email/drafts');
    const req = {
      workspaceId: 'ws-1',
      query: { limit: '5' },
      app: { locals: { pg: { query } } },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 5,
    }));
    const payload = res.json.mock.calls[0][0];
    expect(payload.emails).toHaveLength(5);
  });

  test('sent route clamps the requested limit', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes("FROM tenant_vutler.emails WHERE folder = 'sent'")) {
        expect(sql).toContain('LIMIT $2');
        expect(params).toEqual(['ws-1', 200]);
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../services/workspaceEmailService', () => ({
      assignEmailToAgent: jest.fn(),
      moveEmailToFolder: jest.fn(),
      resolveSenderAddress: jest.fn(),
      toggleEmailFlag: jest.fn(),
      updateEmailReadState: jest.fn(),
    }));
    jest.doMock('../services/postalMailer', () => ({
      sendPostalMail: jest.fn(),
    }));

    const router = require('../app/custom/api/email');
    const handler = findRouteHandler(router, 'get', '/email/sent');
    const req = {
      workspaceId: 'ws-1',
      query: { limit: '999' },
      app: { locals: { pg: { query } } },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      emails: [],
      count: 0,
    });
  });
});
