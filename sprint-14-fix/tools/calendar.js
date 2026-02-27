/**
 * tools/calendar.js [PATCHED]
 * CRUD events
 * 
 * FIXES:
 * - Real schema: id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
 * - Removed: location, status, metadata, updated_at
 * - All table references prefixed with tenant_vutler.
 */

const TOOL_DEFINITIONS = [
  {
    name: 'create_event',
    description: 'Create a new calendar event',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        description: { type: 'string', description: 'Event description (optional)' },
        start_time: { type: 'string', description: 'Start time (ISO 8601 format)' },
        end_time: { type: 'string', description: 'End time (ISO 8601 format, optional)' },
        agent_id: { type: 'string', description: 'Agent ID who owns this event (optional)' },
        event_type: { type: 'string', description: 'Event type (optional, e.g., meeting, reminder, task)' },
        color: { type: 'string', description: 'Display color (optional, hex code)' }
      },
      required: ['title', 'start_time']
    }
  },
  {
    name: 'update_event',
    description: 'Update an existing calendar event',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'UUID of the event to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        start_time: { type: 'string', description: 'New start time (optional)' },
        end_time: { type: 'string', description: 'New end time (optional)' },
        event_type: { type: 'string', description: 'New event type (optional)' },
        color: { type: 'string', description: 'New color (optional)' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'list_events',
    description: 'List calendar events with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Filter events starting after this date (ISO 8601, optional)' },
        end_date: { type: 'string', description: 'Filter events ending before this date (ISO 8601, optional)' },
        agent_id: { type: 'string', description: 'Filter by agent ID (optional)' },
        event_type: { type: 'string', description: 'Filter by event type (optional)' },
        limit: { type: 'number', description: 'Max number of events (default: 20)' }
      },
      required: []
    }
  },
  {
    name: 'get_event',
    description: 'Get details of a specific event',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'UUID of the event' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'UUID of the event to delete' }
      },
      required: ['event_id']
    }
  }
];

class CalendarToolHandler {
  constructor(pgPool) {
    this.pool = pgPool;
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    switch (toolName) {
      case 'create_event':
        return this.createEvent(args);
      case 'update_event':
        return this.updateEvent(args);
      case 'list_events':
        return this.listEvents(args);
      case 'get_event':
        return this.getEvent(args);
      case 'delete_event':
        return this.deleteEvent(args);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  async createEvent(args) {
    try {
      const {
        title,
        description = '',
        start_time,
        end_time = null,
        agent_id = null,
        event_type = 'event',
        color = null
      } = args;

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.events
         (workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at)
         VALUES ('00000000-0000-0000-0000-000000000001', $1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at`,
        [title, description, start_time, end_time, agent_id, event_type, color]
      );

      return {
        success: true,
        event: result.rows[0]
      };
    } catch (error) {
      console.error('[CalendarTool] Create error:', error);
      return { error: error.message };
    }
  }

  async updateEvent(args) {
    try {
      const { event_id, ...updates } = args;
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

      values.push(event_id);

      const result = await this.pool.query(
        `UPDATE tenant_vutler.events
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at`,
        values
      );

      if (result.rowCount === 0) {
        return { error: 'Event not found' };
      }

      return {
        success: true,
        event: result.rows[0]
      };
    } catch (error) {
      console.error('[CalendarTool] Update error:', error);
      return { error: error.message };
    }
  }

  async listEvents(args) {
    try {
      const { start_date, end_date, agent_id, event_type, limit = 20 } = args;
      const conditions = ["workspace_id = '00000000-0000-0000-0000-000000000001'"];
      const values = [];
      let paramIndex = 1;

      if (start_date) {
        conditions.push(`start_time >= $${paramIndex}`);
        values.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        conditions.push(`start_time <= $${paramIndex}`);
        values.push(end_date);
        paramIndex++;
      }

      if (agent_id) {
        conditions.push(`agent_id = $${paramIndex}`);
        values.push(agent_id);
        paramIndex++;
      }

      if (event_type) {
        conditions.push(`event_type = $${paramIndex}`);
        values.push(event_type);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
         FROM tenant_vutler.events
         WHERE ${conditions.join(' AND ')}
         ORDER BY start_time ASC
         LIMIT $${paramIndex}`,
        values
      );

      return {
        success: true,
        events: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('[CalendarTool] List error:', error);
      return { error: error.message };
    }
  }

  async getEvent(args) {
    try {
      const { event_id } = args;

      const result = await this.pool.query(
        `SELECT id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
         FROM tenant_vutler.events
         WHERE id = $1`,
        [event_id]
      );

      if (result.rowCount === 0) {
        return { error: 'Event not found' };
      }

      return {
        success: true,
        event: result.rows[0]
      };
    } catch (error) {
      console.error('[CalendarTool] Get error:', error);
      return { error: error.message };
    }
  }

  async deleteEvent(args) {
    try {
      const { event_id } = args;

      const result = await this.pool.query(
        `DELETE FROM tenant_vutler.events
         WHERE id = $1
         RETURNING id, title`,
        [event_id]
      );

      if (result.rowCount === 0) {
        return { error: 'Event not found' };
      }

      return {
        success: true,
        deleted: result.rows[0]
      };
    } catch (error) {
      console.error('[CalendarTool] Delete error:', error);
      return { error: error.message };
    }
  }
}

module.exports = CalendarToolHandler;
