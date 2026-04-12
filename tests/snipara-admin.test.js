'use strict';

describe('snipara admin payload normalizers', () => {
  test('normalizes shared templates payloads', () => {
    const router = require('../api/sniparaAdmin');
    const result = router.__private.normalizeSharedTemplatesPayload({
      templates: [
        {
          id: 'tpl-1',
          name: 'Security Review',
          slug: 'security-review',
          description: 'Review code for security issues',
          category: 'review',
          collection_name: 'Team Templates',
        },
      ],
      total_count: 1,
      categories: ['review', 'testing'],
    });

    expect(result).toMatchObject({
      supported: true,
      total_count: 1,
      categories: ['review', 'testing'],
      templates: [
        {
          id: 'tpl-1',
          name: 'Security Review',
          slug: 'security-review',
          category: 'review',
          collection_name: 'Team Templates',
        },
      ],
    });
  });

  test('normalizes shared collections payloads', () => {
    const router = require('../api/sniparaAdmin');
    const result = router.__private.normalizeSharedCollectionsPayload({
      count: 1,
      collections: [
        {
          id: 'col-1',
          name: 'Team Coding Standards',
          slug: 'team-coding-standards',
          description: 'Shared coding guidelines',
          scope: 'team',
          access_type: 'team_member',
          _count: {
            documents: 12,
            templates: 5,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      supported: true,
      count: 1,
      collections: [
        {
          id: 'col-1',
          name: 'Team Coding Standards',
          slug: 'team-coding-standards',
          scope: 'team',
          access_type: 'team_member',
          document_count: 12,
          template_count: 5,
        },
      ],
    });
  });

  test('normalizes sync status payloads as healthy when recent', () => {
    const router = require('../api/sniparaAdmin');
    const now = Date.parse('2026-04-12T20:00:00.000Z');
    const result = router.__private.normalizeSyncStatusPayload({
      last_task_sync_at: '2026-04-12T19:55:00.000Z',
      last_task_success_at: '2026-04-12T19:55:00.000Z',
      last_task_result: 'ok',
      last_task_synced: 4,
      last_event_sync_at: '2026-04-12T19:56:00.000Z',
      last_event_success_at: '2026-04-12T19:56:00.000Z',
      last_event_result: 'ok',
      last_event_count: 9,
      task_consecutive_failures: 0,
      event_consecutive_failures: 0,
    }, now);

    expect(result).toMatchObject({
      supported: true,
      degraded: false,
      status: 'healthy',
      last_task_synced: 4,
      last_event_count: 9,
    });
  });

  test('normalizes sync status payloads as failed after repeated failures', () => {
    const router = require('../api/sniparaAdmin');
    const now = Date.parse('2026-04-12T20:00:00.000Z');
    const result = router.__private.normalizeSyncStatusPayload({
      last_task_sync_at: '2026-04-12T19:58:00.000Z',
      last_task_failure_at: '2026-04-12T19:58:00.000Z',
      last_task_result: 'failed',
      last_task_error: 'Snipara MCP timeout',
      task_consecutive_failures: 3,
    }, now);

    expect(result).toMatchObject({
      supported: true,
      degraded: true,
      status: 'failed',
      task_consecutive_failures: 3,
      last_task_error: 'Snipara MCP timeout',
    });
  });

  test('normalizes shared document input and upload history', () => {
    const router = require('../api/sniparaAdmin');
    const input = router.__private.normalizeSharedDocumentInput({
      collection_id: ' col_1 ',
      title: ' Team Standards ',
      content: ' # Title ',
      category: 'guidelines',
      priority: '42',
      tags: 'security, backend , review',
    });
    const uploads = router.__private.normalizeSharedUploadsPayload([
      {
        id: 'up_1',
        collection_id: 'col_1',
        collection_name: 'Team Standards',
        title: 'Error Handling',
        category: 'GUIDELINES',
        priority: 42,
        tags: ['security', 'backend'],
        action: 'created',
        content_length: 1200,
        created_by_email: 'ops@vutler.ai',
        created_at: '2026-04-12T21:00:00.000Z',
      },
    ]);

    expect(input).toMatchObject({
      collection_id: 'col_1',
      title: 'Team Standards',
      content: '# Title',
      category: 'GUIDELINES',
      priority: 42,
      tags: ['security', 'backend', 'review'],
    });
    expect(uploads).toMatchObject({
      count: 1,
      uploads: [
        {
          id: 'up_1',
          collection_id: 'col_1',
          collection_name: 'Team Standards',
          title: 'Error Handling',
          category: 'GUIDELINES',
          priority: 42,
          action: 'created',
          created_by_email: 'ops@vutler.ai',
        },
      ],
    });
  });
});
