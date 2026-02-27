/**
 * tools/memories.js
 * Store/recall dans agent_memories
 */

const TOOL_DEFINITIONS = [
  {
    name: 'store_memory',
    description: 'Store a new memory for the agent',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content to store' },
        memory_type: { 
          type: 'string', 
          enum: ['fact', 'conversation', 'decision', 'observation', 'learning'],
          description: 'Type of memory' 
        },
        importance: { type: 'number', description: 'Importance level 1-10 (default: 5)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization (optional)' }
      },
      required: ['content', 'memory_type']
    }
  },
  {
    name: 'recall_memories',
    description: 'Recall memories based on query/context',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query text for semantic search (optional)' },
        memory_type: { type: 'string', description: 'Filter by memory type (optional)' },
        limit: { type: 'number', description: 'Max number of memories to recall (default: 5)' },
        min_importance: { type: 'number', description: 'Minimum importance level (optional)' }
      },
      required: []
    }
  },
  {
    name: 'search_memories',
    description: 'Search memories by keyword or tags',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Keyword to search in content (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' },
        memory_type: { type: 'string', description: 'Filter by type (optional)' },
        limit: { type: 'number', description: 'Max results (default: 10)' }
      },
      required: []
    }
  }
];

class MemoriesToolHandler {
  constructor(pgPool, agentId) {
    this.pool = pgPool;
    this.agentId = agentId;
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    switch (toolName) {
      case 'store_memory':
        return this.storeMemory(args);
      case 'recall_memories':
        return this.recallMemories(args);
      case 'search_memories':
        return this.searchMemories(args);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  async storeMemory(args) {
    try {
      const {
        content,
        memory_type,
        importance = 5,
        tags = []
      } = args;

      const metadata = { tags };

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.agent_memories
         (agent_id, memory_type, content, importance, metadata, created_at, last_accessed_at, decay_factor, workspace_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1.0, '00000000-0000-0000-0000-000000000001')
         RETURNING id, memory_type, content, importance, created_at`,
        [this.agentId, memory_type, content, importance, JSON.stringify(metadata)]
      );

      return {
        success: true,
        memory: result.rows[0]
      };
    } catch (error) {
      console.error('[MemoriesTool] Store error:', error);
      return { error: error.message };
    }
  }

  async recallMemories(args) {
    try {
      const {
        query = '',
        memory_type = null,
        limit = 5,
        min_importance = null
      } = args;

      const conditions = ['agent_id = $1', "(decay_factor IS NULL OR decay_factor > 0.1)"];
      const values = [this.agentId];
      let paramIndex = 2;

      if (memory_type) {
        conditions.push(`memory_type = $${paramIndex}`);
        values.push(memory_type);
        paramIndex++;
      }

      if (min_importance !== null) {
        conditions.push(`importance >= $${paramIndex}`);
        values.push(min_importance);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, memory_type, content, importance, created_at, last_accessed_at, metadata
         FROM tenant_vutler.agent_memories
         WHERE ${conditions.join(' AND ')}
         ORDER BY importance DESC, created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

      // Update last_accessed_at
      if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await this.pool.query(
          `UPDATE tenant_vutler.agent_memories
           SET last_accessed_at = NOW()
           WHERE id = ANY($1)`,
          [ids]
        );
      }

      return {
        success: true,
        memories: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('[MemoriesTool] Recall error:', error);
      return { error: error.message };
    }
  }

  async searchMemories(args) {
    try {
      const {
        keyword = null,
        tags = null,
        memory_type = null,
        limit = 10
      } = args;

      const conditions = ['agent_id = $1'];
      const values = [this.agentId];
      let paramIndex = 2;

      if (keyword) {
        conditions.push(`content ILIKE $${paramIndex}`);
        values.push(`%${keyword}%`);
        paramIndex++;
      }

      if (memory_type) {
        conditions.push(`memory_type = $${paramIndex}`);
        values.push(memory_type);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        conditions.push(`metadata->>'tags' ?| $${paramIndex}`);
        values.push(tags);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, memory_type, content, importance, created_at, metadata
         FROM tenant_vutler.agent_memories
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

      return {
        success: true,
        memories: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('[MemoriesTool] Search error:', error);
      return { error: error.message };
    }
  }
}

module.exports = MemoriesToolHandler;
