/**
 * tools/tasks.js
 * CRUD operations sur la table tasks
 */

const TOOL_DEFINITIONS = [
  {
    name: 'create_task',
    description: 'Create a new task in the system',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        assigned_to: { type: 'string', description: 'Agent ID to assign to (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
        due_date: { type: 'string', description: 'Due date (ISO 8601 format, optional)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'], description: 'Initial status (default: todo)' }
      },
      required: ['title']
    }
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'UUID of the task to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        assigned_to: { type: 'string', description: 'New assignee agent ID (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority (optional)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'], description: 'New status (optional)' },
        due_date: { type: 'string', description: 'New due date (optional)' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'list_tasks',
    description: 'List tasks with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        assigned_to: { type: 'string', description: 'Filter by agent ID (optional)' },
        status: { type: 'string', description: 'Filter by status (optional)' },
        priority: { type: 'string', description: 'Filter by priority (optional)' },
        limit: { type: 'number', description: 'Max number of tasks to return (default: 20)' }
      },
      required: []
    }
  },
  {
    name: 'get_task',
    description: 'Get details of a specific task',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'UUID of the task' }
      },
      required: ['task_id']
    }
  }
];

class TasksToolHandler {
  constructor(pgPool) {
    this.pool = pgPool;
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    switch (toolName) {
      case 'create_task':
        return this.createTask(args);
      case 'update_task':
        return this.updateTask(args);
      case 'list_tasks':
        return this.listTasks(args);
      case 'get_task':
        return this.getTask(args);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  async createTask(args) {
    try {
      const {
        title,
        description = '',
        assigned_to = null,
        priority = 'medium',
        due_date = null,
        status = 'todo'
      } = args;

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.tasks
         (title, description, assigned_to, priority, due_date, status, created_at, updated_at, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id, title, description, assigned_to, priority, due_date, status, created_at`,
        [title, description, assigned_to, priority, due_date, status]
      );

      return {
        success: true,
        task: result.rows[0]
      };
    } catch (error) {
      console.error('[TasksTool] Create error:', error);
      return { error: error.message };
    }
  }

  async updateTask(args) {
    try {
      const { task_id, ...updates } = args;
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
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
      values.push(task_id);

      const result = await this.pool.query(
        `UPDATE tenant_vutler.tasks
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, title, description, assigned_to, priority, due_date, status, updated_at`,
        values
      );

      if (result.rowCount === 0) {
        return { error: 'Task not found' };
      }

      return {
        success: true,
        task: result.rows[0]
      };
    } catch (error) {
      console.error('[TasksTool] Update error:', error);
      return { error: error.message };
    }
  }

  async listTasks(args) {
    try {
      const { assigned_to, status, priority, limit = 20 } = args;
      const conditions = ["workspace_id = '00000000-0000-0000-0000-000000000001'"];
      const values = [];
      let paramIndex = 1;

      if (assigned_to) {
        conditions.push(`assigned_to = $${paramIndex}`);
        values.push(assigned_to);
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
        `SELECT id, title, description, assigned_to, priority, due_date, status, created_at, updated_at
         FROM tenant_vutler.tasks
         WHERE ${conditions.join(' AND ')}
         ORDER BY 
           CASE priority 
             WHEN 'urgent' THEN 1 
             WHEN 'high' THEN 2 
             WHEN 'medium' THEN 3 
             WHEN 'low' THEN 4 
           END,
           due_date ASC NULLS LAST,
           created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

      return {
        success: true,
        tasks: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('[TasksTool] List error:', error);
      return { error: error.message };
    }
  }

  async getTask(args) {
    try {
      const { task_id } = args;

      const result = await this.pool.query(
        `SELECT id, title, description, assigned_to, priority, due_date, status, created_at, updated_at, metadata
         FROM tenant_vutler.tasks
         WHERE id = $1`,
        [task_id]
      );

      if (result.rowCount === 0) {
        return { error: 'Task not found' };
      }

      return {
        success: true,
        task: result.rows[0]
      };
    } catch (error) {
      console.error('[TasksTool] Get error:', error);
      return { error: error.message };
    }
  }
}

module.exports = TasksToolHandler;
