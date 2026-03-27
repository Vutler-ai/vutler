'use strict';

/**
 * Workflow Mode Selector — LITE vs FULL execution modes.
 *
 * Scores tasks using a 4-question framework to determine complexity,
 * then orchestrates execution with the appropriate Snipara tool chain.
 *
 * LITE (~3-5K tokens): Quick fixes, single-file changes, known scope.
 * FULL (~8-15K tokens): Multi-file, architectural, multi-session work.
 *
 * Ref: https://snipara.com/docs/features/workflows
 */

const sniparaClient = require('./sniparaClient');
const { chat } = require('./llmRouter');

// ── Scoring Criteria ────────────────────────────────────────────────────────

const CRITERIA = [
  {
    id: 'multi_session',
    question: 'Will this take multiple sessions?',
    patterns: [
      'refactor', 'migration', 'rewrite', 'overhaul', 'redesign',
      'multi-day', 'multi-session', 'phase', 'sprint', 'epic',
      'long-term', 'gradual', 'incremental',
    ],
  },
  {
    id: 'multi_file',
    question: 'Does it affect 5+ files?',
    patterns: [
      'across', 'multiple files', 'all files', 'project-wide', 'codebase',
      'everywhere', 'global', 'system-wide', 'rename across', 'mass update',
      'all endpoints', 'all components', 'all services',
    ],
  },
  {
    id: 'architectural',
    question: 'Am I making architectural decisions?',
    patterns: [
      'architect', 'design', 'pattern', 'breaking change', 'jwt', 'oauth',
      'database schema', 'api design', 'microservice', 'monolith', 'event-driven',
      'queue', 'cache strategy', 'scaling', 'multi-tenant', 'rbac', 'permissions',
      'state management', 'data model', 'infrastructure',
    ],
  },
  {
    id: 'team_visible',
    question: 'Will others need to understand this later?',
    patterns: [
      'team', 'documentation', 'api change', 'breaking', 'public api',
      'interface', 'contract', 'schema change', 'shared', 'convention',
      'standard', 'guideline', 'onboarding', 'handoff',
    ],
  },
];

// ── Mode Constants ──────────────────────────────────────────────────────────

const MODE_LITE = 'LITE';
const MODE_FULL = 'FULL';
const FULL_THRESHOLD = 2; // Score >= 2 → FULL mode

// ── Prompt Templates ────────────────────────────────────────────────────────

const LITE_PROMPT_INJECTION = `## Workflow Mode: LITE
This is a quick task. Be direct and concise.
- Focus on the specific fix/change requested
- No need for extensive planning or documentation
- Provide the solution directly`;

function buildFullPromptInjection(shared, memories, deepContext, plan) {
  const sections = ['## Workflow Mode: FULL\nThis is a complex task requiring careful execution.\n'];

  if (shared) {
    sections.push(`### Team Standards & Shared Context\n${typeof shared === 'string' ? shared : sniparaClient.extractText(shared) || '(none)'}\n`);
  }
  if (memories) {
    const memText = typeof memories === 'string' ? memories : sniparaClient.extractText(memories);
    if (memText) sections.push(`### Relevant Memories\n${memText}\n`);
  }
  if (deepContext) {
    const ctxText = typeof deepContext === 'string' ? deepContext : sniparaClient.extractText(deepContext);
    if (ctxText) sections.push(`### Deep Context\n${ctxText}\n`);
  }
  if (plan) {
    const planText = typeof plan === 'string' ? plan : sniparaClient.extractText(plan);
    if (planText) sections.push(`### Plan\n${planText}\n`);
  }

  sections.push(`### Instructions
- Follow the plan step by step
- Document decisions as you make them
- Consider impact on other parts of the system
- Provide detailed rationale for architectural choices`);

  return sections.join('\n');
}

// ── WorkflowModeSelector ────────────────────────────────────────────────────

class WorkflowModeSelector {
  constructor(options = {}) {
    this.fullThreshold = options.fullThreshold || FULL_THRESHOLD;
  }

