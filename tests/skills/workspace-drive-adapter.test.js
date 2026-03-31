'use strict';

describe('WorkspaceDriveAdapter', () => {
  let randomUuidSpy;

  beforeEach(() => {
    jest.resetModules();
    randomUuidSpy = jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('file-1');
  });

  afterEach(() => {
    randomUuidSpy.mockRestore();
  });

  test('writes files to the canonical Vutler Drive location when path is omitted', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: poolQuery,
    }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload,
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_write',
      params: {
        action: 'write_text',
        title: 'social-plan',
        content: 'Draft for LinkedIn and X launch messaging.',
      },
    });

    expect(result.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Generated/Marketing/file-1-social-plan.txt',
      expect.any(Buffer),
      'text/plain; charset=utf-8'
    );
    expect(ensureBucket).toHaveBeenCalledWith('vaultbrix-storage');
    expect(result.data).toMatchObject({
      id: 'file-1',
      path: '/projects/Vutler/Generated/Marketing/social-plan.txt',
      placement: {
        root: '/projects/Vutler',
        folder: '/projects/Vutler/Generated/Marketing',
        defaulted: true,
        reason: 'classified:Generated/Marketing',
      },
    });
  });
});
