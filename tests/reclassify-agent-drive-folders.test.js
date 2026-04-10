'use strict';

const {
  buildAgentDriveTargets,
  parseArgs,
  summarizePlanEntry,
} = require('../scripts/reclassify-agent-drive-folders');

describe('reclassify-agent-drive-folders', () => {
  test('parses CLI flags and workspace filters', () => {
    expect(parseArgs(['--dry-run', '--verbose', '--workspace-id', 'ws-1', '--workspace-slug', 'starbox']))
      .toEqual({
        dryRun: true,
        verbose: true,
        workspaceId: 'ws-1',
        workspaceSlug: 'starbox',
      });
  });

  test('builds flat legacy roots from the canonical workspace root', () => {
    expect(buildAgentDriveTargets({
      workspaceRoot: '/projects/Vutler',
      agent: {
        id: 'agent-123',
        username: 'Max',
      },
    })).toEqual({
      workspaceRoot: '/projects/Vutler',
      flatLegacyIdRoot: '/projects/Vutler/Agents/agent-123',
      flatLegacyReadableRoot: '/projects/Vutler/Agents/max',
    });
  });

  test('summarizes migration entries with agent context', () => {
    const entry = summarizePlanEntry(
      { id: 'agent-1', name: 'Max', username: 'max', type: ['marketing'] },
      { id: 'ws-1', slug: 'starbox' },
      {
        legacyRoots: ['/projects/Vutler/Agents/max'],
        targetRoot: '/projects/Vutler/Agents/Marketing/max',
      }
    );

    expect(entry).toMatchObject({
      action: 'migrate',
      workspaceId: 'ws-1',
      workspaceSlug: 'starbox',
      agentId: 'agent-1',
      agentName: 'Max',
      agentUsername: 'max',
      agentType: ['marketing'],
      from: ['/projects/Vutler/Agents/max'],
      to: '/projects/Vutler/Agents/Marketing/max',
    });
  });
});
