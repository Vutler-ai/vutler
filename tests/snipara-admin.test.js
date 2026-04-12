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
});
