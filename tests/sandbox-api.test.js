'use strict';

function getRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('sandbox api', () => {
  let ensureSandboxSchemaMock;
  let executeInSandboxMock;
  let executeBatchMock;
  let getSandboxJobMock;
  let router;

  beforeEach(() => {
    jest.resetModules();

    ensureSandboxSchemaMock = jest.fn().mockResolvedValue(undefined);
    executeInSandboxMock = jest.fn();
    executeBatchMock = jest.fn();
    getSandboxJobMock = jest.fn();

    jest.doMock('../services/sandbox', () => ({
      ensureSandboxSchema: ensureSandboxSchemaMock,
      executeInSandbox: executeInSandboxMock,
      executeBatch: executeBatchMock,
      listSandboxJobs: jest.fn(),
      getSandboxJob: getSandboxJobMock,
    }));

    router = require('../api/sandbox');
  });

  test('POST /execute returns 202 for queued jobs and clamps timeout', async () => {
    executeInSandboxMock.mockResolvedValue({
      id: 'job-1',
      execution_id: 'job-1',
      job_id: 'job-1',
      status: 'pending',
      language: 'python',
    });

    const handler = getRouteHandler(router, 'post', '/execute');
    const req = {
      body: {
        language: 'python',
        code: 'print("hello")',
        timeout_ms: 120_000,
        agent_id: 'agent-1',
        wait_for_completion: false,
      },
      user: { id: 'user-1' },
      userId: 'user-1',
      workspaceId: 'ws-1',
    };
    const res = createResponse();

    await handler(req, res);

    expect(executeInSandboxMock).toHaveBeenCalledWith(
      'python',
      'print("hello")',
      'agent-1',
      60_000,
      {
        workspaceId: 'ws-1',
        source: 'api',
        metadata: {
          requested_by: 'user-1',
          route: 'sandbox.execute',
        },
        waitForCompletion: false,
        throwOnWaitTimeout: false,
      }
    );
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'job-1',
        status: 'pending',
      }),
    });
  });

  test('POST /batch returns 202 when at least one queued job is still pending', async () => {
    executeBatchMock.mockResolvedValue([
      {
        id: 'job-1',
        job_id: 'job-1',
        status: 'completed',
        language: 'python',
      },
      {
        id: 'job-2',
        job_id: 'job-2',
        status: 'pending',
        language: 'python',
      },
    ]);

    const handler = getRouteHandler(router, 'post', '/batch');
    const req = {
      body: {
        scripts: [
          { language: 'python', code: 'print("a")', timeout_ms: 5_000 },
          { language: 'python', code: 'print("b")', timeout_ms: 5_000 },
        ],
        stop_on_error: true,
        agent_id: 'agent-1',
      },
      user: { id: 'user-1' },
      userId: 'user-1',
      workspaceId: 'ws-1',
    };
    const res = createResponse();

    await handler(req, res);

    expect(executeBatchMock).toHaveBeenCalledWith(
      req.body.scripts,
      {
        stopOnError: true,
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        source: 'api',
        metadata: {
          requested_by: 'user-1',
          route: 'sandbox.batch',
        },
        waitForCompletion: true,
      }
    );
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'job-1', status: 'completed' }),
        expect.objectContaining({ id: 'job-2', status: 'pending' }),
      ]),
    });
  });

  test('GET /executions/:id returns 404 when the job is missing', async () => {
    getSandboxJobMock.mockResolvedValue(null);

    const handler = getRouteHandler(router, 'get', '/executions/:id');
    const req = {
      params: { id: 'missing-job' },
      user: { id: 'user-1' },
      userId: 'user-1',
      workspaceId: 'ws-1',
    };
    const res = createResponse();

    await handler(req, res);

    expect(getSandboxJobMock).toHaveBeenCalledWith('missing-job', 'ws-1');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: 'Execution not found',
    });
  });
});
