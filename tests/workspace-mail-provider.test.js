'use strict';

describe('WorkspaceMailProvider source selection', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('honors an explicit google source instead of falling back', async () => {
    const get = jest.fn().mockImplementation(async (url) => {
      if (url.startsWith('/api/v1/integrations/google/gmail/messages?')) {
        return {
          messages: [
            {
              id: 'g-1',
              from: 'client@example.com',
              to: 'agent@example.com',
              subject: 'Hello',
              date: '2026-04-06T10:00:00Z',
              snippet: 'Google message',
            },
          ],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    jest.doMock('../packages/nexus/lib/providers/workspace-api-client', () => ({
      WorkspaceApiClient: jest.fn().mockImplementation(() => ({ get })),
    }));

    const { WorkspaceMailProvider } = require('../packages/nexus/lib/providers/workspace-mail');
    const provider = new WorkspaceMailProvider({ server: 'https://app.vutler.ai', apiKey: 'test' });
    const emails = await provider.listEmails({ source: 'google', limit: 5 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain('/api/v1/integrations/google/gmail/messages?');
    expect(emails).toEqual([
      expect.objectContaining({
        id: 'g-1',
        source: 'google',
        subject: 'Hello',
      }),
    ]);
  });

  test('honors an explicit microsoft365 source alias from outlook', async () => {
    const get = jest.fn().mockImplementation(async (url) => {
      if (url.startsWith('/api/v1/integrations/microsoft365/outlook/messages?')) {
        return {
          value: [
            {
              id: 'ms-1',
              from: { emailAddress: { address: 'client@example.com' } },
              toRecipients: [{ emailAddress: { address: 'agent@example.com' } }],
              subject: 'Hello from Outlook',
              receivedDateTime: '2026-04-06T10:00:00Z',
              bodyPreview: 'Outlook message',
            },
          ],
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    jest.doMock('../packages/nexus/lib/providers/workspace-api-client', () => ({
      WorkspaceApiClient: jest.fn().mockImplementation(() => ({ get })),
    }));

    const { WorkspaceMailProvider } = require('../packages/nexus/lib/providers/workspace-mail');
    const provider = new WorkspaceMailProvider({ server: 'https://app.vutler.ai', apiKey: 'test' });
    const emails = await provider.listEmails({ source: 'outlook', limit: 5 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain('/api/v1/integrations/microsoft365/outlook/messages?');
    expect(emails).toEqual([
      expect.objectContaining({
        id: 'ms-1',
        source: 'microsoft365',
        subject: 'Hello from Outlook',
      }),
    ]);
  });
});
