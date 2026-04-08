'use strict';

describe('agentDriveService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('buildAgentFolderName prefers a stable readable username', () => {
    jest.doMock('../app/custom/services/s3Driver', () => ({}));
    jest.doMock('../services/drivePlacementPolicy', () => ({
      resolveWorkspaceDriveRoot: jest.fn(async () => '/projects/Vutler'),
    }));

    const { buildAgentFolderName } = require('../services/agentDriveService');

    expect(buildAgentFolderName({
      id: '2b0c4779-8fd7-45cb-a39d-7ef797530d19',
      username: 'Max',
      name: 'Max Social',
    })).toBe('max');

    expect(buildAgentFolderName({
      id: '2b0c4779-8fd7-45cb-a39d-7ef797530d19',
      name: 'Max Social Manager',
    })).toBe('max-social-manager');
  });

  test('ensureAgentDriveProvisioned migrates legacy id-based folders to the readable agent folder', async () => {
    const list = jest.fn(async () => ({
      files: [
        { key: 'projects/Vutler/Agents/agent-uuid-123/Generated/post-1.md' },
        { key: 'projects/Vutler/Agents/agent-uuid-123/Chat/thread.txt' },
      ],
    }));
    const move = jest.fn(async () => ({}));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      list,
      move,
      ensureBucket: jest.fn(async () => {}),
      getBucketName: jest.fn(() => 'vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
    }));
    jest.doMock('../services/drivePlacementPolicy', () => ({
      resolveWorkspaceDriveRoot: jest.fn(async () => '/projects/Vutler'),
    }));

    const { ensureAgentDriveProvisioned } = require('../services/agentDriveService');
    const insertedPaths = [];
    const migrated = [];
    const legacyRoot = '/projects/Vutler/Agents/agent-uuid-123';
    const friendlyRoot = '/projects/Vutler/Agents/max';

    const pg = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('SELECT 1') && params[1] === legacyRoot) {
          return { rows: [{}] };
        }
        if (sql.includes('SELECT 1') && params[1] === friendlyRoot) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.workspaces')) {
          return {
            rows: [{
              slug: 'workspace',
              storage_bucket: 'vaultbrix-storage',
            }],
          };
        }
        if (sql.includes('UPDATE tenant_vutler.drive_files')) {
          migrated.push(params);
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
          insertedPaths.push(params[2]);
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const result = await ensureAgentDriveProvisioned(pg, 'ws-1', {
      id: 'agent-uuid-123',
      username: 'max',
      name: 'Max',
    });

    expect(migrated).toHaveLength(1);
    expect(migrated[0][1]).toBe(legacyRoot);
    expect(migrated[0][2]).toBe(friendlyRoot);
    expect(result.agentRoot).toBe(friendlyRoot);
    expect(insertedPaths).toContain('/projects/Vutler/Agents');
    expect(insertedPaths).toContain('/projects/Vutler/Agents/max');
    expect(insertedPaths).toContain('/projects/Vutler/Agents/max/Generated');
    expect(insertedPaths).not.toContain('/projects/Vutler/Agents/agent-uuid-123');
    expect(move).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Agents/agent-uuid-123/Generated/post-1.md',
      'projects/Vutler/Agents/max/Generated/post-1.md'
    );
    expect(move).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Agents/agent-uuid-123/Chat/thread.txt',
      'projects/Vutler/Agents/max/Chat/thread.txt'
    );
  });

  test('findAssignedAgentForPath resolves both readable and legacy folder segments', async () => {
    jest.doMock('../app/custom/services/s3Driver', () => ({}));
    jest.doMock('../services/drivePlacementPolicy', () => ({
      resolveWorkspaceDriveRoot: jest.fn(async () => '/projects/Vutler'),
    }));

    const { findAssignedAgentForPath } = require('../services/agentDriveService');
    const pg = {
      query: jest.fn(async () => ({
        rows: [{
          id: 'agent-uuid-123',
          username: 'max',
          name: 'Max',
          workspace_id: 'ws-1',
        }],
      })),
    };

    const friendly = await findAssignedAgentForPath(pg, 'ws-1', '/projects/Vutler/Agents/max/Generated/post.md');
    const legacy = await findAssignedAgentForPath(pg, 'ws-1', '/projects/Vutler/Agents/agent-uuid-123/Generated/post.md');

    expect(friendly?.agent?.username).toBe('max');
    expect(friendly?.agentDriveRoot).toBe('/projects/Vutler/Agents/max');
    expect(legacy?.agent?.username).toBe('max');
    expect(legacy?.agentDriveRoot).toBe('/projects/Vutler/Agents/max');
  });
});
