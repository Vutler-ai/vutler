/**
 * tools/goals.js
 * CRUD operations sur la table goals
 */

const TOOL_DEFINITIONS = [
  {
    name: 'create_goal',
    description: 'Create a new goal for an agent',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Goal title' },
        description: { type: 'string', description: 'Goal description' },
        agent_id: { type: 'string', description: 'Agent ID this goal belongs to' },
        target_date: { type: 'string', description: 'Target completion date (ISO 8601, optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Goal priority' },
        status: { type: 'string', enum: ['active', 'paused', 'completed', 'abandoned'], description: 'Initial status (default: active)' }
      },
      required: ['title', 'agent_id']
    }
  },
  {
    name: 'update_goal',
    description: 'Update an existing goal',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: { type: 'string', description: 'UUID of the goal to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        status: { type: 'string', enum: ['active', 'paused', 'completed', 'abandoned'], description: 'New status (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'New priority (optional)' },
        progress: { type: 'number', description: 'Progress percentage 0-100 (optional)' },
        target_date: { type: 'string', description: 'New target date (optional)' }
      },
      required: ['goal_id']
    }
  },
  {
    name: 'list_goals',
    description: 'List goals with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent ID (optional)' },
        status: { type: 'string', description: 'Filter by status (optional)' },
        priority: { type: 'string', description: 'Filter by priority (optional)' },
        limit: { type: 'number', description: 'Max number of goals to return (default: 20)' }
      },
      required: []
    }
  },
  {
    name: 'get_goal',
    description: 'Get details of a specific goal',
    input_schema: {
      type: 'object',
      properties: {
        goal_id: { type: 'string', description: 'UUID of the goal' }
      },
      required: ['goal_id']
    }
  }
];

class GoalsToolHandler {
  constructor(pgPool) {
    this.pool = pgPool;
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    switch (toolName) {
      case 'create_goal':
        return this.createGoal(args);
      case 'update_goal':
        return this.updateGoal(args);
      case 'list_goals':
        return this.listGoals(args);
      case 'get_goal':
        return this.getGoal(args);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  async createGoal(args) {
    try {
      const {
        title,
        description = '',
        agent_id,
        target_date = null,
        priority = 'medium',
        status = 'active'
      } = args;

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.goals
         (title, description, agent_id, target_date, priority, status, progress, created_at, updated_at, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id, title, description, agent_id, target_date, priority, status, progress, created_at`,
        [title, description, agent_id, target_date, priority, status]
      );

      return {
        success: true,
        goal: result.rows[0]
      };
    } catch (error) {
      console.error('[GoalsTool] Create error:', error);
      return { error: error.message };
    }
  }

  async updateGoal(args) {
    try {
      const { goal_id, ...updates } = args;
      const fields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        return { error: 'No fields to update' };
      }

      fields.push(`updated_at = NOW()`);
      values.push(goal_id);

      const result = await this.pool.query(
        `UPDATE tenant_vutler.goals
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, title, description, agent_id, target_date, priority, status, progress, updated_at`,
        values
      );

      if (result.rowCount === 0) {
        return { error: 'Goal not found' };
      }

      return {
        success: true,
        goal: result.rows[0]
      };
    } catch (error) {
      console.error('[GoalsTool] Update error:', error);
      return { error: error.message };
    }
  }

  async listGoals(args) {
    try {
      const { agent_id, status, priority, limit = 20 } = args;
      const conditions = ["workspace_id = '00000000-0000-0000-0000-000000000001'"];
      const values = [];
      let paramIndex = 1;

      if (agent_id) {
        conditions.push(`agent_id = $${paramIndex}`);
        values.push(agent_id);
        paramIndex++;
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (priority) {
        conditions.push(`priority = $${paramIndex}`);
        values.push(priority);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, title, description, agent_id, target_date, priority, status, progress, created_at, updated_at
         FROM tenant_vutler.goals
         WHERE ${conditions.join(' AND ')}
         ORDER BY 
           CASE priority 
             WHEN 'high' THEN 1 
             WHEN 'medium' THEN 2 
             WHEN 'low' THEN 3 
           END,
           target_date ASC NULLS LAST,
           created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

      return {
        success: true,
        goals: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('[GoalsTool] List error:', error);
      return { error: error.message };
    }
  }

  async getGoal(args) {
    try {
      const { goal_id } = args;

      const result = await this.pool.query(
        `SELECT id, title, description, agent_id, target_date, priority, status, progress, created_at, updated_at, metadata
         FROM tenant_vutler.goals
         WHERE id = $1`,
        [goal_id]
      );

      if (result.rowCount === 0) {
        return { error: 'Goal not found' };
      }

      return {
        success: true,
        goal: result.rows[0]
      };
    } catch (error) {
      console.error('[GoalsTool] Get error:', error);
      return { error: error.message };
    }
  }
}

module.exports = GoalsToolHandler;
