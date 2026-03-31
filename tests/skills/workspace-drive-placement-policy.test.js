'use strict';

describe('workspace drive placement policy', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('normalizes paths under the canonical Vutler Drive root', () => {
    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));

    const { ensureCanonicalRoot, CANONICAL_ROOT } = require('../../services/drivePlacementPolicy');

    expect(CANONICAL_ROOT).toBe('/projects/Vutler');
    expect(ensureCanonicalRoot('/projects/Vutler/Generated/Marketing/launch.md')).toBe('/projects/Vutler/Generated/Marketing/launch.md');
    expect(ensureCanonicalRoot('/Workspace/projects/Vutler/Generated/Ops/runbook.md')).toBe('/projects/Vutler/Generated/Ops/runbook.md');
    expect(ensureCanonicalRoot('weekly-notes.md')).toBe('/projects/Vutler/weekly-notes.md');
  });

  test('uses a workspace-specific drive root override when configured', async () => {
    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({
        rows: [{ key: 'drive_root', value: { value: '/projects/Client-A' } }],
      }),
    }));

    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    await expect(
      resolveWorkspaceDriveWritePath({
        workspaceId: 'ws-override',
        skillKey: 'workspace_drive_write',
        params: {
          title: 'launch-brief',
          content: 'Marketing launch brief for the client workspace.',
        },
      })
    ).resolves.toMatchObject({
      path: '/projects/Client-A/Generated/Marketing/launch-brief.txt',
      defaulted: true,
      folder: '/projects/Client-A/Generated/Marketing',
      reason: 'classified:Generated/Marketing',
    });
  });

  test('classifies marketing content into Generated/Marketing', async () => {
    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));

    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    await expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'social-plan',
          content: 'Draft for LinkedIn and X launch messaging.',
        },
      })
    ).resolves.toMatchObject({
      path: '/projects/Vutler/Generated/Marketing/social-plan.txt',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Marketing',
      reason: 'classified:Generated/Marketing',
    });
  });

  test('classifies meeting content into Generated/Meetings', async () => {
    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));

    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    await expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'weekly-notes.md',
          content: '# Agenda\n- status\n- blockers',
        },
      })
    ).resolves.toMatchObject({
      path: '/projects/Vutler/Generated/Meetings/weekly-notes.md',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Meetings',
      reason: 'classified:Generated/Meetings',
    });
  });

  test('falls back to Generated/Docs when no category is detected', async () => {
    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));

    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    await expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'alpha note',
          content: 'Plain text overview without a strong category signal.',
        },
      })
    ).resolves.toMatchObject({
      path: '/projects/Vutler/Generated/Docs/alpha note.txt',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Docs',
      reason: 'classified:Generated/Docs',
    });
  });
});
