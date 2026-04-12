'use strict';

const {
  DEFAULT_POLICY,
  normalizeSharedMemoryPolicy,
  canReadSharedMemory,
  canWriteSharedMemory,
} = require('../services/workspaceKnowledgeService');

describe('workspace knowledge shared-memory policy', () => {
  test('normalizes malformed policies to safe defaults', () => {
    expect(normalizeSharedMemoryPolicy(null)).toEqual(DEFAULT_POLICY);
    expect(normalizeSharedMemoryPolicy({
      read_access: 'ADMIN',
      write_access: 'workspace',
    })).toEqual({
      read_access: 'admin',
      write_access: 'workspace',
    });
  });

  test('enforces admin-only read and write access correctly', () => {
    const policy = {
      read_access: 'admin',
      write_access: 'admin',
    };

    expect(canReadSharedMemory(policy, { id: 'u1', role: 'admin' })).toBe(true);
    expect(canWriteSharedMemory(policy, { id: 'u1', role: 'admin' })).toBe(true);
    expect(canReadSharedMemory(policy, { id: 'u2', role: 'user' })).toBe(false);
    expect(canWriteSharedMemory(policy, { id: 'u2', role: 'user' })).toBe(false);
  });

  test('workspace write access still requires an authenticated non-banned member', () => {
    const policy = {
      read_access: 'workspace',
      write_access: 'workspace',
    };

    expect(canReadSharedMemory(policy, { id: 'u1', role: 'user' })).toBe(true);
    expect(canWriteSharedMemory(policy, { id: 'u1', role: 'user' })).toBe(true);
    expect(canReadSharedMemory(policy, {})).toBe(false);
    expect(canWriteSharedMemory(policy, {})).toBe(false);
    expect(canWriteSharedMemory(policy, { id: 'u3', role: 'banned' })).toBe(false);
  });
});
