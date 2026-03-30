'use strict';

jest.mock('../../api/ws-chat', () => ({
  publishMessage: jest.fn(),
}));

const { publishMessage } = require('../../api/ws-chat');
const { insertChatMessage } = require('../../services/chatMessages');

describe('chat realtime publishing', () => {
  beforeEach(() => {
    publishMessage.mockClear();
  });

  test('publishes persisted user, ack, and response messages', async () => {
    const pg = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-user',
            channel_id: 'chan-1',
            sender_id: 'user-1',
            sender_name: 'User',
            content: 'Bonjour',
            message_type: 'text',
            workspace_id: 'ws-1',
            created_at: '2026-03-30T10:00:00.000Z',
            reply_to_message_id: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-ack',
            channel_id: 'chan-1',
            sender_id: 'jarvis',
            sender_name: 'Jarvis',
            content: 'Bien recu.',
            message_type: 'text',
            workspace_id: 'ws-1',
            created_at: '2026-03-30T10:00:01.000Z',
            reply_to_message_id: 'msg-user',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-reply',
            channel_id: 'chan-1',
            sender_id: 'agent-1',
            sender_name: 'Mike',
            content: 'Voici le resultat.',
            message_type: 'text',
            workspace_id: 'ws-1',
            created_at: '2026-03-30T10:00:02.000Z',
            reply_to_message_id: 'msg-user',
          }],
        }),
    };

    await insertChatMessage(pg, null, 'tenant_vutler', {
      channel_id: 'chan-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Bonjour',
      message_type: 'text',
      workspace_id: 'ws-1',
      reply_to_message_id: null,
    });

    await insertChatMessage(pg, null, 'tenant_vutler', {
      channel_id: 'chan-1',
      sender_id: 'jarvis',
      sender_name: 'Jarvis',
      content: 'Bien recu.',
      message_type: 'text',
      workspace_id: 'ws-1',
      reply_to_message_id: 'msg-user',
    });

    await insertChatMessage(pg, null, 'tenant_vutler', {
      channel_id: 'chan-1',
      sender_id: 'agent-1',
      sender_name: 'Mike',
      content: 'Voici le resultat.',
      message_type: 'text',
      workspace_id: 'ws-1',
      reply_to_message_id: 'msg-user',
    });

    expect(publishMessage).toHaveBeenCalledTimes(3);
    expect(publishMessage.mock.calls[0][0]).toMatchObject({ id: 'msg-user', channel_id: 'chan-1' });
    expect(publishMessage.mock.calls[1][0]).toMatchObject({ id: 'msg-ack', reply_to_message_id: 'msg-user' });
    expect(publishMessage.mock.calls[2][0]).toMatchObject({ id: 'msg-reply', reply_to_message_id: 'msg-user' });
  });
});
