/**
 * tools/calendar.js
 * CRUD events
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
        location: { type: 'string', description: 'Event location (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses of attendees (optional)' },
        all_day: { type: 'boolean', description: 'Is this an all-day event? (default: false)' }
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
        location: { type: 'string', description: 'New location (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'New attendees list (optional)' },
        status: { type: 'string', enum: ['confirmed', 'tentative', 'cancelled'], description: 'Event status (optional)' }
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
        status: { type: 'string', description: 'Filter by status (optional)' },
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
        location = null,
        attendees = [],
        all_day = false
      } = args;

      const metadata = { attendees, all_day };

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.events
         (title, description, start_time, end_time, location, status, metadata, created_at, updated_at, workspace_id)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id, title, description, start_time, end_time, location, status, metadata, created_at`,
        [title, description, start_time, end_time, location, JSON.stringify(metadata)]
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

      // Handle special case for attendees (stored in metadata)
      if (updates.attendees !== undefined) {
        // Need to merge with existing metadata
        const existing = await this.pool.query(
          'SELECT metadata FROM tenant_vutler.events WHERE id = $1',
          [event_id]
        );
        
        if (existing.rows.length > 0) {
          const meta = existing.rows[0].metadata || {};
          meta.attendees = updates.attendees;
          fields.push(`metadata = $${paramIndex}`);
          values.push(JSON.stringify(meta));
          paramIndex++;
        }
        
        delete updates.attendees;
      }

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
      values.push(event_id);

      const result = await this.pool.query(
        `UPDATE tenant_vutler.events
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, title, description, start_time, end_time, location, status, metadata, updated_at`,
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
      const { start_date, end_date, status, limit = 20 } = args;
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

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, title, description, start_time, end_time, location, status, metadata, created_at
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
        `SELECT id, title, description, start_time, end_time, location, status, metadata, created_at, updated_at
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
