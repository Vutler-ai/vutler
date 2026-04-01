'use strict';

const pool = require('../../lib/vaultbrix');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../../lib/schemaReadiness');
const { fetchWithTimeout } = require('../fetchWithTimeout');
const {
  resolveRunCatalog,
} = require('./registryService');
const {
  ensureCredentialTable,
} = require('./credentialService');
const {
  ensureSessionTable,
  getSession,
  saveSessionState,
  touchSession,
} = require('./sessionService');
const {
  resolveBrowserCredential,
} = require('./credentialResolver');
const {
  externalizeEvidence,
  hydrateEvidenceArtifact,
} = require('./evidenceService');
const {
  waitForAgentEmail,
  extractMagicLink,
  extractEmailCode,
} = require('./mailboxService');
const {
  createRuntime,
  executeStep: executePlaywrightStep,
  collectFinalState,
  closeRuntime,
} = require('./playwrightRuntime');

const SCHEMA = 'tenant_vutler';
const SUPPORTED_ACTIONS = new Set([
  'browser.open',
  'browser.click',
  'browser.fill',
  'browser.login',
  'browser.signup',
  'browser.wait_for',
  'browser.assert_status',
  'browser.assert_text',
  'browser.assert_url',
  'browser.extract_title',
  'browser.capture',
  'browser.consume_magic_link',
  'browser.consume_email_code',
  'browser.consume_reset_password',
]);

