'use strict';

/**
 * Nexus Agent Routing Service
 * Routes incoming tasks/incidents to the correct agent based on type.
 */

const pool = require('../lib/vaultbrix');
const SCHEMA = 'tenant_vutler';

// Agent routing rules: type → agent username(s)
const ROUTING_RULES = {
  // Dev features
  feature:    ['mike'],
  enhancement:['mike'],
  refactor:   ['mike'],

  // QA / bugs / review
  bug:        ['michael'],
  incident:   ['michael'],
  review:     ['michael'],
  qa:         ['michael'],
  test:       ['michael'],
  frontend:   ['michael', 'philip'],

  // Release & deploy
  release:    ['release-devops'],
  deploy:     ['release-devops'],
  ci:         ['release-devops'],
  'smoke-test': ['release-devops'],
  rollback:   ['release-devops'],

  // Database
  migration:  ['db-migration'],
  schema:     ['db-migration'],
  database:   ['db-migration'],
  rls:        ['db-migration'],
  index:      ['db-migration'],
};

// Fallback chain if primary agent is unavailable
const FALLBACK_CHAIN = {
  'michael':        ['mike'],
  'release-devops': ['mike'],
  'db-migration':   ['mike'],
  'mike':           ['michael'],
};

/**
 * Resolve agent(s) for a given task type
 * @param {string} taskType - e.g. 'bug', 'feature', 'deploy'
 * @returns {string[]} ordered list of agent usernames
 */
function resolveAgents(taskType) {
  const type = String(taskType || '').toLowerCase().trim();
  return ROUTING_RULES[type] || ['mike']; // default to Mike
}

/**
 * Get agent details from DB by username
 */
async function getAgentByUsername(username) {
  const r = await pool.query(
    `SELECT id, name, username, model, status FROM ${SCHEMA}.agents WHERE username = $1 LIMIT 1`,
    [username]
  );
  return r.rows[0] || null;
}

/**
 * Route a task to the best available agent
 * @param {string} taskType
 * @returns {{ agent: object, fallbacks: string[] }}
 */
async function routeTask(taskType) {
  const candidates = resolveAgents(taskType);

  for (const username of candidates) {
    const agent = await getAgentByUsername(username);
    if (agent && agent.status === 'online') {
      return {
        agent,
        fallbacks: FALLBACK_CHAIN[username] || [],
        rule: taskType,
      };
    }
  }

  // All candidates offline — use first candidate anyway
  const fallbackAgent = await getAgentByUsername(candidates[0]);
  return {
    agent: fallbackAgent,
    fallbacks: FALLBACK_CHAIN[candidates[0]] || [],
    rule: taskType,
    warning: 'primary_agent_offline',
  };
}

/**
 * Get full routing matrix for dashboard
 */
function getRoutingMatrix() {
  return Object.entries(ROUTING_RULES).map(([type, agents]) => ({
    type,
    agents,
    fallbacks: agents.map(a => FALLBACK_CHAIN[a] || []),
  }));
}

module.exports = {
  ROUTING_RULES,
  FALLBACK_CHAIN,
  resolveAgents,
  getAgentByUsername,
  routeTask,
  getRoutingMatrix,
};
