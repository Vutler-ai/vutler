'use strict';

describe('chat action runs api', () => {
  test('lists workspace-scoped chat action runs with filters', async () => {
    jest.resetModules();

    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'run-1',
          workspace_id: 'ws-1',
          chat_message_id: 'msg-1',
          channel_id: 'chan-1',
          action_key: 'email_outreach',
          status: 'success',
        },
      ],
    });

    jest.doMock('../../services/chatMessages', () => ({
      insertChatMessage: jest.fn(),
      normalizeChatMessage: jest.fn((row) => row),
    }));

    const router = require('../../app/custom/api/chat');
    const layer = router.stack.find((entry) => entry.route?.path === '/chat/action-runs' && entry.route.methods.get);
    const handler = layer.route.stack[0].handle;

    const req = {
      query: { channel_id: 'chan-1', message_id: 'msg-1', status: 'success', limit: '20' },
      workspaceId: 'ws-1',
      app: { locals: { pg: { query } } },
      headers: {},
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await handler(req, res);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tenant_vutler.chat_action_runs'),
      ['ws-1', 'chan-1', 'msg-1', 'success', 20]
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: 'run-1',
          chat_message_id: 'msg-1',
          channel_id: 'chan-1',
          action_key: 'email_outreach',
          status: 'success',
        }),
      ],
    });
  });
});