let ensurePromise = null;
const runningRuns = new Set();

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    requested_by_user_id: row.requested_by_user_id,
    runtime_mode: row.runtime_mode,
    profile_key: row.profile_key,
    profile_version: row.profile_version,
    credentials_ref: row.credentials_ref || null,
    session_mode: row.session_mode || 'ephemeral',
    session_key: row.session_key || null,
    flow_key: row.flow_key,
    flow_version: row.flow_version,
    status: row.status,
    target: row.target || {},
    governance: row.governance || {},
    summary: row.summary || {},
    report_format: row.report_format,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapStep(row) {
  if (!row) return null;
  return {
    id: row.id,
    run_id: row.run_id,
    step_index: row.step_index,
    action_key: row.action_key,
    status: row.status,
    input: row.input || {},
    output: row.output || null,
    error: row.error || null,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}

function mapEvidence(row) {
  if (!row) return null;
  return {
    id: row.id,
    run_id: row.run_id,
    step_id: row.step_id,
    artifact_kind: row.artifact_kind,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    metadata: row.metadata || {},
    inline_text: row.inline_text || null,
    artifact_payload: row.artifact_payload || null,
    created_at: row.created_at,
  };
}

async function ensureRunTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'browser_operator_runs', {
          label: 'Browser operator runs table',
        });
        await assertColumnsExist(
          pool,
          SCHEMA,
          'browser_operator_runs',
          ['credentials_ref', 'session_mode', 'session_key'],
          { label: 'Browser operator runs table' }
        );
        await assertTableExists(pool, SCHEMA, 'browser_operator_run_steps', {
          label: 'Browser operator run steps table',
        });
        await assertTableExists(pool, SCHEMA, 'browser_operator_evidence', {
          label: 'Browser operator evidence table',
        });
      } else {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${SCHEMA}.browser_operator_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL,
            requested_by_user_id UUID NULL,
            runtime_mode TEXT NOT NULL,
            profile_key TEXT NOT NULL,
            profile_version TEXT NULL,
            credentials_ref TEXT NULL,
            session_mode TEXT NOT NULL DEFAULT 'ephemeral',
            session_key TEXT NULL,
            status TEXT NOT NULL,
            target JSONB NOT NULL,
            flow_key TEXT NULL,
            flow_version TEXT NULL,
            governance JSONB NOT NULL DEFAULT '{}'::jsonb,
            summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            report_format TEXT NOT NULL DEFAULT 'full',
            started_at TIMESTAMPTZ NULL,
            completed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS ${SCHEMA}.browser_operator_run_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id UUID NOT NULL REFERENCES ${SCHEMA}.browser_operator_runs(id) ON DELETE CASCADE,
            step_index INTEGER NOT NULL,
            action_key TEXT NOT NULL,
            status TEXT NOT NULL,
            input JSONB NOT NULL DEFAULT '{}'::jsonb,
            output JSONB NULL,
            error JSONB NULL,
            started_at TIMESTAMPTZ NULL,
            completed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS ${SCHEMA}.browser_operator_evidence (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id UUID NOT NULL REFERENCES ${SCHEMA}.browser_operator_runs(id) ON DELETE CASCADE,
            step_id UUID NULL REFERENCES ${SCHEMA}.browser_operator_run_steps(id) ON DELETE SET NULL,
            artifact_kind TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            mime_type TEXT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            inline_text TEXT NULL,
            artifact_payload JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_browser_operator_runs_workspace
            ON ${SCHEMA}.browser_operator_runs (workspace_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_browser_operator_steps_run
            ON ${SCHEMA}.browser_operator_run_steps (run_id, step_index);

          CREATE INDEX IF NOT EXISTS idx_browser_operator_evidence_run
            ON ${SCHEMA}.browser_operator_evidence (run_id, created_at DESC);

          ALTER TABLE ${SCHEMA}.browser_operator_runs
            ADD COLUMN IF NOT EXISTS credentials_ref TEXT NULL;

          ALTER TABLE ${SCHEMA}.browser_operator_runs
            ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'ephemeral';

          ALTER TABLE ${SCHEMA}.browser_operator_runs
            ADD COLUMN IF NOT EXISTS session_key TEXT NULL;
        `);
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
  await ensureCredentialTable();
  await ensureSessionTable();
}

function assertWorkspaceId(workspaceId) {
  if (!workspaceId) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
}

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim();
  if (!value) {
    const error = new Error('target.baseUrl is required');
    error.statusCode = 400;
    throw error;
  }
  const parsed = new URL(value);
  return parsed.toString();
}

function parseHtmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function buildStorageKey(workspaceId, runId, name) {
  return `browser-operator/${workspaceId}/${runId}/${name}`;
}

function toDataUrl(mimeType, base64) {
  return `data:${mimeType};base64,${base64}`;
}

async function createRun(workspaceId, payload = {}, userId = null) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();

  const runtimeMode = String(payload.runtimeMode || 'cloud-browser');
  const profileKey = String(payload.profileKey || '').trim();
  const flowKey = String(payload.flowKey || '').trim();
  const profileVersion = payload.profileVersion || null;
  const flowVersion = payload.flowVersion || null;
  const credentialsRef = payload.credentialsRef || null;
  const sessionMode = payload.sessionMode === 'named' ? 'named' : 'ephemeral';
  const sessionKey = sessionMode === 'named'
    ? String(payload.sessionKey || payload.target?.appKey || profileKey).trim()
    : null;

  if (!profileKey) {
    const error = new Error('profileKey is required');
    error.statusCode = 400;
    throw error;
  }

  if (!flowKey) {
    const error = new Error('flowKey is required');
    error.statusCode = 400;
    throw error;
  }

  const target = {
    appKey: payload.target?.appKey || null,
    baseUrl: normalizeBaseUrl(payload.target?.baseUrl),
    path: payload.target?.path || null,
  };

  await resolveRunCatalog(profileKey, flowKey, profileVersion, flowVersion);

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.browser_operator_runs
       (workspace_id, requested_by_user_id, runtime_mode, profile_key, profile_version, credentials_ref, session_mode, session_key, status, target, flow_key, flow_version, governance, summary, report_format)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9::jsonb, $10, $11, $12::jsonb, '{}'::jsonb, $13)
     RETURNING *`,
    [
      workspaceId,
      userId,
      runtimeMode,
      profileKey,
      profileVersion,
      credentialsRef,
      sessionMode,
      sessionKey,
      JSON.stringify(target),
      flowKey,
      flowVersion,
      JSON.stringify(payload.governance || {}),
      payload.reportFormat || 'full',
    ]
  );

  const run = mapRun(result.rows[0]);
  queueRunExecution(run.id).catch((error) => {
    console.error('[BROWSER_OPERATOR] Queue execution failed:', error.message);
  });
  return run;
}

async function listRuns(workspaceId, limit = 25) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.browser_operator_runs
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, boundedLimit]
  );
  return result.rows.map(mapRun);
}

