/**
 * memory-manager.js [PATCHED]
 * Gestion de la mémoire agent : recall, save, decay
 * 
 * FIXES:
 * - memory_type → type
 * - Removed: importance, last_accessed_at, decay_factor (stored in metadata)
 * - Real schema: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id
 */

class MemoryManager {
  constructor(pgPool) {
    this.pool = pgPool;
  }

  /**
   * Recall top N memories pertinentes pour un agent
   * @param {string} agentId - UUID de l'agent
   * @param {string} query - Texte de contexte pour la recherche sémantique
   * @param {number} limit - Nombre de memories à retourner
   * @returns {Array} Memories pertinentes
   */
  async recall(agentId, query, limit = 5) {
    try {
      // Pour l'instant, simple tri par timestamp + relevance basique
      // TODO: Ajouter embeddings sémantiques si besoin
      const result = await this.pool.query(
        `SELECT id, agent_id, type, content, metadata, created_at, updated_at
         FROM tenant_vutler.agent_memories
         WHERE agent_id = $1
           AND (
             (metadata->>'decay_factor')::float IS NULL 
             OR (metadata->>'decay_factor')::float > 0.1
           )
         ORDER BY 
           COALESCE((metadata->>'importance')::int, 5) DESC,
           created_at DESC
         LIMIT $2`,
        [agentId, limit]
      );

      // Update last_accessed in metadata
      if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await this.pool.query(
          `UPDATE tenant_vutler.agent_memories
           SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{last_accessed}',
             to_jsonb(NOW())
           ),
           updated_at = NOW()
           WHERE id = ANY($1)`,
          [ids]
        );
      }

      return result.rows;
    } catch (error) {
      console.error('[MemoryManager] Recall error:', error);
      return [];
    }
  }

  /**
   * Save une nouvelle memory pour un agent
   * @param {string} agentId - UUID de l'agent
   * @param {string} memoryType - fact|conversation|decision|observation
   * @param {string} content - Contenu de la mémoire
   * @param {number} importance - 1-10
   * @param {object} metadata - Metadata additionnel
   */
  async save(agentId, memoryType, content, importance = 5, metadata = {}) {
    try {
      const fullMetadata = {
        ...metadata,
        importance,
        decay_factor: 1.0,
        last_accessed: new Date().toISOString()
      };

      const result = await this.pool.query(
        `INSERT INTO tenant_vutler.agent_memories
         (agent_id, type, content, metadata, created_at, updated_at, workspace_id)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id`,
        [agentId, memoryType, content, JSON.stringify(fullMetadata)]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[MemoryManager] Save error:', error);
      return null;
    }
  }

  /**
   * Auto-save des faits importants depuis un message
   * Extrait automatiquement les facts pertinents
   */
  async autoSave(agentId, userMessage, agentResponse, context = {}) {
    try {
      // Sauvegarde de la conversation complète
      await this.save(
        agentId,
        'conversation',
        `User: ${userMessage}\nAgent: ${agentResponse}`,
        3,
        { timestamp: new Date().toISOString(), ...context }
      );

      // TODO: Implémenter extraction de facts via LLM si budget tokens disponible
      // Pour l'instant, sauvegarde simple

      return true;
    } catch (error) {
      console.error('[MemoryManager] AutoSave error:', error);
      return false;
    }
  }

  /**
   * Decay des vieilles memories
   * Réduit le decay_factor des memories anciennes et peu utilisées
   */
  async decayOldMemories(agentId, daysThreshold = 30) {
    try {
      await this.pool.query(
        `UPDATE tenant_vutler.agent_memories
         SET 
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{decay_factor}',
             to_jsonb(GREATEST(0, COALESCE((metadata->>'decay_factor')::float, 1.0) - 0.1))
           ),
           updated_at = NOW()
         WHERE agent_id = $1
           AND (
             (metadata->>'last_accessed')::timestamp < NOW() - INTERVAL '${daysThreshold} days'
             OR metadata->>'last_accessed' IS NULL
           )
           AND COALESCE((metadata->>'decay_factor')::float, 1.0) > 0`,
        [agentId]
      );

      return true;
    } catch (error) {
      console.error('[MemoryManager] Decay error:', error);
      return false;
    }
  }

  /**
   * Cleanup des memories avec decay_factor = 0
   */
  async cleanup(agentId) {
    try {
      const result = await this.pool.query(
        `DELETE FROM tenant_vutler.agent_memories
         WHERE agent_id = $1
           AND (metadata->>'decay_factor')::float <= 0
         RETURNING id`,
        [agentId]
      );

      return result.rowCount;
    } catch (error) {
      console.error('[MemoryManager] Cleanup error:', error);
      return 0;
    }
  }
}

module.exports = MemoryManager;
