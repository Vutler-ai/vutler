'use strict';

describe('apiKeys schema governance', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = originalAllow;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = originalAllow;
  });

  test('verifies workspace_api_keys schema without DDL in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

    const query = jest.fn().mockImplementation(async (sql) => {
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: [{ exists: true }] };
      }

      if (/information_schema\.columns/i.test(sql)) {
        return {
          rows: [
            'workspace_id',
            'created_by_user_id',
            'name',
            'key_prefix',
            'key_hash',
            'created_at',
            'updated_at',
            'last_used_at',
            'revoked_at',
            'role',
          ].map((column_name) => ({ column_name })),
        };
      }

      return { rows: [] };
    });
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureApiKeysTable } = require('../services/apiKeys');

    await ensureApiKeysTable();

    expect(query.mock.calls.some(([sql]) => /CREATE TABLE IF NOT EXISTS/i.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => /ALTER TABLE/i.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => /information_schema\.tables/i.test(sql))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /information_schema\.columns/i.test(sql))).toBe(true);
  });

  test('keeps bootstrap path available outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

    const query = jest.fn().mockResolvedValue({ rows: [] });
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureApiKeysTable } = require('../services/apiKeys');

    await ensureApiKeysTable();

    expect(query.mock.calls.some(([sql]) => /CREATE TABLE IF NOT EXISTS/i.test(sql))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /ALTER TABLE .*workspace_api_keys/i.test(sql))).toBe(true);
  });
});