async function getRun(workspaceId, runId) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.browser_operator_runs
      WHERE workspace_id = $1 AND id = $2
      LIMIT 1`,
    [workspaceId, runId]
  );
  return mapRun(result.rows[0]);
}

async function listRunSteps(workspaceId, runId) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();
  const result = await pool.query(
    `SELECT s.*
       FROM ${SCHEMA}.browser_operator_run_steps s
       JOIN ${SCHEMA}.browser_operator_runs r ON r.id = s.run_id
      WHERE r.workspace_id = $1 AND s.run_id = $2
      ORDER BY s.step_index ASC`,
    [workspaceId, runId]
  );
  return result.rows.map(mapStep);
}

async function listRunEvidence(workspaceId, runId) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();
  const result = await pool.query(
    `SELECT e.*
       FROM ${SCHEMA}.browser_operator_evidence e
       JOIN ${SCHEMA}.browser_operator_runs r ON r.id = e.run_id
      WHERE r.workspace_id = $1 AND e.run_id = $2
      ORDER BY e.created_at ASC`,
    [workspaceId, runId]
  );
  const evidence = result.rows.map(mapEvidence);
  return Promise.all(evidence.map((item) => hydrateEvidenceArtifact(workspaceId, item)));
}

async function getRunReport(workspaceId, runId) {
  const run = await getRun(workspaceId, runId);
  if (!run) return null;
  const evidence = await listRunEvidence(workspaceId, runId);
  const reportArtifact = evidence.find((item) => item.artifact_kind === 'report');
  return reportArtifact?.artifact_payload || run.summary?.report || null;
}

async function cancelRun(workspaceId, runId) {
  assertWorkspaceId(workspaceId);
  await ensureRunTables();
  const result = await pool.query(
    `UPDATE ${SCHEMA}.browser_operator_runs
        SET status = CASE
          WHEN status IN ('queued', 'running') THEN 'cancelled'
          ELSE status
        END,
            completed_at = CASE
              WHEN status IN ('queued', 'running') THEN NOW()
              ELSE completed_at
            END,
            updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    [workspaceId, runId]
  );
  return mapRun(result.rows[0]);
}

async function queueRunExecution(runId) {
  setImmediate(async () => {
    try {
      await executeRun(runId);
    } catch (error) {
      console.error('[BROWSER_OPERATOR] Run execution failed:', runId, error.message);
    }
  });
}

async function updateRunStatus(runId, status, patch = {}) {
  const fields = ['status = $2', 'updated_at = NOW()'];
  const values = [runId, status];
  let index = 3;

  if (Object.prototype.hasOwnProperty.call(patch, 'summary')) {
    fields.push(`summary = $${index}::jsonb`);
    values.push(JSON.stringify(patch.summary || {}));
    index += 1;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'startedAt')) {
    fields.push(`started_at = $${index}`);
    values.push(patch.startedAt);
    index += 1;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'completedAt')) {
    fields.push(`completed_at = $${index}`);
    values.push(patch.completedAt);
    index += 1;
  }

  const query = `
    UPDATE ${SCHEMA}.browser_operator_runs
       SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING *
  `;

  const result = await pool.query(query, values);
  return mapRun(result.rows[0]);
}

