'use strict';

describe('verificationEngine criteria extraction', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('uses orchestration phase verification hints before auto-accepting', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        overall_pass: true,
        overall_score: 8,
        scores: [
          { criterion: 'Ensure blockers are explicit', score: 8, feedback: 'Good.' },
        ],
        summary: 'Looks good.',
      }),
    });

    jest.doMock('../lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../services/llmRouter', () => ({ chat }));

    const { VerificationEngine } = require('../services/verificationEngine');
    const engine = new VerificationEngine();

    const evaluation = await engine.evaluateTaskOutput({
      id: 'task-criteria-1',
      workspace_id: 'ws-verify-criteria-1',
      title: 'Review phase output',
      description: 'No checklist is embedded here.',
      metadata: {
        orchestration_phase_verification_focus: 'Ensure blockers are explicit and next actions are concrete.',
      },
    }, 'Blocked by missing API token. Next action: request token rotation.');

    expect(evaluation.autoAccepted).toBe(false);
    expect(evaluation.criteria).toEqual([
      { description: 'Ensure blockers are explicit and next actions are concrete.' },
    ]);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  test('records why an output was auto-accepted when no criteria are available', async () => {
    jest.doMock('../lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));

    const { VerificationEngine } = require('../services/verificationEngine');
    const engine = new VerificationEngine();

    const evaluation = await engine.evaluateTaskOutput({
      id: 'task-criteria-2',
      workspace_id: 'ws-verify-criteria-2',
      title: 'Review output',
      description: '',
      metadata: {},
    }, 'Some output');

    expect(evaluation.autoAccepted).toBe(true);
    expect(evaluation.autoAcceptedReason).toBe('no_criteria');
    expect(evaluation.verdict.summary).toContain('Auto-accepted');
  });

  test('records why an output was auto-accepted when verification is unavailable', async () => {
    const chat = jest.fn().mockRejectedValue(new Error('Anthropic timeout'));

    jest.doMock('../lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../services/llmRouter', () => ({ chat }));

    const { VerificationEngine } = require('../services/verificationEngine');
    const engine = new VerificationEngine();

    const evaluation = await engine.evaluateTaskOutput({
      id: 'task-criteria-3',
      workspace_id: 'ws-verify-criteria-3',
      title: 'Review output',
      description: '',
      metadata: {
        acceptance_criteria: ['Confirm the final answer includes rollback steps.'],
      },
    }, 'Rollback steps are listed.');

    expect(evaluation.autoAccepted).toBe(true);
    expect(evaluation.autoAcceptedReason).toBe('verification_unavailable');
    expect(evaluation.verdict.summary).toContain('verification unavailable');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