  /**
   * Score a task to determine workflow mode.
   * @param {object} task - { title, description, priority, parent_id, metadata }
   * @returns {{ mode: string, score: number, reasons: string[] }}
   */
  score(task) {
    const text = `${task.title || ''} ${task.description || ''} ${task.taskType || ''}`.toLowerCase();
    let score = 0;
    const reasons = [];

    for (const criterion of CRITERIA) {
      const matched = criterion.patterns.some(p => text.includes(p));
      if (matched) {
        score += 1;
        reasons.push(criterion.question);
      }
    }

    // Bonus: high priority suggests complexity
    const pri = String(task.priority || '').toLowerCase();
    if (pri === 'high' || pri === 'p1' || pri === 'critical') {
      score += 1;
      reasons.push('High priority task');
    }

    // Bonus: task has subtasks (hierarchical = complex)
    if (task.parent_id || task.subtask_count > 0) {
      score += 1;
      reasons.push('Hierarchical task structure');
    }

    const mode = score >= this.fullThreshold ? MODE_FULL : MODE_LITE;

    return { mode, score, reasons };
  }

  /**
   * Gather deep context for FULL mode execution.
   * Uses Snipara's advanced tools for rich context.
   * @param {string} agentId
   * @param {object} task
   * @param {object} coordinator - SwarmCoordinator instance (for sniparaCall)
   * @returns {{ shared, memories, deepContext, plan, enrichedPrompt }}
   */
  async gatherFullContext(agentId, task, coordinator) {
    const taskText = `${task.title || ''} ${task.description || ''}`;

    // Phase 1: Context Gathering (parallel)
    const [shared, memories, deepContext] = await Promise.all([
      // Team standards & shared context
      coordinator.sniparaCall('rlm_recall', {
        query: 'team standards shared context conventions guidelines',
        swarm_id: coordinator.swarmId,
        limit: 5,
      }).catch(() => null),

      // Agent-specific memories for this topic
      sniparaClient.recall(`agent-${agentId}`, taskText).catch(() => null),

      // Deep context query with higher token budget
      coordinator.sniparaCall('rlm_context_query', {
        query: taskText,
        max_tokens: 8000,
      }).catch(() => null),
    ]);

    // Phase 2: Planning
    let plan = null;
    try {
      plan = await coordinator.sniparaCall('rlm_plan', {
        description: task.description || task.title,
      });
    } catch {
      // rlm_plan may not be available — fallback to rlm_decompose
      try {
        plan = await coordinator.sniparaCall('rlm_decompose', {
          task: task.description || task.title,
        });
      } catch {
        // No planning available — proceed without
      }
    }

    // Store planning decision in memory
    if (plan) {
      const planSummary = typeof plan === 'string' ? plan.slice(0, 200) : sniparaClient.extractText(plan)?.slice(0, 200) || '';
      await sniparaClient.remember(
        `agent-${agentId}`,
        `Decision for "${task.title}": ${planSummary}`,
        { type: 'decision', importance: 8 },
      ).catch(() => {});
    }

    const enrichedPrompt = buildFullPromptInjection(shared, memories, deepContext, plan);

    return { shared, memories, deepContext, plan, enrichedPrompt };
  }

  /**
   * Persist learnings after FULL mode execution.
   * @param {string} agentId
   * @param {object} task
   * @param {string} resultSummary
   */
  async persistFullModeResult(agentId, task, resultSummary) {
    await Promise.all([
      // Learning: what was accomplished
      sniparaClient.remember(
        `agent-${agentId}`,
        `Completed (FULL): "${task.title}". ${resultSummary || 'Done.'}`,
        { type: 'learning', importance: 7 },
      ).catch(() => {}),

      // Context: session continuity for future sessions
      sniparaClient.remember(
        `agent-${agentId}`,
        `Context: "${task.title}" — status: completed. ${resultSummary || ''}`,
        { type: 'context', importance: 6 },
      ).catch(() => {}),
    ]);
  }

  /**
   * Get the LITE mode prompt injection string.
   */
  getLitePrompt() {
    return LITE_PROMPT_INJECTION;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let singleton = null;
function getWorkflowModeSelector(options) {
  if (!singleton) singleton = new WorkflowModeSelector(options);
  return singleton;
}

module.exports = {
  WorkflowModeSelector,
  getWorkflowModeSelector,
  MODE_LITE,
  MODE_FULL,
};
