'use strict';

describe('workspace drive provisioning', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('ensures shared bucket, drive root setting, and folder scaffold', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return {
          rows: [{
            id: 'ws-1',
            slug: 'acme',
            name: 'Acme',
            storage_bucket: null,
          }],
        };
      }
      if (sql.includes('UPDATE tenant_vutler.workspace_settings')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT id') && sql.includes('FROM tenant_vutler.drive_files')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const getBucketName = jest.fn().mockReturnValue('vaultbrix-storage');

    jest.doMock('../app/custom/lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName,
    }));

    const {
      DEFAULT_DRIVE_ROOT,
      DRIVE_FOLDER_SCAFFOLD,
      ensureWorkspaceDriveSetup,
    } = require('../app/custom/services/provisioning');

    const result = await ensureWorkspaceDriveSetup('ws-1');

    expect(result).toEqual({
      workspaceId: 'ws-1',
      slug: 'acme',
      bucketName: 'vaultbrix-storage',
      driveRoot: DEFAULT_DRIVE_ROOT,
    });
    expect(ensureBucket).toHaveBeenCalledWith('vaultbrix-storage');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tenant_vutler.workspaces'),
      ['vaultbrix-storage', 'ws-1']
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.workspace_settings'),
      ['ws-1', 'drive_root', JSON.stringify(DEFAULT_DRIVE_ROOT)]
    );
    const folderInserts = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO tenant_vutler.drive_files'));
    expect(folderInserts).toHaveLength(DRIVE_FOLDER_SCAFFOLD.length);
    expect(DRIVE_FOLDER_SCAFFOLD).toEqual(expect.arrayContaining([
      '/projects/Vutler/Agents',
      '/projects/Vutler/Agents/Marketing',
      '/projects/Vutler/Agents/Sales',
      '/projects/Vutler/Agents/Technical',
      '/projects/Vutler/Generated/Marketing',
    ]));
  });
});