async function createStep(runId, stepIndex, step) {
  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.browser_operator_run_steps
       (run_id, step_index, action_key, status, input, started_at)
     VALUES ($1, $2, $3, 'running', $4::jsonb, NOW())
     RETURNING *`,
    [runId, stepIndex, step.action_key, JSON.stringify(step.input || {})]
  );
  return mapStep(result.rows[0]);
}

async function completeStep(stepId, status, output, error) {
  const result = await pool.query(
    `UPDATE ${SCHEMA}.browser_operator_run_steps
        SET status = $2,
            output = $3::jsonb,
            error = $4::jsonb,
            completed_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [stepId, status, JSON.stringify(output || null), JSON.stringify(error || null)]
  );
  return mapStep(result.rows[0]);
}

async function addEvidence(runId, stepId, artifactKind, storageKey, mimeType, metadata, inlineText, artifactPayload) {
  const runResult = await pool.query(
    `SELECT workspace_id FROM ${SCHEMA}.browser_operator_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );
  const workspaceId = runResult.rows[0]?.workspace_id || null;
  const prepared = workspaceId
    ? await externalizeEvidence(
      workspaceId,
      storageKey,
      mimeType,
      { ...(metadata || {}), artifact_kind: artifactKind },
      inlineText,
      artifactPayload
    )
    : { metadata, inlineText, artifactPayload };

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.browser_operator_evidence
       (run_id, step_id, artifact_kind, storage_key, mime_type, metadata, inline_text, artifact_payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
     RETURNING *`,
    [
      runId,
      stepId || null,
      artifactKind,
      storageKey,
      mimeType || null,
      JSON.stringify(prepared.metadata || {}),
      prepared.inlineText || null,
      JSON.stringify(prepared.artifactPayload || null),
    ]
  );
  return mapEvidence(result.rows[0]);
}

