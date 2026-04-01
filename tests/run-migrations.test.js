'use strict';

const {
  buildMigrationPlan,
  formatError,
  hashContent,
  parseArgs,
  sortMigrationFiles,
} = require('../scripts/run-migrations');

describe('run-migrations', () => {
  test('sorts legacy migrations before dated migrations', () => {
    const ordered = sortMigrationFiles([
      '20260402_agent_configuration_model.sql',
      'social_media.sql',
      '20260329_trial_tokens.sql',
      'agent-email.sql',
      'integrations.sql',
      'email-groups.sql',
    ]);

    expect(ordered).toEqual([
      'integrations.sql',
      'social_media.sql',
      'agent-email.sql',
      'email-groups.sql',
      '20260329_trial_tokens.sql',
      '20260402_agent_configuration_model.sql',
    ]);
  });

  test('builds a plan with applied, pending, and changed migrations', () => {
    const unchangedChecksum = hashContent('SELECT 1;');
    const changedChecksum = hashContent('SELECT 2;');
    const entries = [
      { fileName: 'integrations.sql', checksum: unchangedChecksum },
      { fileName: '20260329_trial_tokens.sql', checksum: changedChecksum },
      { fileName: '20260402_agent_configuration_model.sql', checksum: hashContent('SELECT 3;') },
    ];
    const appliedMigrations = new Map([
      ['integrations.sql', { migration_name: 'integrations.sql', checksum: unchangedChecksum, applied_at: '2026-04-01T10:00:00.000Z', execution_ms: 12 }],
      ['20260329_trial_tokens.sql', { migration_name: '20260329_trial_tokens.sql', checksum: hashContent('SELECT 999;'), applied_at: '2026-04-01T10:01:00.000Z', execution_ms: 8 }],
    ]);

    const plan = buildMigrationPlan(entries, appliedMigrations);

    expect(plan.applied.map((entry) => entry.fileName)).toEqual(['integrations.sql']);
    expect(plan.pending.map((entry) => entry.fileName)).toEqual(['20260402_agent_configuration_model.sql']);
    expect(plan.changed.map((entry) => entry.fileName)).toEqual(['20260329_trial_tokens.sql']);
  });

  test('parses CLI flags', () => {
    expect(parseArgs(['--status', '--verbose'])).toEqual({
      dryRun: false,
      status: true,
      verbose: true,
    });
  });

  test('formats aggregate connection errors clearly', () => {
    const error = {
      message: '',
      code: 'ECONNREFUSED',
      errors: [
        { message: 'connect ECONNREFUSED ::1:5433', code: 'ECONNREFUSED', address: '::1', port: 5433 },
        { message: 'connect ECONNREFUSED 127.0.0.1:5433', code: 'ECONNREFUSED', address: '127.0.0.1', port: 5433 },
      ],
    };

    expect(formatError(error)).toBe(
      'ECONNREFUSED\n'
      + '  - connect ECONNREFUSED ::1:5433 [ECONNREFUSED] (::1:5433)\n'
      + '  - connect ECONNREFUSED 127.0.0.1:5433 [ECONNREFUSED] (127.0.0.1:5433)'
    );
  });
});
