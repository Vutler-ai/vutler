'use strict';

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('additional custom surface workspace hardening', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('marketplace install ignores client-supplied workspace headers', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../seeds/loadTemplates', () => ({
      getAgentTemplates: jest.fn(() => []),
      getAgentSkills: jest.fn(() => ({})),
    }));

    const router = require('../app/custom/api/marketplace');
    const req = {
      headers: { 'x-workspace-id': 'ws-header' },
    };
    const res = createRes();
    const next = jest.fn();

    expect(router._private.workspaceIdOf(req)).toBeNull();
    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('swarm routes reject requests without authenticated workspace context', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(),
    }));

    const router = require('../app/custom/api/swarm');
    const res = createRes();
    const next = jest.fn();

    expect(router._private.workspaceIdOf({ headers: { 'x-workspace-id': 'ws-header' } })).toBeNull();
    router._private.ensureWorkspaceContext({ headers: { 'x-workspace-id': 'ws-header' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('drive helpers ignore spoofed actor and workspace headers', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../app/custom/lib/core-permissions', () => ({
      requireCorePermission: () => (_req, _res, next) => next(),
      DEFAULT_CORE_PERMISSIONS: {},
      ensureUserCorePermissions: jest.fn(),
    }));
    jest.doMock('../app/custom/lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      getBucketName: jest.fn(),
      createBucket: jest.fn(),
      upload: jest.fn(),
      prefixKey: jest.fn((key) => key),
      download: jest.fn(),
      move: jest.fn(),
      remove: jest.fn(),
    }));
    jest.doMock('../services/agentDriveService', () => ({ findAssignedAgentForPath: jest.fn() }));
    jest.doMock('../services/agentDriveNotifications', () => ({ notifyAgentAboutDriveFile: jest.fn() }));

    const router = require('../app/custom/api/drive');
    expect(router._private.workspaceIdOf({ headers: { 'x-workspace-id': 'ws-header' } })).toBeNull();
    expect(router._private.actorIdOf({
      headers: { 'x-user-id': 'spoofed-user' },
      user: { id: 'real-user' },
    })).toBe('real-user');
    expect(router._private.actorNameOf({
      headers: { 'x-user-name': 'Spoofed Name' },
      user: { name: 'Real User' },
    })).toBe('Real User');
  });

  test('legacy drive-s3 routes require authenticated workspace context', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../app/custom/lib/core-permissions', () => ({
      requireCorePermission: () => (_req, _res, next) => next(),
    }));
    jest.doMock('../app/custom/services/s3Driver', () => ({
      getBucketName: jest.fn(),
      ensureBucket: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
    }));

    const router = require('../app/custom/api/drive-s3');
    const res = createRes();
    const next = jest.fn();

    expect(router._private.workspaceIdOf({ headers: { 'x-workspace-id': 'ws-header' } })).toBeNull();
    router._private.ensureWorkspaceContext({ headers: { 'x-workspace-id': 'ws-header' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('tools routes require server-derived workspace context', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));

    const router = require('../app/custom/api/tools');
    const res = createRes();
    const next = jest.fn();

    expect(router._private.workspaceIdOf({ headers: { 'x-workspace-id': 'ws-header' } })).toBeNull();
    router._private.ensureWorkspaceContext({ headers: { 'x-workspace-id': 'ws-header' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