async function executeRun(runId) {
  await ensureRunTables();
  if (runningRuns.has(runId)) return;
  runningRuns.add(runId);
  let runtime = null;

  try {
    const runResult = await pool.query(
      `SELECT *
         FROM ${SCHEMA}.browser_operator_runs
        WHERE id = $1
        LIMIT 1`,
      [runId]
    );
    const run = mapRun(runResult.rows[0]);
    if (!run || run.status !== 'queued') return;

    const startedAt = new Date().toISOString();
    await updateRunStatus(run.id, 'running', { startedAt, summary: { phase: 'initializing' } });

    const { profile, flow } = await resolveRunCatalog(run.profile_key, run.flow_key, run.profile_version, run.flow_version);
    const summary = {
      profileKey: profile.key,
      profileVersion: profile.version,
      flowKey: flow.key,
      flowVersion: flow.version,
      runtimeMode: run.runtime_mode,
      runtimeEngine: 'http-probe',
      target: run.target,
      report: null,
      checks: [],
      unsupportedActions: [],
      evidenceCounts: {},
      warnings: [],
    };

    const executionState = {
      baseUrl: run.target.baseUrl,
      currentUrl: null,
      lastHtml: '',
      lastStatus: null,
      lastTitle: null,
    };

    if (run.runtime_mode === 'cloud-browser') {
      try {
        if (run.session_mode === 'named' && run.target?.appKey && run.session_key) {
          const savedSession = await getSession(run.workspace_id, run.target.appKey, run.session_key);
          if (savedSession?.storage_state) {
            run.session_state = savedSession.storage_state;
            summary.warnings.push({
              code: 'NAMED_SESSION_REUSED',
              message: `Reused named session ${run.session_key}`,
            });
            await touchSession(run.workspace_id, run.target.appKey, run.session_key);
          }
        }
        runtime = await createRuntime(run);
        summary.runtimeEngine = 'playwright';
      } catch (error) {
        summary.warnings.push({
          code: 'PLAYWRIGHT_INIT_FAILED',
          message: error.message,
        });
      }
    }

    for (let index = 0; index < flow.definition.steps.length; index += 1) {
      const step = flow.definition.steps[index];
      const stepRecord = await createStep(run.id, index, step);

      if (!SUPPORTED_ACTIONS.has(step.action_key)) {
        summary.unsupportedActions.push(step.action_key);
        await completeStep(stepRecord.id, 'failed', null, {
          code: 'UNSUPPORTED_ACTION',
          message: `Action ${step.action_key} is not available in Chunk 1 runtime`,
        });
        throw new Error(`Unsupported browser action: ${step.action_key}`);
      }

      try {
        const output = runtime
          ? await executePlaywrightSupportedStep(run, step, stepRecord, runtime)
          : await executeSupportedStep(run, step, stepRecord, executionState);
        summary.checks.push({
          stepIndex: index,
          actionKey: step.action_key,
          status: 'passed',
          output,
        });
        await completeStep(stepRecord.id, 'completed', output, null);
      } catch (error) {
        const serializedError = {
          message: error.message,
          code: error.code || 'STEP_FAILED',
        };
        summary.checks.push({
          stepIndex: index,
          actionKey: step.action_key,
          status: 'failed',
          error: serializedError,
        });
        await completeStep(stepRecord.id, 'failed', null, serializedError);
        summary.report = buildReport(summary, 'failed');
        await addEvidence(
          run.id,
          stepRecord.id,
          'report',
          buildStorageKey(run.workspace_id, run.id, 'report.json'),
          'application/json',
          { format: run.report_format, status: 'failed' },
          null,
          summary.report
        );
        await updateRunStatus(run.id, 'failed', {
          completedAt: new Date().toISOString(),
          summary,
        });
        return;
      }

      const freshRun = await getRun(run.workspace_id, run.id);
      if (freshRun?.status === 'cancelled') {
        summary.report = buildReport(summary, 'cancelled');
        await addEvidence(
          run.id,
          null,
          'report',
          buildStorageKey(run.workspace_id, run.id, 'report.json'),
          'application/json',
          { format: run.report_format, status: 'cancelled' },
          null,
          summary.report
        );
        return;
      }
    }

    if (runtime) {
      const finalState = await collectFinalState(runtime);
      if (run.session_mode === 'named' && run.target?.appKey && run.session_key) {
        await saveSessionState(
          run.workspace_id,
          run.target.appKey,
          run.session_key,
          run.runtime_mode,
          finalState.storageState,
          {
            profile_key: run.profile_key,
            flow_key: run.flow_key,
          }
        );
      }
      await addEvidence(
        run.id,
        null,
        'screenshot',
        buildStorageKey(run.workspace_id, run.id, 'final.png'),
        'image/png',
        {
          url: finalState.url,
          title: finalState.title,
          runtime: 'playwright',
          encoding: 'base64',
        },
        null,
        {
          data_url: toDataUrl('image/png', finalState.screenshotBase64),
        }
      );
      await addEvidence(
        run.id,
        null,
        'console_logs',
        buildStorageKey(run.workspace_id, run.id, 'console-logs.json'),
        'application/json',
        {
          entries: finalState.consoleLogs.length,
        },
        null,
        {
          entries: finalState.consoleLogs,
        }
      );
      await addEvidence(
        run.id,
        null,
        'network_summary',
        buildStorageKey(run.workspace_id, run.id, 'network-summary.json'),
        'application/json',
        {
          runtime: 'playwright',
        },
        null,
        finalState.networkSummary
      );
      summary.evidenceCounts = {
        screenshots: 1,
        consoleLogs: finalState.consoleLogs.length,
        networkRequests: finalState.networkSummary.requests,
      };
    }

    summary.report = buildReport(summary, 'completed');
    await addEvidence(
      run.id,
      null,
      'report',
      buildStorageKey(run.workspace_id, run.id, 'report.json'),
      'application/json',
      { format: run.report_format, status: 'completed' },
      null,
      summary.report
    );
    await updateRunStatus(run.id, 'completed', {
      completedAt: new Date().toISOString(),
      summary,
    });
  } finally {
    if (runtime) {
      await closeRuntime(runtime);
    }
    runningRuns.delete(runId);
  }
}

