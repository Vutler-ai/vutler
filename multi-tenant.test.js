/**
 * Multi-tenant isolation tests
 * S8.3 — Verify workspace isolation and quota enforcement
 */

const request = require('supertest');
const { getPool } = require('./lib/postgres');
const { transactionWithWorkspace, queryWithWorkspace } = require('./services/pg');

// Test configuration
const TEST_WORKSPACE_A = 'test_workspace_a';
const TEST_WORKSPACE_B = 'test_workspace_b';
const TEST_RC_TOKEN = 'test_token_123';
const TEST_USER_ID = 'test_user_123';

describe('Multi-tenant Isolation Tests', () => {
  let app;
  let pool;

  beforeAll(async () => {
    // Import the app (assuming it's exported from index.js)
    app = require('../index');
    pool = getPool();
    
    // Clean up test workspaces
    await cleanupTestData();
    
    // Setup test workspaces
    await setupTestWorkspaces();
  });

  afterAll(async () => {
    await cleanupTestData();
    if (pool) {
      await pool.end();
    }
  });

  describe('RLS Workspace Isolation', () => {
    test('Agents are isolated by workspace', async () => {
      // Create agent in workspace A
      const agentA = await transactionWithWorkspace(TEST_WORKSPACE_A, async (client) => {
        const { rows } = await client.query(`
          INSERT INTO agents (id, workspace_id, display_name, status)
          VALUES ($1, $2, $3, $4) RETURNING id, workspace_id
        `, ['agent_a', TEST_WORKSPACE_A, 'Test Agent A', 'active']);
        return rows[0];
      });

      // Create agent in workspace B
      const agentB = await transactionWithWorkspace(TEST_WORKSPACE_B, async (client) => {
        const { rows } = await client.query(`
          INSERT INTO agents (id, workspace_id, display_name, status)
          VALUES ($1, $2, $3, $4) RETURNING id, workspace_id
        `, ['agent_b', TEST_WORKSPACE_B, 'Test Agent B', 'active']);
        return rows[0];
      });

      // Query from workspace A should only see agent A
      const resultsA = await queryWithWorkspace(TEST_WORKSPACE_A, 
        'SELECT id, workspace_id FROM agents WHERE workspace_id = $1', 
        [TEST_WORKSPACE_A]
      );
      
      expect(resultsA.rows).toHaveLength(1);
      expect(resultsA.rows[0].id).toBe('agent_a');
      expect(resultsA.rows[0].workspace_id).toBe(TEST_WORKSPACE_A);

      // Query from workspace B should only see agent B
      const resultsB = await queryWithWorkspace(TEST_WORKSPACE_B,
        'SELECT id, workspace_id FROM agents WHERE workspace_id = $1',
        [TEST_WORKSPACE_B]
      );

      expect(resultsB.rows).toHaveLength(1);
      expect(resultsB.rows[0].id).toBe('agent_b');
      expect(resultsB.rows[0].workspace_id).toBe(TEST_WORKSPACE_B);
    });

    test('Templates are isolated by workspace', async () => {
      // Create template in workspace A
      await transactionWithWorkspace(TEST_WORKSPACE_A, async (client) => {
        await client.query(`
          INSERT INTO templates (name, description, config_json, workspace_id)
          VALUES ($1, $2, $3, $4)
        `, ['Template A', 'Test template A', '{}', TEST_WORKSPACE_A]);
      });

      // Create template in workspace B
      await transactionWithWorkspace(TEST_WORKSPACE_B, async (client) => {
        await client.query(`
          INSERT INTO templates (name, description, config_json, workspace_id)
          VALUES ($1, $2, $3, $4)
        `, ['Template B', 'Test template B', '{}', TEST_WORKSPACE_B]);
      });

      // Query from workspace A should only see template A
      const resultsA = await queryWithWorkspace(TEST_WORKSPACE_A,
        'SELECT name, workspace_id FROM templates WHERE workspace_id = $1',
        [TEST_WORKSPACE_A]
      );

      expect(resultsA.rows).toHaveLength(1);
      expect(resultsA.rows[0].name).toBe('Template A');

      // Query from workspace B should only see template B
      const resultsB = await queryWithWorkspace(TEST_WORKSPACE_B,
        'SELECT name, workspace_id FROM templates WHERE workspace_id = $1',
        [TEST_WORKSPACE_B]
      );

      expect(resultsB.rows).toHaveLength(1);
      expect(resultsB.rows[0].name).toBe('Template B');
    });

    test('Token usage is isolated by workspace', async () => {
      // Add token usage for workspace A
      await transactionWithWorkspace(TEST_WORKSPACE_A, async (client) => {
        await client.query(`
          INSERT INTO token_usage (agent_id, provider, model, input_tokens, output_tokens, cost, workspace_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['agent_a', 'anthropic', 'claude-3', 100, 50, 0.001, TEST_WORKSPACE_A]);
      });

      // Add token usage for workspace B
      await transactionWithWorkspace(TEST_WORKSPACE_B, async (client) => {
        await client.query(`
          INSERT INTO token_usage (agent_id, provider, model, input_tokens, output_tokens, cost, workspace_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['agent_b', 'anthropic', 'claude-3', 200, 100, 0.002, TEST_WORKSPACE_B]);
      });

      // Query from workspace A should only see its usage
      const { getWorkspaceMonthlyTokens } = require('../services/pg');
      const tokensA = await getWorkspaceMonthlyTokens(TEST_WORKSPACE_A);
      const tokensB = await getWorkspaceMonthlyTokens(TEST_WORKSPACE_B);

      expect(tokensA).toBe(150); // 100 + 50
      expect(tokensB).toBe(300); // 200 + 100
    });
  });

  describe('Quota Enforcement', () => {
    test('Agent creation blocked when quota exceeded', async () => {
      // Mock a free plan workspace with 3 agent limit
      await transactionWithWorkspace(TEST_WORKSPACE_A, async (client) => {
        // Create 3 agents (at the limit)
        for (let i = 1; i <= 3; i++) {
          await client.query(`
            INSERT INTO agents (id, workspace_id, display_name, status)
            VALUES ($1, $2, $3, $4)
          `, [`quota_agent_${i}`, TEST_WORKSPACE_A, `Quota Agent ${i}`, 'active']);
        }
      });

      // Set workspace to free plan
      await queryWithWorkspace(TEST_WORKSPACE_A, `
        INSERT INTO workspace_settings (workspace_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value
      `, [TEST_WORKSPACE_A, 'billing_plan', JSON.stringify({ plan: 'free' })]);

      // Try to create 4th agent - should fail
      const { checkWorkspaceLimits } = require('../services/pg');
      const quotaStatus = await checkWorkspaceLimits(TEST_WORKSPACE_A, 'free');

      expect(quotaStatus.usage.agents).toBe(3);
      expect(quotaStatus.limits.maxAgents).toBe(3);
      expect(quotaStatus.allowed.agents).toBe(false);
      expect(quotaStatus.percentages.agents).toBe(100);
    });

    test('Token usage quota enforcement', async () => {
      // Add high token usage to reach limit
      await transactionWithWorkspace(TEST_WORKSPACE_A, async (client) => {
        await client.query(`
          INSERT INTO token_usage (agent_id, provider, model, input_tokens, output_tokens, cost, workspace_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['quota_agent_1', 'anthropic', 'claude-3', 25000, 25000, 0.5, TEST_WORKSPACE_A]);
      });

      const { checkWorkspaceLimits } = require('../services/pg');
      const quotaStatus = await checkWorkspaceLimits(TEST_WORKSPACE_A, 'free');

      expect(quotaStatus.usage.tokens).toBe(50150); // Previous 150 + 50000
      expect(quotaStatus.limits.monthlyTokens).toBe(50000);
      expect(quotaStatus.allowed.tokens).toBe(false);
    });
  });

  describe('Workspace Provisioning', () => {
    test('New workspace creation with defaults', async () => {
      const workspaceData = {
        name: 'Test Company',
        admin_email: 'admin@testcompany.com',
        admin_username: 'testadmin',
        plan: 'starter'
      };

      // Create workspace (simulating provisioning API)
      const { transactionWithWorkspace } = require('../services/pg');
      const workspaceId = 'test_provisioned_ws';

      const result = await transactionWithWorkspace(workspaceId, async (client) => {
        // Create workspace settings
        await client.query(`
          INSERT INTO workspace_settings (workspace_id, key, value)
          VALUES 
            ($1, 'workspace_name', $2),
            ($1, 'billing_plan', $3),
            ($1, 'admin_email', $4)
        `, [
          workspaceId,
          JSON.stringify({ name: workspaceData.name }),
          JSON.stringify({ plan: workspaceData.plan }),
          JSON.stringify({ email: workspaceData.admin_email })
        ]);

        // Create default LLM provider
        const { rows } = await client.query(`
          INSERT INTO workspace_llm_providers (
            workspace_id, provider, auth_type, plan_type, monthly_token_limit, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [workspaceId, 'anthropic', 'api_key', 'managed', 250000, true]);

        return { workspace_id: workspaceId, provider_id: rows[0].id };
      });

      expect(result.workspace_id).toBe(workspaceId);
      expect(result.provider_id).toBeDefined();

      // Verify workspace settings
      const { rows: settingsRows } = await queryWithWorkspace(workspaceId,
        'SELECT key, value FROM workspace_settings WHERE workspace_id = $1',
        [workspaceId]
      );

      const settings = {};
      settingsRows.forEach(row => {
        settings[row.key] = JSON.parse(row.value);
      });

      expect(settings.workspace_name.name).toBe('Test Company');
      expect(settings.billing_plan.plan).toBe('starter');
      expect(settings.admin_email.email).toBe('admin@testcompany.com');

      // Cleanup
      await pool.query('DELETE FROM workspace_llm_providers WHERE workspace_id = $1', [workspaceId]);
      await pool.query('DELETE FROM workspace_settings WHERE workspace_id = $1', [workspaceId]);
    });
  });

  // Helper functions
  async function setupTestWorkspaces() {
    // Create test workspace settings
    await pool.query(`
      INSERT INTO workspace_settings (workspace_id, key, value)
      VALUES 
        ($1, 'billing_plan', $2),
        ($1, 'workspace_name', $3),
        ($4, 'billing_plan', $2),
        ($4, 'workspace_name', $5)
      ON CONFLICT (workspace_id, key) DO NOTHING
    `, [
      TEST_WORKSPACE_A,
      JSON.stringify({ plan: 'free' }),
      JSON.stringify({ name: 'Test Workspace A' }),
      TEST_WORKSPACE_B,
      JSON.stringify({ name: 'Test Workspace B' })
    ]);
  }

  async function cleanupTestData() {
    const testWorkspaces = [TEST_WORKSPACE_A, TEST_WORKSPACE_B, 'test_provisioned_ws'];
    
    for (const wsId of testWorkspaces) {
      // Clean up in dependency order
      await pool.query('DELETE FROM agent_model_assignments WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM token_usage WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM agents WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM templates WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM audit_logs WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM workspace_llm_providers WHERE workspace_id = $1', [wsId]);
      await pool.query('DELETE FROM workspace_settings WHERE workspace_id = $1', [wsId]);
    }
  }
});

// Export for manual testing
module.exports = {
  TEST_WORKSPACE_A,
  TEST_WORKSPACE_B,
  setupTestWorkspaces: async () => {
    const pool = getPool();
    await pool.query(`
      INSERT INTO workspace_settings (workspace_id, key, value)
      VALUES 
        ($1, 'billing_plan', $2),
        ($1, 'workspace_name', $3),
        ($4, 'billing_plan', $2),
        ($4, 'workspace_name', $5)
      ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value
    `, [
      TEST_WORKSPACE_A,
      JSON.stringify({ plan: 'free' }),
      JSON.stringify({ name: 'Test Workspace A' }),
      TEST_WORKSPACE_B,
      JSON.stringify({ name: 'Test Workspace B' })
    ]);
  }
};