'use strict';

describe('websocket pg refactor', () => {
  let resolveApiKeyMock;
  let resolveAgentRecordMock;
  let llmChatMock;

  beforeEach(() => {
    jest.resetModules();

    resolveApiKeyMock = jest.fn();
    resolveAgentRecordMock = jest.fn();
    llmChatMock = jest.fn();

    jest.doMock('../api/middleware/auth', () => ({
      resolveApiKey: resolveApiKeyMock,
    }));

    jest.doMock('../services/sniparaMemoryService', () => ({
      resolveAgentRecord: resolveAgentRecordMock,
    }));

    jest.doMock('../services/llmRouter', () => ({
      chat: llmChatMock,
    }));
  });

  test('authenticates /ws/chat with current api key resolver and loads the workspace agent from PG', async () => {
    resolveApiKeyMock.mockResolvedValue({
      id: 'user-1',
      name: 'Workspace Key',
      workspaceId: 'ws-1',
    });
    resolveAgentRecordMock.mockResolvedValue({
      id: 'agent-1',
      name: 'Jarvis',
      username: 'jarvis',
      workspace_id: 'ws-1',
    });

    const { __test } = require('../api/websocket');
    const pg = { query: jest.fn() };

    const result = await __test.authenticateWebSocketRequest(
      {
        url: '/ws/chat?agent_id=agent-1&api_key=vutler_secret',
        headers: { host: 'app.vutler.ai' },
      },
      { locals: { pg } }
    );

    expect(result.ok).toBe(true);
    expect(result.workspaceId).toBe('ws-1');
    expect(result.agent).toMatchObject({ id: 'agent-1', name: 'Jarvis' });
    expect(resolveApiKeyMock).toHaveBeenCalledWith({ app: { locals: { pg } } }, 'vutler_secret');
    expect(resolveAgentRecordMock).toHaveBeenCalledWith(pg, 'ws-1', 'agent-1', {});
  });

  test('routes chat.message through llmRouter and persists conversation turns in chat_messages', async () => {
    resolveAgentRecordMock.mockResolvedValue({
      id: 'agent-1',
      name: 'Jarvis',
      username: 'jarvis',
      workspace_id: 'ws-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    llmChatMock.mockResolvedValue({
      content: 'Bonjour depuis PG.',
      usage: { input_tokens: 12, output_tokens: 9 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const { __test } = require('../api/websocket');
    const sent = [];
    const ws = {
      readyState: 1,
      send: jest.fn((payload) => sent.push(JSON.parse(payload))),
    };
    const pg = {
      query: jest.fn(async (sql) => {
        if (sql.includes(`FROM tenant_vutler.chat_channels`)) {
          return { rows: [{ id: 'channel-1' }] };
        }
        if (sql.includes(`INSERT INTO tenant_vutler.chat_messages`)) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await __test.handleChatMessage(
      {
        ws,
        agentId: 'agent-1',
        agentName: 'Jarvis',
        workspaceId: 'ws-1',
        userId: 'user-1',
        userName: 'Alice',
      },
      {
        message: 'Salut',
        conversation_id: 'channel-1',
        context: [{ role: 'system', content: 'Ignore' }],
      },
      { locals: { pg, wsConnections: new Map() } }
    );

    expect(llmChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-1', workspace_id: 'ws-1' }),
      [{ role: 'system', content: 'Ignore' }, { role: 'user', content: 'Salut' }],
      pg,
      expect.objectContaining({ wsConnections: expect.any(Map) })
    );
    expect(sent[0]).toMatchObject({ type: 'chat.thinking' });
    expect(sent[1]).toMatchObject({
      type: 'chat.response',
      data: expect.objectContaining({
        agent_id: 'agent-1',
        message: 'Bonjour depuis PG.',
      }),
    });
    expect(pg.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO tenant_vutler.chat_messages'))).toBe(true);
  });

  test('stores message.send directly in chat_messages for the workspace channel', async () => {
    const { __test } = require('../api/websocket');
    const sent = [];
    const ws = {
      readyState: 1,
      send: jest.fn((payload) => sent.push(JSON.parse(payload))),
    };
    const pg = {
      query: jest.fn(async (sql) => {
        if (sql.includes(`FROM tenant_vutler.chat_channels`)) {
          return { rows: [{ id: 'channel-2' }] };
        }
        if (sql.includes(`INSERT INTO tenant_vutler.chat_messages`)) {
          return { rows: [{ id: 'msg-1' }] };
        }
        return { rows: [] };
      }),
    };

    await __test.handleMessageSend(
      {
        ws,
        agentId: 'agent-9',
        agentName: 'Relay',
        workspaceId: 'ws-1',
        identity: { id: 'user-1', name: 'Relay Key' },
      },
      {
        channel_id: 'channel-2',
        text: 'Message de test',
        attachments: [{ type: 'link', href: '/tasks' }],
      },
      { locals: { pg } }
    );

    expect(pg.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO tenant_vutler.chat_messages'))).toBe(true);
    expect(sent[0]).toMatchObject({
      type: 'message.sent',
      data: expect.objectContaining({ channel_id: 'channel-2', message_id: 'msg-1' }),
    });
  });
});
