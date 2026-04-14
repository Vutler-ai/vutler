'use strict';

describe('browser operator security', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRunService(lookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])) {
    jest.doMock('dns', () => ({
      promises: { lookup },
    }));
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/fetchWithTimeout', () => ({
      fetchWithTimeout: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/registryService', () => ({
      resolveRunCatalog: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/credentialService', () => ({
      ensureCredentialTable: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/sessionService', () => ({
      ensureSessionTable: jest.fn(),
      getSession: jest.fn(),
      saveSessionState: jest.fn(),
      touchSession: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/credentialResolver', () => ({
      resolveBrowserCredential: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/evidenceService', () => ({
      externalizeEvidence: jest.fn(),
      hydrateEvidenceArtifact: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/mailboxService', () => ({
      waitForAgentEmail: jest.fn(),
      extractMagicLink: jest.fn(),
      extractEmailCode: jest.fn(),
    }));
    jest.doMock('../services/browserOperator/playwrightRuntime', () => ({
      createRuntime: jest.fn(),
      executeStep: jest.fn(),
      collectFinalState: jest.fn(),
      closeRuntime: jest.fn(),
    }));

    return require('../services/browserOperator/runService');
  }

  test('rejects localhost targets', async () => {
    const runService = loadRunService();

    await expect(runService.__private.normalizeBaseUrl('http://localhost:3000/login'))
      .rejects
      .toThrow('target.baseUrl must resolve to a public internet host');
  });

  test('rejects targets that resolve to private addresses', async () => {
    const lookup = jest.fn().mockResolvedValue([{ address: '10.0.0.8', family: 4 }]);
    const runService = loadRunService(lookup);

    await expect(runService.__private.normalizeBaseUrl('https://app.example.test'))
      .rejects
      .toThrow('target.baseUrl must resolve to a public internet host');
  });

  test('rejects credential use on disallowed domains', () => {
    const runService = loadRunService();

    expect(() => runService.__private.assertCredentialUrlAllowed(
      'https://evil.example/login',
      { metadata: { allowedDomains: ['trusted.example'] } }
    )).toThrow('Credential cannot be used for target host: evil.example');
  });
});
