'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function requestJson(server, method, requestPath, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: requestPath,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: data ? JSON.parse(data) : null,
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

describe('nexus consent model', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('permission engine persists consent by source app and action', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-consent-'));

    try {
      jest.doMock('os', () => ({
        ...jest.requireActual('os'),
        homedir: () => tempHome,
      }));

      const { PermissionEngine } = require('../packages/nexus/lib/permission-engine');
      const engine = new PermissionEngine();
      const documentsPath = path.join(tempHome, 'Documents');
      const desktopPath = path.join(tempHome, 'Desktop');

      engine.replace({
        filesystem: true,
        mail: true,
        shell: false,
        allowedFolders: [documentsPath],
        consent: {
          sources: {
            filesystem: {
              enabled: true,
              apps: ['finder'],
              actions: ['search', 'read_document'],
              allowedFolders: [documentsPath],
            },
            mail: {
              enabled: true,
              apps: ['apple_mail'],
              actions: ['list_emails', 'send_email_on_behalf'],
            },
          },
        },
      });

      engine.grant(desktopPath);
      const permissions = engine.getPermissions();

      expect(permissions.allowedFolders).toEqual([
        path.resolve(documentsPath),
        path.resolve(desktopPath),
      ]);
      expect(permissions.allowedActions).toEqual(expect.arrayContaining([
        'search',
        'read_document',
        'list_emails',
        'send_email_on_behalf',
      ]));
      expect(permissions.consent.sources.filesystem).toEqual(expect.objectContaining({
        enabled: true,
        apps: ['finder'],
        actions: ['search', 'read_document'],
        allowedFolders: [
          path.resolve(documentsPath),
          path.resolve(desktopPath),
        ],
      }));
      expect(permissions.consent.sources.mail).toEqual(expect.objectContaining({
        enabled: true,
        apps: ['apple_mail'],
        actions: ['list_emails', 'send_email_on_behalf'],
      }));
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('api nexus derives node consent state from stored permissions', () => {
    jest.doMock('../lib/auth', () => ({
      requireApiKey: jest.fn((_req, _res, next) => next && next()),
    }));
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../lib/avatarPath', () => ({
      normalizeStoredAvatar: jest.fn(() => null),
      buildSpriteAvatar: jest.fn(() => null),
    }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/apiKeys', () => ({
      createApiKey: jest.fn(),
      listApiKeys: jest.fn(),
      revokeApiKey: jest.fn(),
      resolveApiKey: jest.fn(),
      ensureApiKeysTable: jest.fn(),
    }));
    jest.doMock('../services/nexusBilling', () => ({
      getNodeMode: jest.fn(),
      getWorkspaceNexusBillingSummary: jest.fn(),
      getWorkspaceNexusUsage: jest.fn(),
    }));
    jest.doMock('../services/nexusEnterpriseGovernance', () => ({
      ensureGovernanceTables: jest.fn(),
      createApprovalRequest: jest.fn(),
      listApprovalRequests: jest.fn(),
      getApprovalRequest: jest.fn(),
      resolveApprovalRequest: jest.fn(),
      markApprovalExecution: jest.fn(),
      findActiveApprovalScope: jest.fn(),
      revokeApprovalScope: jest.fn(),
      createAuditEvent: jest.fn(),
      listAuditEvents: jest.fn(),
    }));
    jest.doMock('../services/postalMailer', () => ({
      sendPostalMail: jest.fn(),
    }));

    const router = require('../api/nexus');
    const permissions = {
      allowedFolders: ['/Users/test/Documents'],
      consent: {
        sources: {
          filesystem: {
            enabled: true,
            apps: ['finder'],
            actions: ['search', 'read_document'],
            allowedFolders: ['/Users/test/Documents'],
          },
          mail: {
            enabled: true,
            apps: ['apple_mail'],
            actions: ['list_emails', 'send_email_on_behalf'],
          },
          clipboard: {
            enabled: false,
            apps: [],
            actions: [],
          },
        },
      },
    };

    const consentState = router._private.buildNodeConsentState(permissions);

    expect(consentState).toEqual(expect.objectContaining({
      summary: {
        enabledSources: 2,
        enabledApps: 2,
        enabledActions: 4,
      },
    }));
    expect(router._private.getNodeConsentState({
      config: { permissions },
    })).toEqual(expect.objectContaining({
      sources: expect.objectContaining({
        filesystem: expect.objectContaining({
          enabled: true,
          apps: ['finder'],
          actions: ['search', 'read_document'],
          allowedFolders: ['/Users/test/Documents'],
        }),
      }),
    }));
  });

  test('dashboard server accepts structured consent updates and syncs them to cloud', async () => {
    let currentPermissions = {
      allowedFolders: [],
      allowedActions: [],
      consent: { sources: {} },
    };
    const replace = jest.fn((nextPermissions) => {
      currentPermissions = nextPermissions;
    });
    const grant = jest.fn();
    const revoke = jest.fn();

    jest.doMock('../packages/nexus/lib/permission-engine', () => ({
      getPermissionEngine: jest.fn(() => ({
        getPermissions: () => currentPermissions,
        replace,
        grant,
        revoke,
      })),
    }));

    const { createDashboardServer } = require('../packages/nexus/dashboard/server');
    const apiCall = jest.fn().mockResolvedValue({ success: true });
    const node = {
      port: 3100,
      nodeId: 'node-1',
      key: 'nexus-key',
      permissions: currentPermissions,
      _apiCall: apiCall,
      agentManager: {
        getStatus: () => [],
      },
      agents: [],
    };

    const server = createDashboardServer(node);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const response = await requestJson(server, 'POST', '/api/permissions/model', {
        permissions: {
          allowedFolders: ['/Users/test/Documents'],
          allowedActions: ['search', 'list_emails'],
          consent: {
            sources: {
              filesystem: {
                enabled: true,
                apps: ['finder'],
                actions: ['search'],
                allowedFolders: ['/Users/test/Documents'],
              },
              mail: {
                enabled: true,
                apps: ['apple_mail'],
                actions: ['list_emails'],
              },
            },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(replace).toHaveBeenCalledWith(expect.objectContaining({
        consent: expect.objectContaining({
          sources: expect.objectContaining({
            filesystem: expect.objectContaining({
              enabled: true,
              apps: ['finder'],
              actions: ['search'],
            }),
          }),
        }),
      }));
      expect(apiCall).toHaveBeenCalledWith(
        'POST',
        '/api/v1/nexus/node-1/connect',
        expect.objectContaining({
          permissions: expect.objectContaining({
            consent: expect.objectContaining({
              sources: expect.objectContaining({
                mail: expect.objectContaining({
                  enabled: true,
                  apps: ['apple_mail'],
                  actions: ['list_emails'],
                }),
              }),
            }),
          }),
        })
      );
      expect(response.body.permissions.consent.sources.filesystem).toEqual(expect.objectContaining({
        enabled: true,
        apps: ['finder'],
        actions: ['search'],
      }));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
