'use strict';

describe('agentSchemaService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = originalAllow;
  });

  test('bootstraps the agent configuration schema once when columns are missing', async () => {
    const query = jest.fn().mockImplementation(async (sql) => {
      if (/information_schema\.columns/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureAgentConfigurationSchema } = require('../services/agentSchemaService');

    await ensureAgentConfigurationSchema();
    const firstPassCount = query.mock.calls.length;
    await ensureAgentConfigurationSchema();

    expect(firstPassCount).toBeGreaterThan(0);
    expect(query).toHaveBeenCalledTimes(firstPassCount);
    expect(query.mock.calls.some(([sql]) => /information_schema\.columns/i.test(sql))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /ADD COLUMN IF NOT EXISTS config/i.test(sql))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /ADD COLUMN IF NOT EXISTS capabilities/i.test(sql))).toBe(true);
  });

  test('skips ALTER TABLE when the agent schema is already current', async () => {
    const existingColumns = [
      'email',
      'avatar',
      'description',
      'role',
      'mbti',
      'model',
      'provider',
      'system_prompt',
      'temperature',
      'max_tokens',
      'capabilities',
      'config',
    ].map((column_name) => ({ column_name }));
    const query = jest.fn().mockImplementation(async (sql) => {
      if (/information_schema\.columns/i.test(sql)) {
        return { rows: existingColumns };
      }
      return { rows: [] };
    });
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureAgentConfigurationSchema } = require('../services/agentSchemaService');

    await ensureAgentConfigurationSchema();

    expect(query.mock.calls.some(([sql]) => /ADD COLUMN IF NOT EXISTS/i.test(sql))).toBe(false);
  });

  test('returns a clear error when ALTER TABLE permissions are missing', async () => {
    const error = Object.assign(new Error('permission denied for table agents'), { code: '42501' });
    const query = jest.fn().mockRejectedValue(error);
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureAgentConfigurationSchema } = require('../services/agentSchemaService');

    await expect(ensureAgentConfigurationSchema()).rejects.toThrow(
      /Run scripts\/migrations\/20260402_agent_configuration_model\.sql/
    );
  });

  test('verifies schema without DDL in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

    const query = jest.fn().mockImplementation(async (sql) => {
      if (/information_schema\.columns/i.test(sql)) {
        return {
          rows: [
            'email',
            'avatar',
            'description',
            'role',
            'mbti',
            'model',
            'provider',
            'system_prompt',
            'temperature',
            'max_tokens',
            'capabilities',
            'config',
          ].map((column_name) => ({ column_name })),
        };
      }

      if (/information_schema\.tables/i.test(sql)) {
        return { rows: [{ '?column?': 1 }] };
      }

      return { rows: [] };
    });
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { ensureAgentConfigurationSchema } = require('../services/agentSchemaService');

    await ensureAgentConfigurationSchema();

    expect(query.mock.calls.some(([sql]) => /ADD COLUMN IF NOT EXISTS/i.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => /CREATE TABLE IF NOT EXISTS/i.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => /information_schema\.tables/i.test(sql))).toBe(true);
  });
});
