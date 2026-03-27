'use strict';

/**
 * Smart Dispatcher — Multi-factor agent scoring for task assignment.
 *
 * Replaces the keyword-only matching with a weighted scoring system:
 *   - Capability match (40%)
 *   - Historical success rate (25%)
 *   - Memory relevance (15%)
 *   - Current load (10%)
 *   - Speed (10%)
 */

const { pool } = require('../lib/postgres');
const sniparaClient = require('./sniparaClient');
const { AGENT_CAPABILITIES } = require('../app/custom/services/swarmCoordinator');

const SCHEMA = 'tenant_vutler';

const WEIGHTS = {
  capability: 0.40,
  successRate: 0.25,
  memoryRelevance: 0.15,
  currentLoad: 0.10,
  speed: 0.10,
};

const CACHE_TTL_MS = 300_000; // 5 min

class SmartDispatcher {
  constructor(options = {}) {
    this._performanceCache = new Map(); // agentId -> { ts, data }
    this._cacheTtl = options.cacheTtl || CACHE_TTL_MS;
  }

  /**
   * Score all available agents and return the best fit.
   * @param {object} task - { title, description }
   * @param {object} options - { excludeAgents: string[] }
   * @returns {{ agentId: string, score: number, breakdown: object }}
   */
  async dispatch(task, options = {}) {
    const exclude = new Set(options.excludeAgents || []);
    const agents = Object.keys(AGENT_CAPABILITIES).filter(a => !exclude.has(a));

    if (!agents.length) {
      return { agentId: 'mike', score: 0, breakdown: {} }; // fallback
    }

    const scored = await Promise.all(
      agents.map(agentId => this._scoreAgent(agentId, task))
    );

    scored.sort((a, b) => b.totalScore - a.totalScore);

    const best = scored[0];
    console.log(`[Dispatcher] Best agent for "${(task.title || '').slice(0, 50)}": ${best.agentId} (score: ${best.totalScore.toFixed(2)})`);

    return { agentId: best.agentId, score: best.totalScore, breakdown: best };
  }

  async _scoreAgent(agentId, task) {
    const capScore = this._capabilityScore(agentId, task);
    const stats = await this._getPerformanceStats(agentId);
    const memScore = await this._memoryRelevanceScore(agentId, task);

    const successScore = stats.successRate;
    const loadScore = Math.max(0, 1 - stats.activeTasks / 5); // 0 if 5+ tasks
    const speedScore = stats.avgCompletionHours > 0
      ? Math.max(0, 1 - stats.avgCompletionHours / 24)
      : 0.5;

    const totalScore =
      capScore * WEIGHTS.capability +
      successScore * WEIGHTS.successRate +
      memScore * WEIGHTS.memoryRelevance +
      loadScore * WEIGHTS.currentLoad +
      speedScore * WEIGHTS.speed;

    return { agentId, totalScore, capScore, successScore, memScore, loadScore, speedScore };
  }

  /**
   * Keyword-based capability matching, normalized to 0-1.
   */
  _capabilityScore(agentId, task) {
    const keywords = AGENT_CAPABILITIES[agentId] || [];
    const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    const matches = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    return Math.min(matches / 3, 1); // Cap at 1.0
  }

  /**
   * Load agent performance stats from cache or Snipara memory + local DB.
   */
  async _getPerformanceStats(agentId) {
    // Check cache
    const cached = this._performanceCache.get(agentId);
    if (cached && Date.now() - cached.ts < this._cacheTtl) {
      return cached.data;
    }

    const stats = { successRate: 0.5, activeTasks: 0, avgCompletionHours: 12 };

    try {
      // Active task count from PG
      const loadResult = await pool.query(
        `SELECT COUNT(*) as count FROM ${SCHEMA}.tasks
         WHERE assigned_agent = $1 AND status = 'in_progress'`,
        [agentId]
      );
      stats.activeTasks = parseInt(loadResult.rows[0]?.count || '0', 10);

      // Success rate from recent completed tasks
      const historyResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE verification_score >= $2) as passed,
           COUNT(*) as total,
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours
         FROM ${SCHEMA}.tasks
         WHERE assigned_agent = $1
           AND status IN ('completed', 'done')
           AND created_at > NOW() - INTERVAL '30 days'`,
        [agentId, Number(process.env.VERIFICATION_PASS_THRESHOLD) || 7]
      );

      const row = historyResult.rows[0];
      if (row && parseInt(row.total, 10) > 0) {
        stats.successRate = parseInt(row.passed, 10) / parseInt(row.total, 10);
        stats.avgCompletionHours = parseFloat(row.avg_hours) || 12;
      }
    } catch (err) {
      console.warn(`[Dispatcher] Stats query failed for ${agentId}:`, err.message);
    }

    // Cache
    this._performanceCache.set(agentId, { ts: Date.now(), data: stats });
    return stats;
  }

  /**
   * Check if agent has worked on similar tasks via Snipara memory recall.
   */
  async _memoryRelevanceScore(agentId, task) {
    try {
      const result = await sniparaClient.recall(
        `agent-${agentId}`,
        (task.title || '').slice(0, 100),
      );
      const text = sniparaClient.extractText(result);
      // If we got meaningful memory back, the agent has relevant experience
      if (text && text.length > 20 && !text.includes('No relevant memories')) {
        return 0.8;
      }
      return 0.2;
    } catch {
      return 0.2;
    }
  }
}

let singleton = null;
function getSmartDispatcher(options) {
  if (!singleton) singleton = new SmartDispatcher(options);
  return singleton;
}

module.exports = { SmartDispatcher, getSmartDispatcher };
