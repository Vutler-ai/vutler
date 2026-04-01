'use strict';

const {
  buildSchemaMutationError,
  guardSchemaMutationQuery,
  isSchemaMutationQuery,
  normalizeQueryText,
  runtimeSchemaMutationsAllowed,
} = require('../lib/runtimeSchemaMutationGuard');

describe('runtimeSchemaMutationGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = originalAllow;
  });

  test('detects DDL statements', () => {
    expect(isSchemaMutationQuery('CREATE TABLE foo (id int)')).toBe(true);
    expect(isSchemaMutationQuery({ text: 'ALTER TABLE foo ADD COLUMN bar text' })).toBe(true);
    expect(isSchemaMutationQuery('SELECT 1')).toBe(false);
  });

  test('blocks DDL in production by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

    expect(runtimeSchemaMutationsAllowed()).toBe(false);
    expect(() => guardSchemaMutationQuery('CREATE TABLE foo (id int)')).toThrow(/Run migrations/i);
  });

  test('allows DDL when override is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = 'true';

    expect(runtimeSchemaMutationsAllowed()).toBe(true);
    expect(() => guardSchemaMutationQuery('ALTER TABLE foo ADD COLUMN bar text')).not.toThrow();
  });

  test('extracts the blocked statement head for errors', () => {
    const error = buildSchemaMutationError({ text: 'CREATE TABLE IF NOT EXISTS foo (id int)' });

    expect(normalizeQueryText({ text: 'SELECT 1' })).toBe('SELECT 1');
    expect(error.code).toBe('DDL_BLOCKED');
    expect(error.message).toMatch(/CREATE TABLE IF NOT EXISTS/);
  });
});
