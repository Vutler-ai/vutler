'use strict';

describe('agentDriveService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('provisions deterministic folders for a newly created agent', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      ensureBucket: jest.fn(),
      getBucketName: jest.fn(() => 'vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload: jest.fn(),
    }));

    const {
      ensureAgentDriveProvisioned,
      resolveAgentDriveRoot,
    } = require('../services/agentDriveService');

    const root = await resolveAgentDriveRoot('ws-1', { id: 'agent-7' });
    const result = await ensureAgentDriveProvisioned({ query }, 'ws-1', { id: 'agent-7' }, { uploadedBy: 'user-1' });

    expect(root).toBe('/projects/Vutler/Agents/agent-7');
    expect(result).toMatchObject({
      workspaceRoot: '/projects/Vutler',
      agentsRoot: '/projects/Vutler/Agents',
      agentRoot: '/projects/Vutler/Agents/agent-7',
      chatRoot: '/projects/Vutler/Agents/agent-7/Chat',
    });

    const inserts = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO tenant_vutler.drive_files'));
    expect(inserts).toHaveLength(5);
  });

  test('matches a drive path back to the assigned agent', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.agents')) {
        return {
          rows: [{
            id: 'agent-11',
            name: 'Finance Warden',
            username: 'finance-warden',
            workspace_id: params[0],
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      ensureBucket: jest.fn(),
      getBucketName: jest.fn(() => 'vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload: jest.fn(),
    }));

    const { findAssignedAgentForPath } = require('../services/agentDriveService');
    const match = await findAssignedAgentForPath(
      { query },
      'ws-1',
      '/projects/Vutler/Agents/agent-11/Inbox/frais-avril.xlsx'
    );

    expect(match).toMatchObject({
      agent: {
        id: 'agent-11',
        username: 'finance-warden',
      },
      agentDriveRoot: '/projects/Vutler/Agents/agent-11',
    });
  });
});
