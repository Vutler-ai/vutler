'use strict';

describe('chat channel maintenance', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('findExistingDmChannelId requires an exact two-party DM match', async () => {
    const pg = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'chan-1' }] }),
    };

    const { findExistingDmChannelId } = require('../services/chatChannelMaintenance');
    const channelId = await findExistingDmChannelId(pg, {
      workspaceId: 'ws-1',
      currentUserId: 'user-1',
      contactId: 'agent-jarvis',
    });

    expect(channelId).toBe('chan-1');
    expect(pg.query).toHaveBeenCalledWith(
      expect.stringContaining('unexpected_cm.user_id NOT IN ($2, $3)'),
      ['ws-1', 'user-1', 'agent-jarvis']
    );
  });
});