async function executePlaywrightSupportedStep(run, step, stepRecord, runtime) {
  const resolvedStep = await resolvePlaywrightStepInputs(run, step);
  const output = await executePlaywrightStep(run, resolvedStep, runtime);

  if (step.action_key === 'browser.open') {
    const html = runtime.lastHtml || '';
    await addEvidence(
      run.id,
      stepRecord.id,
      'html_snapshot',
      buildStorageKey(run.workspace_id, run.id, `step-${stepRecord.step_index}-page.html`),
      'text/html',
      {
        url: output.url,
        status_code: output.statusCode,
        content_length: Buffer.byteLength(html, 'utf8'),
        runtime: 'playwright',
        truncated: html.length > 50000,
      },
      html.slice(0, 50000),
      null
    );
    const screenshot = await runtime.page.screenshot({ fullPage: true, type: 'png' });
    await addEvidence(
      run.id,
      stepRecord.id,
      'screenshot',
      buildStorageKey(run.workspace_id, run.id, `step-${stepRecord.step_index}.png`),
      'image/png',
      {
        url: output.url,
        title: output.title,
        runtime: 'playwright',
        encoding: 'base64',
      },
      null,
      {
        data_url: toDataUrl('image/png', screenshot.toString('base64')),
      }
    );
  }

  if (step.action_key === 'browser.capture' && output.screenshotBase64) {
    await addEvidence(
      run.id,
      stepRecord.id,
      'screenshot',
      buildStorageKey(run.workspace_id, run.id, `step-${stepRecord.step_index}.png`),
      'image/png',
      {
        url: output.url,
        title: output.title,
        runtime: 'playwright',
        encoding: 'base64',
      },
      null,
      {
        data_url: toDataUrl('image/png', output.screenshotBase64),
      }
    );
    return {
      url: output.url,
      title: output.title,
      captured: true,
    };
  }

  return output;
}

async function resolvePlaywrightStepInputs(run, step) {
  const input = { ...(step.input || {}) };

  if (step.action_key === 'browser.login' || step.action_key === 'browser.signup' || step.action_key === 'browser.consume_reset_password') {
    const credentials = await resolveBrowserCredential(run.workspace_id, {
      credentialRef: input.credentialRef || run.credentials_ref || null,
      credentialKey: input.credentialKey || null,
      credentialId: input.credentialId || null,
    });

    if (!credentials) {
      const error = new Error(`No credentials available for ${step.action_key}`);
      error.code = 'MISSING_CREDENTIALS';
      throw error;
    }

    input.resolvedCredentials = credentials;
  }

  if (step.action_key === 'browser.consume_magic_link' || step.action_key === 'browser.consume_email_code' || step.action_key === 'browser.consume_reset_password') {
    const mailbox = await waitForAgentEmail(run.workspace_id, {
      agentId: input.agentId || run.governance?.agentId || null,
      agentEmail: input.agentEmail || run.governance?.agentEmail || null,
      subjectIncludes: input.subjectIncludes || null,
      bodyIncludes: input.bodyIncludes || null,
      timeoutMs: input.timeoutMs || 15000,
      pollIntervalMs: input.pollIntervalMs || 1000,
    });

    input.resolvedAgentEmail = mailbox.agentEmail;

    if (step.action_key === 'browser.consume_magic_link' || step.action_key === 'browser.consume_reset_password') {
      const allowedHostname = input.allowedLinkHostname || null;
      const magicLinkUrl = extractMagicLink(mailbox.email, allowedHostname);
      if (!magicLinkUrl) {
        const error = new Error('No matching magic link found in agent mailbox');
        error.code = 'MAGIC_LINK_NOT_FOUND';
        throw error;
      }
      if (step.action_key === 'browser.consume_magic_link') {
        input.resolvedMagicLinkUrl = magicLinkUrl;
      } else {
        input.resolvedResetUrl = magicLinkUrl;
      }
    }

    if (step.action_key === 'browser.consume_email_code') {
      const code = extractEmailCode(mailbox.email, input.codePattern || null);
      if (!code) {
        const error = new Error('No matching email code found in agent mailbox');
        error.code = 'EMAIL_CODE_NOT_FOUND';
        throw error;
      }
      input.resolvedEmailCode = code;
    }
  }

  return {
    ...step,
    input,
  };
}

