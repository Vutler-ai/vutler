'use strict';

/**
 * Nexus Agent Routing Service
 * Routes incoming tasks/incidents to the correct agent based on type,
 * with round-robin load balancing, weight-based routing, and health tracking.
 */

const pool = require('../lib/vaultbrix');
const SCHEMA = 'tenant_vutler';

// ---------------------------------------------------------------------------
// Static fallback routing rules (used when no DB rules found for workspace)
// ---------------------------------------------------------------------------
const ROUTING_RULES = {
  // Dev features
  feature:      ['mike'],
  enhancement:  ['mike'],
  refactor:     ['mike'],

  // QA / bugs / review
  bug:          ['michael'],
  incident:     ['michael'],
  review:       ['michael'],
  qa:           ['michael'],
  test:         ['michael'],
  frontend:     ['michael', 'philip'],

  // Release & deploy
  release:      ['release-devops'],
  deploy:       ['release-devops'],
  ci:           ['release-devops'],
  'smoke-test': ['release-devops'],
  rollback:     ['release-devops'],

  // Database
  migration:    ['db-migration'],
  schema:       ['db-migration'],
  database:     ['db-migration'],
  rls:          ['db-migration'],
  index:        ['db-migration'],
};

// Fallback chain if primary agent is unavailable
const FALLBACK_CHAIN = {
  'michael':        ['mike'],
  'release-devops': ['mike'],
  'db-migration':   ['mike'],
  'mike':           ['michael'],
};

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * Round-robin index per task type.
 * Key: `${workspaceId}:${taskType}` → current index into the candidates array.
 * Reset when the candidate list for a type changes.
 */
const rrIndex = new Map(); // key → { index, lastCandidates: string[] }

/**
 * Failure tracking per agent.
 * Key: agentId → { count: number, lastFailure: Date }
 */
const agentFailures = new Map();

/** Milliseconds before a failed agent comes back into rotation. */
const FAILURE_COOLDOWN_MS = 30_000;

/** Consecutive failures before an agent is deprioritised. */
const FAILURE_THRESHOLD = 3;

/** Heartbeat staleness limit in seconds (agent considered offline). */
const HEARTBEAT_STALE_SECS = 90;

// ---------------------------------------------------------------------------
// Routing rules cache (workspace-aware, TTL 60s)
// ---------------------------------------------------------------------------

/**
 * Cache entry: { rules: Object, fetchedAt: number }
 * Key: workspaceId (or 'default' for the static fallback)
 */
const routingRulesCache = new Map();
const RULES_CACHE_TTL_MS = 60_000;

/**
 * Load routing rules for a workspace from DB, with 60s in-memory cache.
 * Falls back to the static ROUTING_RULES if no DB rows found or on error.
 *
 * @param {string|null} workspaceId
 * @returns {Promise<Object>} taskType → string[]
 */
async function getRoutingRules(workspaceId) {
  const cacheKey = workspaceId || 'default';
  const cached = routingRulesCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < RULES_CACHE_TTL_MS) {
    return cached.rules;
  }

  // No workspace → return static rules immediately
  if (!workspaceId) {
    routingRulesCache.set(cacheKey, { rules: ROUTING_RULES, fetchedAt: Date.now() });
    return ROUTING_RULES;
  }

  try {
    const r = await pool.query(
      `SELECT task_type, agent_usernames
         FROM ${SCHEMA}.nexus_routing_rules
        WHERE workspace_id = $1
          AND active = TRUE`,
      [workspaceId]
    );

    if (!r.rows.length) {
      // No rules configured for this workspace — use static fallback
      routingRulesCache.set(cacheKey, { rules: ROUTING_RULES, fetchedAt: Date.now() });
      return ROUTING_RULES;
    }

    const rules = {};
    for (const row of r.rows) {
      rules[row.task_type] = Array.isArray(row.agent_usernames)
        ? row.agent_usernames
        : [row.agent_usernames];
    }

    routingRulesCache.set(cacheKey, { rules, fetchedAt: Date.now() });
    return rules;
  } catch (err) {
    console.error('[NEXUS-ROUTING] getRoutingRules DB error, using static fallback:', err.message);
    return ROUTING_RULES;
  }
}

/**
 * Invalidate the routing rules cache for a workspace (or all workspaces).
 * Call this after updating nexus_routing_rules in the DB.
 *
 * @param {string|null} workspaceId — pass null to flush everything
 */
