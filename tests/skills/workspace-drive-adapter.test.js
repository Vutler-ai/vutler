'use strict';

describe('WorkspaceDriveAdapter', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('writes files to the canonical Vutler Drive location when path is omitted', async () => {
    const uploadFile = jest.fn().mockResolvedValue(undefined);

    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../../services/s3Storage', () => ({
      listFiles: jest.fn().mockResolvedValue([]),
      uploadFile,
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
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
    expect(uploadFile).toHaveBeenCalledWith(
      'ws-1',
      'projects/Vutler/Generated/Marketing/social-plan.txt',
      expect.any(Buffer),
      'text/plain; charset=utf-8'
    );
    expect(result.data).toMatchObject({
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
