'use strict';

const { EventEmitter } = require('events');

function buildJob(overrides = {}) {
  return {
    id: 'sandbox-job-1',
    workspace_id: 'ws-1',
    agent_id: 'agent-1',
    language: 'python',
    code: 'print("hello")',
    timeout_ms: 5000,
    status: 'pending',
    stdout: null,
    stderr: null,
    exit_code: null,
    duration_ms: null,
    batch_id: null,
    batch_index: null,
    stop_on_error: false,
    source: 'api',
    metadata: {},
    locked_by: null,
    locked_at: null,
    started_at: null,
    finished_at: null,
    error: null,
    attempt_count: 0,
    created_at: new Date('2026-04-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createMemoryDb() {
  const jobs = [];
  const executions = [];

  function nextJobId() {
    return `sandbox-job-${jobs.length + 1}`;
  }

  function findClaimableJobs(limit, workerId) {
    const sorted = [...jobs].sort((left, right) => left.created_at - right.created_at);
    const claimed = [];

    for (const job of sorted) {
      if (claimed.length >= limit) break;
      if (job.status !== 'pending') continue;

      const previousJobs = job.batch_id
        ? jobs.filter((candidate) => candidate.batch_id === job.batch_id && (candidate.batch_index ?? -1) < (job.batch_index ?? -1))
        : [];

      const hasBlockingPrevious = previousJobs.some((candidate) => candidate.status === 'pending' || candidate.status === 'running');
      const hasFailedPrevious = previousJobs.some((candidate) => candidate.status === 'failed' || candidate.status === 'timeout');

      if (!job.batch_id || (!hasBlockingPrevious && !(job.stop_on_error && hasFailedPrevious))) {
        job.status = 'running';
        job.started_at = job.started_at || new Date('2026-04-01T10:00:00.000Z');
        job.locked_at = new Date('2026-04-01T10:00:00.000Z');
        job.locked_by = workerId;
        job.attempt_count = (job.attempt_count || 0) + 1;
        claimed.push(job);
      }
    }

    return claimed;
  }

  return {
    __jobs: jobs,
    __executions: executions,
    query: jest.fn(async (sql, params = []) => {
      if (
        sql.includes('CREATE TABLE IF NOT EXISTS tenant_vutler.sandbox_jobs')
        || sql.includes('CREATE TABLE IF NOT EXISTS tenant_vutler.sandbox_executions')
        || sql.includes('CREATE INDEX IF NOT EXISTS sandbox_jobs_')
        || sql.includes('ALTER TABLE tenant_vutler.sandbox_executions')
      ) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.sandbox_jobs')) {
        const row = buildJob({
          id: nextJobId(),
          workspace_id: params[0],
          agent_id: params[1],
          language: params[2],
          code: params[3],
          timeout_ms: params[4],
          batch_id: params[5],
          batch_index: params[6],
          stop_on_error: params[7],
          source: params[8],
          metadata: params[9] ? JSON.parse(params[9]) : {},
          created_at: new Date(`2026-04-01T10:00:0${jobs.length}.000Z`),
        });
        jobs.push(row);
        return { rows: [row] };
      }

      if (sql.includes('SELECT *') && sql.includes('FROM tenant_vutler.sandbox_jobs') && sql.includes('WHERE id = $1')) {
        const row = jobs.find((job) => job.id === params[0] && (!params[1] || job.workspace_id === params[1]));
        return { rows: row ? [row] : [] };
      }

      if (sql.includes('SELECT *') && sql.includes('FROM tenant_vutler.sandbox_jobs') && sql.includes('WHERE batch_id = $1')) {
        const rows = jobs
          .filter((job) => job.batch_id === params[0] && (!params[1] || job.workspace_id === params[1]))
          .sort((left, right) => (left.batch_index ?? 0) - (right.batch_index ?? 0));
        return { rows };
      }

      if (sql.includes('WITH candidate AS (') && sql.includes('UPDATE tenant_vutler.sandbox_jobs job')) {
        const rows = findClaimableJobs(params[0], params[1]);
        return { rows };
      }

      if (sql.includes("SET status = 'skipped'")) {
        const [batchId, failedIndex] = params;
        const rows = jobs
          .filter((job) => job.batch_id === batchId && (job.batch_index ?? -1) > failedIndex && job.status === 'pending')
          .map((job) => {
            job.status = 'skipped';
            job.finished_at = new Date('2026-04-01T10:00:02.000Z');
            job.duration_ms = 0;
            job.stderr = job.stderr || 'Skipped because an earlier batch step failed.';
            job.error = job.error || 'Skipped because an earlier batch step failed.';
            job.locked_at = null;
            job.locked_by = null;
            return job;
          });
        return { rows };
      }

      if (sql.includes('UPDATE tenant_vutler.sandbox_jobs') && sql.includes('RETURNING *')) {
        const row = jobs.find((job) => job.id === params[0]);
        const match = sql.match(/SET ([\s\S]+?)\s+WHERE/);
        const assignments = match ? match[1].split(',').map((entry) => entry.trim()) : [];

        assignments.forEach((assignment, index) => {
          const column = assignment.split('=')[0].trim();
          row[column] = column === 'metadata' && typeof params[index + 1] === 'string'
            ? JSON.parse(params[index + 1])
            : params[index + 1];
        });

        return { rows: row ? [row] : [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.sandbox_executions')) {
        const row = {
          id: params[0],
          workspace_id: params[1],
          agent_id: params[2],
          language: params[3],
          code: params[4],
          stdout: params[5],
          stderr: params[6],
          exit_code: params[7],
          status: params[8],
          duration_ms: params[9],
          batch_id: params[10],
          batch_index: params[11],
          created_at: params[12],
        };
        const existingIndex = executions.findIndex((execution) => execution.id === row.id);
        if (existingIndex >= 0) executions[existingIndex] = row;
        else executions.push(row);
        return { rows: [row] };
      }

      return { rows: [] };
    }),
  };
}

describe('sandbox service hardening', () => {
  let spawnMock;
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    spawnMock = jest.fn();
    queryMock = jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO tenant_vutler.sandbox_jobs')) {
        return { rows: [buildJob()] };
      }

      if (sql.includes('SELECT *') && sql.includes('FROM tenant_vutler.sandbox_jobs') && sql.includes('WHERE id = $1')) {
        return { rows: [buildJob({ status: 'pending', id: params[0] })] };
      }

      if (sql.includes('UPDATE tenant_vutler.sandbox_jobs') && sql.includes('RETURNING *')) {
        return {
          rows: [buildJob({
            id: params[0],
            status: 'completed',
            stdout: 'hello\n',
            stderr: null,
            exit_code: 0,
            duration_ms: 42,
            finished_at: new Date('2026-04-01T10:00:01.000Z'),
          })],
        };
      }

      return { rows: [] };
    });

    jest.doMock('child_process', () => ({
      spawn: spawnMock,
    }));

    jest.doMock('../lib/vaultbrix', () => ({
      query: queryMock,
    }));
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.SANDBOX_RUNTIME;
    delete process.env.SANDBOX_DOCKER_BINARY;
    delete process.env.SANDBOX_DOCKER_NODE_IMAGE;
    delete process.env.SANDBOX_DOCKER_PYTHON_IMAGE;
  });

  test('defaults to docker runtime in production', () => {
    process.env.NODE_ENV = 'production';

    const sandbox = require('../services/sandbox');
    expect(sandbox.__private.resolveSandboxRuntime()).toBe('docker');
  });

  test('does not bootstrap sandbox schema on import', () => {
    require('../services/sandbox');

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('builds a hardened docker command for javascript execution', () => {
    process.env.SANDBOX_RUNTIME = 'docker';
    process.env.SANDBOX_DOCKER_BINARY = 'docker';
    process.env.SANDBOX_DOCKER_NODE_IMAGE = 'node:test';

    const sandbox = require('../services/sandbox');
    const target = sandbox.__private.buildExecutionTarget('javascript', 'console.log("hi")');

    expect(target.runtime).toBe('docker');
    expect(target.cmd).toBe('docker');
    expect(target.args).toEqual(expect.arrayContaining([
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      'node:test',
      'node',
      '--input-type=commonjs',
      '-e',
      'console.log("hi")',
    ]));
  });

  test('queues a sandbox job and returns the pending record when not waiting', async () => {
    const sandbox = require('../services/sandbox');
    const result = await sandbox.executeInSandbox('python', 'print("hello")', 'agent-1', 5000, {
      workspaceId: 'ws-1',
      waitForCompletion: false,
    });

    expect(result).toMatchObject({
      id: 'sandbox-job-1',
      execution_id: 'sandbox-job-1',
      job_id: 'sandbox-job-1',
      agent_id: 'agent-1',
      language: 'python',
      status: 'pending',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('executes a claimed sandbox job through docker runtime and updates the audit mirror', async () => {
    process.env.SANDBOX_RUNTIME = 'docker';
    process.env.SANDBOX_DOCKER_BINARY = 'docker';
    process.env.SANDBOX_DOCKER_PYTHON_IMAGE = 'python:test';

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn();

      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('hello\n'));
        child.emit('close', 0);
      });

      return child;
    });

    const sandbox = require('../services/sandbox');
    const result = await sandbox.executeSandboxJob(buildJob(), { workerId: 'worker-1' });

    expect(spawnMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining([
        'run',
        '--rm',
        '--network',
        'none',
        'python:test',
        'python3',
        '-c',
        'print("hello")',
      ]),
      expect.objectContaining({
        shell: false,
        cwd: '/tmp',
      })
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.sandbox_executions'),
      expect.any(Array)
    );
    expect(result).toMatchObject({
      id: 'sandbox-job-1',
      execution_id: 'sandbox-job-1',
      status: 'completed',
      stdout: 'hello\n',
      exit_code: 0,
    });
  });

  test('claims only the first runnable step of a queued batch', async () => {
    const sandbox = require('../services/sandbox');
    const db = createMemoryDb();
    const jobs = await sandbox.createSandboxBatchJobs([
      { language: 'python', code: 'print("step-1")', timeout_ms: 5_000 },
      { language: 'python', code: 'print("step-2")', timeout_ms: 5_000 },
      { language: 'python', code: 'print("step-3")', timeout_ms: 5_000 },
    ], {
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      stopOnError: true,
      source: 'api',
    }, db);

    const claimed = await sandbox.claimPendingSandboxJobs({
      workerId: 'worker-1',
      limit: 3,
    }, db);

    expect(jobs).toHaveLength(3);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: jobs[0].id,
      batch_index: 0,
      status: 'running',
      locked_by: 'worker-1',
    });
  });

  test('skips remaining batch jobs after a stop_on_error failure', async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn();

      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('boom\n'));
        child.emit('close', 1);
      });

      return child;
    });

    const sandbox = require('../services/sandbox');
    const db = createMemoryDb();
    const jobs = await sandbox.createSandboxBatchJobs([
      { language: 'python', code: 'print("step-1")', timeout_ms: 5_000 },
      { language: 'python', code: 'print("step-2")', timeout_ms: 5_000 },
      { language: 'python', code: 'print("step-3")', timeout_ms: 5_000 },
    ], {
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      stopOnError: true,
      source: 'api',
    }, db);

    const failed = await sandbox.executeSandboxJob(jobs[0], { workerId: 'worker-1' }, db);
    const batch = await sandbox.listSandboxBatchJobs(jobs[0].batch_id, 'ws-1', db);

    expect(failed).toMatchObject({
      id: jobs[0].id,
      status: 'failed',
      exit_code: 1,
      stderr: 'boom\n',
    });
    expect(batch.map((job) => job.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(batch[1].error).toBe('Skipped because an earlier batch step failed.');
    expect(batch[2].error).toBe('Skipped because an earlier batch step failed.');
  });
});