async function executeSupportedStep(run, step, stepRecord, state) {
  if (step.action_key === 'browser.open') {
    const relativePath = String(step.input?.path || run.target.path || '').trim();
    const targetUrl = relativePath
      ? new URL(relativePath, run.target.baseUrl).toString()
      : run.target.baseUrl;
    const response = await fetchWithTimeout(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Vutler Browser Operator Chunk1',
      },
    }, Number(step.input?.timeoutMs) || 15000);
    const html = await response.text();
    const title = parseHtmlTitle(html);
    state.currentUrl = targetUrl;
    state.lastHtml = html;
    state.lastStatus = response.status;
    state.lastTitle = title;

    await addEvidence(
      run.id,
      stepRecord.id,
      'html_snapshot',
      buildStorageKey(run.workspace_id, run.id, `step-${stepRecord.step_index}-page.html`),
      'text/html',
      {
        url: targetUrl,
        status_code: response.status,
        content_length: Buffer.byteLength(html, 'utf8'),
        truncated: html.length > 50000,
      },
      html.slice(0, 50000),
      null
    );

    return {
      url: targetUrl,
      statusCode: response.status,
      title,
      contentLength: Buffer.byteLength(html, 'utf8'),
    };
  }

  if (step.action_key === 'browser.assert_status') {
    const expectedStatus = Number(step.input?.expectedStatus || 200);
    if (state.lastStatus !== expectedStatus) {
      const error = new Error(`Expected status ${expectedStatus} but got ${state.lastStatus}`);
      error.code = 'STATUS_ASSERTION_FAILED';
      throw error;
    }
    return { expectedStatus, actualStatus: state.lastStatus };
  }

  if (step.action_key === 'browser.assert_text') {
    const expectedText = String(step.input?.text || '').trim();
    if (!expectedText) {
      const error = new Error('browser.assert_text requires input.text');
      error.code = 'INVALID_STEP_INPUT';
      throw error;
    }
    const haystack = String(state.lastHtml || '');
    const found = haystack.toLowerCase().includes(expectedText.toLowerCase());
    if (!found) {
      const error = new Error(`Expected text not found: ${expectedText}`);
      error.code = 'TEXT_ASSERTION_FAILED';
      throw error;
    }
    return { text: expectedText, found };
  }

  if (step.action_key === 'browser.extract_title') {
    return { title: state.lastTitle };
  }

  const error = new Error(`Unsupported action: ${step.action_key}`);
  error.code = 'UNSUPPORTED_ACTION';
  throw error;
}

function buildReport(summary, status) {
  const passedChecks = summary.checks.filter((check) => check.status === 'passed').length;
  const failedChecks = summary.checks.filter((check) => check.status === 'failed').length;

  return {
    status,
    profileKey: summary.profileKey,
    flowKey: summary.flowKey,
    runtimeMode: summary.runtimeMode,
    target: summary.target,
    evidenceCounts: summary.evidenceCounts || {},
    totals: {
      steps: summary.checks.length,
      passed: passedChecks,
      failed: failedChecks,
    },
    checks: summary.checks,
    unsupportedActions: summary.unsupportedActions,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  ensureRunTables,
  createRun,
  listRuns,
  getRun,
  listRunSteps,
  listRunEvidence,
  getRunReport,
  cancelRun,
};
