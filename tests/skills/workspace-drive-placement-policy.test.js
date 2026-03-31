'use strict';

describe('workspace drive placement policy', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('normalizes paths under the canonical Vutler Drive root', () => {
    const { ensureCanonicalRoot, CANONICAL_ROOT } = require('../../services/drivePlacementPolicy');

    expect(CANONICAL_ROOT).toBe('/projects/Vutler');
    expect(ensureCanonicalRoot('/projects/Vutler/Generated/Marketing/launch.md')).toBe('/projects/Vutler/Generated/Marketing/launch.md');
    expect(ensureCanonicalRoot('/Workspace/projects/Vutler/Generated/Ops/runbook.md')).toBe('/projects/Vutler/Generated/Ops/runbook.md');
    expect(ensureCanonicalRoot('weekly-notes.md')).toBe('/projects/Vutler/weekly-notes.md');
  });

  test('classifies marketing content into Generated/Marketing', () => {
    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'social-plan',
          content: 'Draft for LinkedIn and X launch messaging.',
        },
      })
    ).toMatchObject({
      path: '/projects/Vutler/Generated/Marketing/social-plan.txt',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Marketing',
      reason: 'classified:Generated/Marketing',
    });
  });

  test('classifies meeting content into Generated/Meetings', () => {
    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'weekly-notes.md',
          content: '# Agenda\n- status\n- blockers',
        },
      })
    ).toMatchObject({
      path: '/projects/Vutler/Generated/Meetings/weekly-notes.md',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Meetings',
      reason: 'classified:Generated/Meetings',
    });
  });

  test('falls back to Generated/Docs when no category is detected', () => {
    const { resolveWorkspaceDriveWritePath } = require('../../services/drivePlacementPolicy');

    expect(
      resolveWorkspaceDriveWritePath({
        skillKey: 'workspace_drive_write',
        params: {
          title: 'alpha note',
          content: 'Plain text overview without a strong category signal.',
        },
      })
    ).toMatchObject({
      path: '/projects/Vutler/Generated/Docs/alpha note.txt',
      defaulted: true,
      folder: '/projects/Vutler/Generated/Docs',
      reason: 'classified:Generated/Docs',
    });
  });
});