function invalidateRoutingRulesCache(workspaceId) {
  if (workspaceId) {
    routingRulesCache.delete(workspaceId);
  } else {
    routingRulesCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Resolve agent username list for a given task type.
 * Workspace-unaware synchronous version kept for backward-compat.
 *
 * @param {string} taskType
 * @returns {string[]} ordered list of agent usernames
 */
function resolveAgents(taskType) {
  const type = String(taskType || '').toLowerCase().trim();
  return ROUTING_RULES[type] || ['mike'];
}

/**
 * Resolve agent username list, workspace-aware (async).
 *
 * @param {string} taskType
 * @param {string|null} workspaceId
 * @returns {Promise<string[]>}
 */
async function resolveAgentsForWorkspace(taskType, workspaceId) {
  const type = String(taskType || '').toLowerCase().trim();
  const rules = await getRoutingRules(workspaceId);
  return rules[type] || ['mike'];
}

/**
 * Get agent details from DB by username, including heartbeat freshness.
 *
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function getAgentByUsername(username) {
  const r = await pool.query(
    `SELECT id, name, username, model, status, config,
            last_heartbeat_at
       FROM ${SCHEMA}.agents
      WHERE username = $1
      LIMIT 1`,
    [username]
  );
  return r.rows[0] || null;
}

/**
 * Returns true if the agent has a fresh heartbeat (< HEARTBEAT_STALE_SECS old).
 *
 * @param {object} agent - DB row from getAgentByUsername
 * @returns {boolean}
 */
function isHeartbeatFresh(agent) {
  if (!agent.last_heartbeat_at) return false;
  const ageSecs = (Date.now() - new Date(agent.last_heartbeat_at).getTime()) / 1000;
  return ageSecs < HEARTBEAT_STALE_SECS;
}

/**
 * Returns true if the agent is in failure cooldown (≥ FAILURE_THRESHOLD
 * consecutive failures within the last FAILURE_COOLDOWN_MS window).
 *
 * @param {string} agentId
 * @returns {boolean}
 */
function isInCooldown(agentId) {
  const rec = agentFailures.get(agentId);
  if (!rec || rec.count < FAILURE_THRESHOLD) return false;
  return Date.now() - rec.lastFailure.getTime() < FAILURE_COOLDOWN_MS;
}

/**
 * Check whether an agent is eligible for routing:
 *  - status = 'online'
 *  - heartbeat fresh (< 90 s)
 *  - not in failure cooldown
 *
 * @param {object} agent
 * @returns {boolean}
 */
function isAgentEligible(agent) {
  if (!agent || agent.status !== 'online') return false;
  if (!isHeartbeatFresh(agent)) return false;
  if (isInCooldown(agent.id)) return false;
  return true;
}

/**
 * Extract weight from agent config (1–10, default 1).
 *
 * @param {object} agent
 * @returns {number}
 */
function getAgentWeight(agent) {
  const cfg = agent.config || {};
  const w = parseInt(cfg.weight, 10);
  if (Number.isFinite(w) && w >= 1 && w <= 10) return w;
  return 1;
}

/**
 * Build a weighted candidate array for round-robin.
 * An agent with weight 3 appears 3 times in the array.
 *
 * @param {object[]} agentObjects
 * @returns {object[]}
 */
function buildWeightedPool(agentObjects) {
  const pool = [];
  for (const agent of agentObjects) {
    const weight = getAgentWeight(agent);
    for (let i = 0; i < weight; i++) pool.push(agent);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Round-robin state management
// ---------------------------------------------------------------------------

/**
 * Get (or advance) the round-robin index for a given routing key.
 * If the candidates list has changed since last call, the index is reset.
 *
 * @param {string} rrKey     - unique key e.g. `${workspaceId}:${taskType}`
 * @param {string[]} candidateUsernames - current ordered list
 * @returns {number} index to use (already incremented for next call)
 */
function advanceRRIndex(rrKey, candidateUsernames) {
  const entry = rrIndex.get(rrKey);
  const serialised = candidateUsernames.join(',');

  if (!entry || entry.lastCandidates !== serialised) {
    // Candidates changed (or first call) — reset index
    rrIndex.set(rrKey, { index: 1, lastCandidates: serialised });
    return 0;
  }

  const idx = entry.index % candidateUsernames.length;
  entry.index = idx + 1;
  return idx;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Report a task result for an agent — feeds the health tracker.
 * Call this from route handlers after task execution.
 *
 * @param {string} agentId  - UUID of the agent
 * @param {boolean} success - whether the task succeeded
 */
function reportTaskResult(agentId, success) {
  if (success) {
    // Reset failure count on success
    agentFailures.delete(agentId);
    return;
  }

  const existing = agentFailures.get(agentId) || { count: 0, lastFailure: null };
  agentFailures.set(agentId, {
    count: existing.count + 1,
    lastFailure: new Date(),
  });

  const rec = agentFailures.get(agentId);
  if (rec.count >= FAILURE_THRESHOLD) {
    console.warn(
      `[NEXUS-ROUTING] Agent ${agentId} reached ${rec.count} consecutive failures — ` +
      `entering ${FAILURE_COOLDOWN_MS / 1000}s cooldown.`
    );
  }
}

/**
 * Route a task to the best available agent, with load balancing.
 *
 * Selection order:
 *  1. Collect all candidate usernames for the taskType (workspace-aware)
 *  2. Fetch their DB records
 *  3. Filter to eligible agents (online + fresh heartbeat + not in cooldown)
 *  4. Build weighted pool and pick via round-robin
 *  5. If no eligible agents: try FALLBACK_CHAIN candidates
 *  6. Final fallback: return first candidate anyway (offline warning)
 *
 * @param {string} taskType
 * @param {string|null} [workspaceId]
 * @returns {Promise<{ agent: object, fallbacks: string[], rule: string, warning?: string }>}
 */
async function routeTask(taskType, workspaceId = null) {
  const type = String(taskType || '').toLowerCase().trim();
  const candidateUsernames = await resolveAgentsForWorkspace(type, workspaceId);

  // Fetch all candidate agents in parallel
  const candidateAgents = await Promise.all(
    candidateUsernames.map(u => getAgentByUsername(u))
  );

  // Filter to eligible agents
  const eligible = candidateAgents.filter(isAgentEligible);

  if (eligible.length > 0) {
    let selected;

    if (eligible.length === 1) {
      selected = eligible[0];
    } else {
      // Build weighted pool and apply round-robin
      const pool = buildWeightedPool(eligible);
      const rrKey = `${workspaceId || 'default'}:${type}`;
      // Round-robin over eligible usernames (not the expanded weighted pool)
      const eligibleUsernames = eligible.map(a => a.username);
      const idx = advanceRRIndex(rrKey, eligibleUsernames);
      // Map idx back into the weighted pool
      selected = pool[idx % pool.length];
    }

    return {
      agent: selected,
      fallbacks: FALLBACK_CHAIN[selected.username] || [],
      rule: type,
    };
  }

  // No eligible primary candidates — walk fallback chain
  for (const primaryUsername of candidateUsernames) {
    const fallbacks = FALLBACK_CHAIN[primaryUsername] || [];
    for (const fbUsername of fallbacks) {
      const fbAgent = await getAgentByUsername(fbUsername);
      if (fbAgent && isAgentEligible(fbAgent)) {
        return {
          agent: fbAgent,
          fallbacks: FALLBACK_CHAIN[fbUsername] || [],
          rule: type,
          warning: 'primary_agent_offline_fallback_used',
        };
      }
    }
  }

  // All candidates and fallbacks offline — return first candidate anyway
  const firstAgent = candidateAgents[0] || (await getAgentByUsername(candidateUsernames[0]));
  return {
    agent: firstAgent,
    fallbacks: FALLBACK_CHAIN[candidateUsernames[0]] || [],
    rule: type,
    warning: 'primary_agent_offline',
  };
}

/**
 * Get full routing matrix for dashboard.
 * Optionally workspace-aware when workspaceId is provided.
 *
 * @param {string|null} [workspaceId]
 * @returns {Promise<Array>}
 */
async function getRoutingMatrix(workspaceId = null) {
  const rules = await getRoutingRules(workspaceId);
  return Object.entries(rules).map(([type, agents]) => ({
    type,
    agents,
    fallbacks: agents.map(a => FALLBACK_CHAIN[a] || []),
  }));
}

module.exports = {
  // Static config (kept for backward compat / direct inspection)
  ROUTING_RULES,
  FALLBACK_CHAIN,

  // Core routing
  resolveAgents,
  resolveAgentsForWorkspace,
  getAgentByUsername,
  routeTask,
  getRoutingMatrix,

  // Dynamic rules
  getRoutingRules,
  invalidateRoutingRulesCache,

  // Health reporting
  reportTaskResult,
};