describe('sandbox analytics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('aggregates backend usage and fallback rates by workspace', async () => {
    const query = jest.fn(async (sql) => {
      if (
        sql.includes('COUNT(*) FILTER (WHERE backend_selected = \'rlm_runtime\')')
        && sql.includes('COUNT(*) FILTER (WHERE used_fallback = TRUE)')
      ) {
        return {
          rows: [{
            total: 12,
            terminal_total: 10,
            running_count: 2,
            rlm_attempt_count: 4,
            rlm_effective_count: 2,
            native_effective_count: 8,
            fallback_count: 2,
            failed_count: 1,
            timeout_count: 0,
            last_fallback_at: '2026-04-12T08:00:00.000Z',
            last_rlm_at: '2026-04-12T09:00:00.000Z',
            last_execution_at: '2026-04-12T10:00:00.000Z',
          }],
        };
      }

      if (sql.includes('SELECT fallback_reason AS reason')) {
        return {
          rows: [
            { reason: 'rlm binary missing', count: 1 },
            { reason: 'runtime timeout', count: 1 },
          ],
        };
      }

      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    const sandbox = require('../services/sandbox');

    const result = await sandbox.querySandboxAnalytics({
      workspaceId: 'ws-1',
      days: 7,
    }, { query });

    expect(result).toMatchObject({
      supported: true,
      status: 'critical',
      days: 7,
      totals: {
        terminal: 10,
        rlm_attempts: 4,
        rlm_effective: 2,
        native_effective: 8,
        fallbacks: 2,
      },
      rates: {
        fallback_rate: 0.5,
      },
      top_fallback_reasons: [
        { reason: 'rlm binary missing', count: 1 },
        { reason: 'runtime timeout', count: 1 },
      ],
    });
  });

  test('emits a deduplicated workspace notification when sandbox health is critical', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('SELECT column_name') && sql.includes('information_schema.columns')) {
        return {
          rows: [
            { column_name: 'workspace_id' },
            { column_name: 'key' },
            { column_name: 'value' },
          ],
        };
      }

      if (sql.includes('SELECT key, value FROM tenant_vutler.workspace_settings')) {
        return {
          rows: [
            {
              key: 'notification_settings',
              value: {
                sandbox_alert: true,
              },
            },
          ],
        };
      }

      if (
        sql.includes('COUNT(*) FILTER (WHERE backend_selected = \'rlm_runtime\')')
        && sql.includes('COUNT(*) FILTER (WHERE used_fallback = TRUE)')
      ) {
        return {
          rows: [{
            total: 8,
            terminal_total: 8,
            running_count: 0,
            rlm_attempt_count: 4,
            rlm_effective_count: 1,
            native_effective_count: 7,
            fallback_count: 3,
            failed_count: 1,
            timeout_count: 0,
            last_fallback_at: '2026-04-12T08:00:00.000Z',
            last_rlm_at: '2026-04-12T09:00:00.000Z',
            last_execution_at: '2026-04-12T10:00:00.000Z',
          }],
        };
      }

      if (sql.includes('SELECT fallback_reason AS reason')) {
        return {
          rows: [
            { reason: 'rlm binary missing', count: 2 },
          ],
        };
      }

      if (sql.includes('CREATE TABLE IF NOT EXISTS tenant_vutler.notifications')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.notifications') && sql.includes('created_at >= NOW()')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.notifications')) {
        return {
          rows: [{
            id: 'notif-1',
            workspace_id: 'ws-1',
            user_id: null,
            type: 'error',
            title: 'Sandbox runtime health is critical',
          }],
        };
      }

      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    const sandbox = require('../services/sandbox');

    const result = await sandbox.__private.emitSandboxHealthNotification('ws-1', { query });

    expect(result).toMatchObject({
      id: 'notif-1',
      workspace_id: 'ws-1',
      type: 'error',
      title: 'Sandbox runtime health is critical',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.notifications'),
      expect.arrayContaining([
        null,
        'ws-1',
        'error',
        'Sandbox runtime health is critical',
      ])
    );
  });

  test('emails the workspace notification address when a new critical alert is created', async () => {
    const sendPostalMail = jest.fn().mockResolvedValue({ success: true, data: { message_id: 'postal-1' } });
    const query = jest.fn(async (sql) => {
      if (sql.includes('SELECT column_name') && sql.includes('information_schema.columns')) {
        return {
          rows: [
            { column_name: 'workspace_id' },
            { column_name: 'key' },
            { column_name: 'value' },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.workspace_settings') && sql.includes('SELECT key, value')) {
        return {
          rows: [
            {
              key: 'notification_settings',
              value: {
                sandbox_alert: true,
              },
            },
            {
              key: 'notification_email',
              value: 'alerts@example.com',
            },
          ],
        };
      }

      if (
        sql.includes('COUNT(*) FILTER (WHERE backend_selected = \'rlm_runtime\')')
        && sql.includes('COUNT(*) FILTER (WHERE used_fallback = TRUE)')
      ) {
        return {
          rows: [{
            total: 8,
            terminal_total: 8,
            running_count: 0,
            rlm_attempt_count: 4,
            rlm_effective_count: 1,
            native_effective_count: 7,
            fallback_count: 3,
            failed_count: 1,
            timeout_count: 0,
            last_fallback_at: '2026-04-12T08:00:00.000Z',
            last_rlm_at: '2026-04-12T09:00:00.000Z',
            last_execution_at: '2026-04-12T10:00:00.000Z',
          }],
        };
      }

      if (sql.includes('SELECT fallback_reason AS reason')) {
        return {
          rows: [
            { reason: 'runtime timeout', count: 2 },
          ],
        };
      }

      if (sql.includes('CREATE TABLE IF NOT EXISTS tenant_vutler.notifications')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.notifications') && sql.includes('created_at >= NOW()')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.notifications')) {
        return {
          rows: [{
            id: 'notif-2',
            workspace_id: 'ws-1',
            user_id: null,
            type: 'error',
            title: 'Sandbox runtime health is critical',
          }],
        };
      }

      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/postalMailer', () => ({ sendPostalMail }));
    const sandbox = require('../services/sandbox');

    await sandbox.__private.emitSandboxHealthNotification('ws-1', { query });

    expect(sendPostalMail).toHaveBeenCalledWith({
      to: 'alerts@example.com',
      subject: 'Sandbox runtime health is critical',
      plain_body: expect.stringContaining('Sandbox telemetry over the last 7 days is critical'),
    });
  });
});
