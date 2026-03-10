/**
 * tools/memories.js [PATCHED]
 * Store/recall dans agent_memories
 * 
 * FIXES:
 * - memory_type → type (real column)
 * - Removed: importance, last_accessed_at, decay_factor, embedding, confidence, access_count
 * - Real schema: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id
 * - Store importance/tags in metadata JSON
 */

const TOOL_DEFINITIONS = [
  {
    name: 'store_memory',
    description: 'Store a new memory for the agent',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content to store' },
        type: { 
          type: 'string', 
          enum: ['fact', 'conversation', 'decision', 'observation', 'learning'],
          description: 'Type of memory' 
        },
        importance: { type: 'number', description: 'Importance level 1-10 (default: 5, stored in metadata)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization (optional)' }
      },
      required: ['content', 'type']
    }
  },
  {
    name: 'recall_memories',
    description: 'Recall memories based on query/context',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query text for search (optional)' },
        type: { type: 'string', description: 'Filter by memory type (optional)' },
        limit: { type: 'number', description: 'Max number of memories to recall (default: 5)' },
        min_importance: { type: 'number', description: 'Minimum importance level from metadata (optional)' }
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
        type: { type: 'string', description: 'Filter by type (optional)' },
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
        type,
        importance = 5,
        tags = []
      } = args;

      const metadata = { 
        tags,
        importance,
        stored_at: new Date().toISOString()
      };

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.agent_memories
         (agent_id, type, content, metadata, created_at, updated_at, workspace_id)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id, type, content, metadata, created_at`,
        [this.agentId, type, content, JSON.stringify(metadata)]
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
        type = null,
        limit = 5,
        min_importance = null
      } = args;

      const conditions = ['agent_id = $1'];
      const values = [this.agentId];
      let paramIndex = 2;

      if (type) {
        conditions.push(`type = $${paramIndex}`);
        values.push(type);
        paramIndex++;
      }

      // Filter by importance in metadata
      if (min_importance !== null) {
        conditions.push(`(metadata->>'importance')::int >= $${paramIndex}`);
        values.push(min_importance);
        paramIndex++;
      }

      // Simple keyword search if query provided
      if (query) {
        conditions.push(`content ILIKE $${paramIndex}`);
        values.push(`%${query}%`);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, type, content, metadata, created_at, updated_at
         FROM tenant_vutler.agent_memories
         WHERE ${conditions.join(' AND ')}
         ORDER BY 
           COALESCE((metadata->>'importance')::int, 5) DESC,
           created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

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
        type = null,
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

      if (type) {
        conditions.push(`type = $${paramIndex}`);
        values.push(type);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        // Search for any of the tags in metadata->tags array
        conditions.push(`metadata->'tags' ?| $${paramIndex}`);
        values.push(tags);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(
        `SELECT id, type, content, metadata, created_at, updated_at
         FROM tenant_vutler.agent_memories
         WHERE ${conditions.join(' AND ')}
         ORDER BY 
           COALESCE((metadata->>'importance')::int, 5) DESC,
           created_at DESC
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
