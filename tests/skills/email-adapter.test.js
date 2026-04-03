'use strict';

describe('EmailAdapter', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('sends immediately when the latest user message is a direct send instruction', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ id: 'email-1' }],
    });
    const resolveAgentEmailProvisioning = jest.fn().mockResolvedValue({
      provisioned: true,
      email: 'jarvis@starbox-group.com',
      source: 'agent',
    });
    const sendPostalMail = jest.fn().mockResolvedValue({
      success: true,
      data: { message_id: 'postal-msg-1' },
    });
    const resolveSenderAddress = jest.fn().mockResolvedValue('jarvis@starbox-group.com');

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning,
    }));
    jest.doMock('../../services/postalMailer', () => ({
      sendPostalMail,
    }));
    jest.doMock('../../services/workspaceEmailService', () => ({
      resolveSenderAddress,
    }));

    const { EmailAdapter } = require('../../services/skills/adapters/EmailAdapter');
    const adapter = new EmailAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      latestUserMessage: 'Oui, envoie à client@example.com',
      params: {
        recipient_email: 'client@example.com',
        subject: 'Follow-up',
        body: 'Hello from Jarvis',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'email-1',
      uid: 'email-1',
      status: 'sent',
      messageId: 'postal-msg-1',
      emailUrl: '/email?folder=sent&uid=email-1',
      placement: {
        root: '/email',
        folder: 'sent',
        defaulted: true,
        reason: 'email_sent',
      },
    });
    expect(sendPostalMail).toHaveBeenCalledWith({
      to: 'client@example.com',
      from: 'jarvis@starbox-group.com',
      subject: 'Follow-up',
      plain_body: 'Hello from Jarvis',
      html_body: undefined,
    });
    expect(resolveSenderAddress).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      agentRef: 'agent-1',
      fallbackUserEmail: 'jarvis@starbox-group.com',
    }));
    expect(resolveAgentEmailProvisioning).toHaveBeenCalled();

    const insertArgs = query.mock.calls[0][1];
    expect(insertArgs[0]).toBe('ws-1');
    expect(insertArgs[1]).toBe('jarvis@starbox-group.com');
    expect(insertArgs[2]).toBe('client@example.com');
    expect(JSON.parse(insertArgs[7])).toEqual(expect.objectContaining({
      implicit_user_approval: true,
      latest_user_message: 'Oui, envoie à client@example.com',
      message_id: 'postal-msg-1',
    }));
  });

  test('creates a draft when no direct send instruction is present', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ id: 'draft-1' }],
    });
    const resolveAgentEmailProvisioning = jest.fn().mockResolvedValue({
      provisioned: true,
      email: 'jarvis@starbox-group.com',
      source: 'agent',
    });
    const sendPostalMail = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning,
    }));
    jest.doMock('../../services/postalMailer', () => ({
      sendPostalMail,
    }));
    jest.doMock('../../services/workspaceEmailService', () => ({
      resolveSenderAddress: jest.fn(),
    }));

    const { EmailAdapter } = require('../../services/skills/adapters/EmailAdapter');
    const adapter = new EmailAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      latestUserMessage: 'Prépare un email pour client@example.com',
      params: {
        recipient_email: 'client@example.com',
        subject: 'Follow-up',
        body: 'Hello from Jarvis',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'pending_approval',
      draftId: 'draft-1',
      draftUrl: '/email?folder=drafts&uid=draft-1',
      placement: {
        root: '/email',
        folder: 'drafts',
        defaulted: true,
        reason: 'draft_created',
      },
    });
    expect(sendPostalMail).not.toHaveBeenCalled();

    const insertArgs = query.mock.calls[0][1];
    expect(insertArgs[0]).toBe('ws-1');
    expect(insertArgs[1]).toBe('jarvis@starbox-group.com');
    expect(insertArgs[2]).toBe('client@example.com');
  });
});
