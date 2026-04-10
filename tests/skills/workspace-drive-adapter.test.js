'use strict';

describe('WorkspaceDriveAdapter', () => {
  let randomUuidSpy;

  beforeEach(() => {
    jest.resetModules();
    randomUuidSpy = jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('file-1');
  });

  afterEach(() => {
    randomUuidSpy.mockRestore();
  });

  test('writes files to the canonical Vutler Drive location when path is omitted', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: poolQuery,
    }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload,
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => false),
      getOfficeDocumentInfo: jest.fn(() => null),
      buildEditableSourceSuggestion: jest.fn(() => null),
      extractOfficeTextFromBuffer: jest.fn(),
      exportOfficeDocumentFromSource: jest.fn(),
    }));
    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_write',
      params: {
        action: 'write_text',
        title: 'social-plan',
        content: 'Draft for LinkedIn and X launch messaging.',
      },
    });

    expect(result.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Generated/Marketing/file-1-social-plan.txt',
      expect.any(Buffer),
      'text/plain; charset=utf-8'
    );
    expect(ensureBucket).toHaveBeenCalledWith('vaultbrix-storage');
    expect(result.data).toMatchObject({
      id: 'file-1',
      path: '/projects/Vutler/Generated/Marketing/social-plan.txt',
      placement: {
        root: '/projects/Vutler',
        folder: '/projects/Vutler/Generated/Marketing',
        defaulted: true,
        reason: 'classified:Generated/Marketing',
      },
    });
  });

  test('defaults writes into the assigned agent drive folder when agentId is present', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const poolQuery = jest.fn(async (sql) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: poolQuery,
    }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload,
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => false),
      getOfficeDocumentInfo: jest.fn(() => null),
      buildEditableSourceSuggestion: jest.fn(() => null),
      extractOfficeTextFromBuffer: jest.fn(),
      exportOfficeDocumentFromSource: jest.fn(),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      agentId: 'agent-42',
      skillKey: 'workspace_drive_write',
      params: {
        action: 'write_text',
        title: 'social-plan',
        content: 'Draft for LinkedIn and X launch messaging.',
      },
    });

    expect(result.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Agents/General/agent-42/Generated/Marketing/file-1-social-plan.txt',
      expect.any(Buffer),
      'text/plain; charset=utf-8'
    );
    expect(result.data).toMatchObject({
      id: 'file-1',
      path: '/projects/Vutler/Agents/General/agent-42/Generated/Marketing/social-plan.txt',
      placement: {
        root: '/projects/Vutler/Agents/General/agent-42',
        folder: '/projects/Vutler/Agents/General/agent-42/Generated/Marketing',
        defaulted: true,
        reason: 'classified:Generated/Marketing',
      },
    });
  });

  test('reads office files through the office conversion service for agent-friendly text', async () => {
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const download = jest.fn().mockResolvedValue({
      Body: (async function* stream() {
        yield Buffer.from('binary-office-content');
      })(),
    });
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return {
          rows: [{
            id: 'file-doc-1',
            name: 'proposal.doc',
            path: '/projects/Vutler/Inbox/proposal.doc',
            parent_path: '/projects/Vutler/Inbox',
            type: 'file',
            mime_type: 'application/msword',
            size_bytes: 5120,
            s3_key: 'projects/Vutler/Inbox/file-doc-1-proposal.doc',
          }],
        };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload: jest.fn(),
      download,
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => true),
      getOfficeDocumentInfo: jest.fn(() => null),
      buildEditableSourceSuggestion: jest.fn(() => null),
      extractOfficeTextFromBuffer: jest.fn().mockResolvedValue({
        text: 'Converted office text',
        metadata: { strategy: 'libreoffice_html', family: 'word', source_format: 'doc' },
      }),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_read',
      params: {
        action: 'read',
        path: '/projects/Vutler/Inbox/proposal.doc',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'file-doc-1',
      name: 'proposal.doc',
      mimeType: 'text/plain; charset=utf-8',
      sourceMimeType: 'application/msword',
      content: 'Converted office text',
      derived: true,
      derivation: {
        strategy: 'libreoffice_html',
        family: 'word',
        source_format: 'doc',
      },
    });
    expect(download).toHaveBeenCalled();
  });

  test('returns a clear error when office conversion is unavailable', async () => {
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const download = jest.fn().mockResolvedValue({
      Body: (async function* stream() {
        yield Buffer.from('binary-office-content');
      })(),
    });
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return {
          rows: [{
            id: 'file-ppt-1',
            name: 'deck.pptx',
            path: '/projects/Vutler/Inbox/deck.pptx',
            parent_path: '/projects/Vutler/Inbox',
            type: 'file',
            mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            size_bytes: 8192,
            s3_key: 'projects/Vutler/Inbox/file-ppt-1-deck.pptx',
          }],
        };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload: jest.fn(),
      download,
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => true),
      getOfficeDocumentInfo: jest.fn(() => null),
      buildEditableSourceSuggestion: jest.fn(() => null),
      extractOfficeTextFromBuffer: jest.fn().mockRejectedValue(new Error('LibreOffice/soffice is not installed on the server.')),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_read',
      params: {
        action: 'read',
        path: '/projects/Vutler/Inbox/deck.pptx',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be prepared for agent reading');
    expect(result.error).toContain('LibreOffice');
    expect(result.data).toMatchObject({
      id: 'file-ppt-1',
      name: 'deck.pptx',
      office: true,
    });
  });

  test('refuses to write fake native office files through workspace_drive_write', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const poolQuery = jest.fn(async (sql) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

       if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: poolQuery,
    }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload,
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => false),
      getOfficeDocumentInfo: jest.fn(() => ({ family: 'presentation', format: 'pptx', ext: '.pptx' })),
      buildEditableSourceSuggestion: jest.fn(() => '/projects/Vutler/Generated/Sales/deck.source.md'),
      extractOfficeTextFromBuffer: jest.fn(),
      exportOfficeDocumentFromSource: jest.fn(),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_write',
      params: {
        action: 'write_text',
        path: '/projects/Vutler/Generated/Sales/deck.pptx',
        content: '# Slide 1',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Native PPTX generation is not enabled');
    expect(result.data).toMatchObject({
      path: '/projects/Vutler/Generated/Sales/deck.pptx',
      office: true,
      family: 'presentation',
      sourceFormat: 'pptx',
      suggestedSourcePath: '/projects/Vutler/Generated/Sales/deck.source.md',
    });
    expect(upload).not.toHaveBeenCalled();
    expect(ensureBucket).not.toHaveBeenCalled();
  });

  test('exports a native office document from editable source content', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const ensureBucket = jest.fn().mockResolvedValue(undefined);
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.workspaces')) {
        return { rows: [{ slug: 'starbox', storage_bucket: 'vaultbrix-storage' }] };
      }

      if (sql.includes('FROM tenant_vutler.drive_files') && sql.includes('AND path = $2')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.drive_files')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: poolQuery,
    }));
    jest.doMock('../../app/custom/services/s3Driver', () => ({
      ensureBucket,
      getBucketName: jest.fn().mockReturnValue('vaultbrix-storage'),
      prefixKey: jest.fn((key) => key),
      upload,
      download: jest.fn(),
      remove: jest.fn(),
      move: jest.fn(),
    }));
    jest.doMock('../../services/officeDocumentService', () => ({
      isOfficeDocumentPath: jest.fn(() => false),
      getOfficeDocumentInfo: jest.fn(() => ({ family: 'presentation', format: 'pptx', ext: '.pptx' })),
      buildEditableSourceSuggestion: jest.fn(() => '/projects/Vutler/Generated/Sales/deck.source.md'),
      extractOfficeTextFromBuffer: jest.fn(),
      exportOfficeDocumentFromSource: jest.fn().mockResolvedValue({
        buffer: Buffer.from('pptx-binary'),
        metadata: {
          family: 'presentation',
          source_format: 'pptx',
          source_path_suggestion: '/projects/Vutler/Generated/Sales/deck.source.md',
        },
      }),
    }));

    const { WorkspaceDriveAdapter } = require('../../services/skills/adapters/WorkspaceDriveAdapter');
    const adapter = new WorkspaceDriveAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      skillKey: 'workspace_drive_write',
      params: {
        action: 'export_office',
        path: '/projects/Vutler/Generated/Sales/deck.pptx',
        sourceContent: '# Intro\n- Point 1',
        title: 'Deck',
      },
    });

    expect(result.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'vaultbrix-storage',
      'projects/Vutler/Generated/Sales/file-1-deck.pptx',
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(result.data).toMatchObject({
      id: 'file-1',
      path: '/projects/Vutler/Generated/Sales/deck.pptx',
      office: true,
      family: 'presentation',
      sourcePath: '/projects/Vutler/Generated/Sales/deck.source.md',
    });
  });
});
