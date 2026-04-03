'use strict';

jest.mock('../services/workspacePlanService', () => ({
  getWorkspacePlanId: jest.fn(),
}));

const { getWorkspacePlanId } = require('../services/workspacePlanService');
const {
  assignEmailToAgent,
  moveEmailToFolder,
  processInboundEmail,
  resolveSenderAddress,
  resolveWorkspaceEmailDomain,
  resolveWorkspaceEmailEntitlements,
  toggleEmailFlag,
  updateEmailReadState,
} = require('../services/workspaceEmailService');

function createDb(resolver) {
  return {
    query: jest.fn(resolver),
  };
}

describe('workspaceEmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes managed email and custom domain entitlements by plan', async () => {
    getWorkspacePlanId
      .mockResolvedValueOnce('office_starter')
      .mockResolvedValueOnce('agents_pro')
      .mockResolvedValueOnce('free');

    await expect(resolveWorkspaceEmailEntitlements({ query: jest.fn() }, 'ws-office')).resolves.toMatchObject({
      planId: 'office_starter',
      managedAgentEmail: true,
      mailboxAdmin: true,
      customDomains: true,
    });

    await expect(resolveWorkspaceEmailEntitlements({ query: jest.fn() }, 'ws-agents')).resolves.toMatchObject({
      planId: 'agents_pro',
      managedAgentEmail: true,
      mailboxAdmin: false,
      customDomains: false,
    });

    await expect(resolveWorkspaceEmailEntitlements({ query: jest.fn() }, 'ws-free')).resolves.toMatchObject({
      planId: 'free',
      managedAgentEmail: false,
      mailboxAdmin: false,
      customDomains: false,
    });
  });

  test('falls back to slug.vutler.ai when the plan has no custom-domain access', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    const db = createDb(async (sql) => {
      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'acme' }] };
      }
      if (sql.includes('FROM tenant_vutler.workspace_domains')) {
        return { rows: [{ domain: 'acme.com' }] };
      }
      return { rows: [] };
    });

    const domain = await resolveWorkspaceEmailDomain(db, 'ws-agents');
    expect(domain).toBe('acme.vutler.ai');
  });

  test('accepts verified custom domains only on plans that allow them', async () => {
    getWorkspacePlanId.mockResolvedValue('office_starter');
    const db = createDb(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'acme' }] };
      }
      if (sql.includes('FROM tenant_vutler.workspace_domains') && params[1] === 'acme.com') {
        return { rows: [{ domain: 'acme.com' }] };
      }
      return { rows: [] };
    });

    const domain = await resolveWorkspaceEmailDomain(db, 'ws-office', { requestedDomain: 'acme.com' });
    expect(domain).toBe('acme.com');
  });

  test('rejects sender resolution for agents outside the workspace', async () => {
    const db = createDb(async () => ({ rows: [] }));

    await expect(resolveSenderAddress({
      db,
      workspaceId: 'ws-1',
      agentRef: 'agent-foreign',
    })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Agent not found in this workspace.',
    });
  });

  test('scopes email mutations and assignment by workspace', async () => {
    const db = createDb(async (sql) => {
      if (sql.includes('SET is_read =')) {
        return { rows: [{ id: 'email-1', is_read: false }] };
      }
      if (sql.includes('SET flagged =')) {
        return { rows: [{ id: 'email-1', flagged: true }] };
      }
      if (sql.includes('SET folder =')) {
        return { rows: [{ id: 'email-1', folder: 'archive' }] };
      }
      if (sql.includes('FROM tenant_vutler.agents')) {
        return { rows: [{ id: 'agent-1', name: 'Nora' }] };
      }
      if (sql.includes('SET agent_id =')) {
        return { rows: [{ id: 'email-1', agent_id: 'agent-1' }] };
      }
      return { rows: [] };
    });

    await updateEmailReadState(db, 'ws-1', 'email-1', false);
    await toggleEmailFlag(db, 'ws-1', 'email-1');
    await moveEmailToFolder(db, 'ws-1', 'email-1', 'archive');
    const assignment = await assignEmailToAgent(db, 'ws-1', 'email-1', 'agent-1');

    expect(db.query.mock.calls[0][0]).toContain('workspace_id = $3');
    expect(db.query.mock.calls[1][0]).toContain('workspace_id = $2');
    expect(db.query.mock.calls[2][0]).toContain('workspace_id = $3');
    expect(db.query.mock.calls[4][0]).toContain('workspace_id = $3');
    expect(assignment).toMatchObject({
      emailId: 'email-1',
      agentId: 'agent-1',
      agentName: 'Nora',
    });
  });

  test('accepts inbound managed fallback email on agents plans', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    const db = createDb(async (sql) => {
      if (sql.includes('FROM tenant_vutler.email_routes')) {
        return {
          rows: [{
            agent_id: 'agent-1',
            auto_reply: false,
            approval_required: true,
            workspace_id: 'ws-agents',
          }],
        };
      }
      if (sql.includes('SELECT 1') && sql.includes('FROM tenant_vutler.workspace_domains')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO tenant_vutler.emails')) {
        return { rows: [{ id: 'email-1' }] };
      }
      if (sql.includes('FROM tenant_vutler.email_groups')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await processInboundEmail({
      db,
      payload: {
        rcpt_to: 'agent@acme.vutler.ai',
        mail_from: 'sender@example.com',
        subject: 'Hello',
        plain_body: 'Hi there',
      },
      logger: { warn: jest.fn() },
    });

    expect(result).toMatchObject({
      accepted: true,
      kind: 'route',
      workspaceId: 'ws-agents',
      agentId: 'agent-1',
      emailId: 'email-1',
    });
  });

  test('blocks inbound custom-domain mail when the plan does not allow custom domains', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    const db = createDb(async (sql) => {
      if (sql.includes('FROM tenant_vutler.email_routes')) {
        return {
          rows: [{
            agent_id: 'agent-1',
            auto_reply: false,
            approval_required: true,
            workspace_id: 'ws-agents',
          }],
        };
      }
      if (sql.includes('SELECT 1') && sql.includes('FROM tenant_vutler.workspace_domains')) {
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    });

    const result = await processInboundEmail({
      db,
      payload: {
        rcpt_to: 'agent@acme.com',
        mail_from: 'sender@example.com',
        subject: 'Hello',
        plain_body: 'Hi there',
      },
      logger: { warn: jest.fn() },
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'custom_domain_blocked',
      workspaceId: 'ws-agents',
    });
  });

  test('blocks inbound mail entirely when the workspace plan does not allow managed email', async () => {
    getWorkspacePlanId.mockResolvedValue('free');
    const db = createDb(async (sql) => {
      if (sql.includes('FROM tenant_vutler.email_routes')) {
        return {
          rows: [{
            agent_id: 'agent-1',
            auto_reply: false,
            approval_required: true,
            workspace_id: 'ws-free',
          }],
        };
      }
      return { rows: [] };
    });

    const result = await processInboundEmail({
      db,
      payload: {
        rcpt_to: 'agent@workspace.vutler.ai',
        mail_from: 'sender@example.com',
        subject: 'Hello',
      },
      logger: { warn: jest.fn() },
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'plan_blocked',
      workspaceId: 'ws-free',
    });
  });
});
