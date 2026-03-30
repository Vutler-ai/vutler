'use strict';

let mockMemoryStore = [];
let mockMemoryId = 1;

function resetStore() {
  mockMemoryStore = [];
  mockMemoryId = 1;
}

function mockTokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

jest.mock('../services/sniparaResolver', () => ({
  callSniparaTool: jest.fn(async ({ toolName, args }) => {
    if (toolName === 'rlm_remember') {
      const record = {
        id: `mem-${mockMemoryId++}`,
        text: args.text,
        type: args.type,
        importance: args.importance,
        scope: args.scope,
        category: args.category,
        agent_id: args.agent_id,
        metadata: args.metadata || {},
        created_at: args.metadata?.created_at || new Date().toISOString(),
      };
      mockMemoryStore.push(record);
      return { success: true, id: record.id };
    }

    if (toolName === 'rlm_recall') {
      const queryTokens = mockTokenize(args.query);
      const scoped = mockMemoryStore.filter((memory) => {
        if (args.scope && memory.scope !== args.scope) return false;
        if (args.category && memory.category !== args.category) return false;
        if (args.agent_id && memory.agent_id && memory.agent_id !== args.agent_id) return false;
        return true;
      });

      const scored = scoped.map((memory) => {
        if (queryTokens.length === 0) return { memory, score: 1 };
        const haystack = mockTokenize(memory.text);
        const overlap = queryTokens.filter((token) => haystack.includes(token)).length;
        return { memory, score: overlap };
      });

      return scored
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return new Date(right.memory.created_at).getTime() - new Date(left.memory.created_at).getTime();
        })
        .map((item) => item.memory)
        .slice(0, args.limit || 20);
    }

    if (toolName === 'rlm_load_document' || toolName === 'rlm_context_query') {
      return '';
    }

    return null;
  }),
}));

jest.mock('../services/memoryTelemetryService', () => ({
  logMemoryEvent: jest.fn(),
  summarizeMemoryTypes: jest.fn((memories = []) => memories.reduce((acc, memory) => {
    acc[memory.type] = (acc[memory.type] || 0) + 1;
    return acc;
  }, {})),
  summarizeMemoryScopes: jest.fn((memories = []) => memories.reduce((acc, memory) => {
    const key = memory.scopeKey || memory.scope_key || memory.metadata?.memory_scope_key || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})),
}));

const {
  listAgentMemories,
  rememberScopedMemory,
  buildRuntimeMemoryBundle,
} = require('../services/sniparaMemoryService');
const { extractConversationMemories } = require('../services/memoryExtractionService');
const { runWorkspaceMemoryMaintenance } = require('../services/memoryMaintenanceService');

function createDb(agents) {
  return {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT DISTINCT workspace_id')) {
        return {
          rows: [...new Set(agents.map((agent) => agent.workspace_id))].map((workspace_id) => ({ workspace_id })),
        };
      }

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $2')) {
        const [agentRef, workspaceId] = params;
        const found = agents.find((agent) => (
          agent.workspace_id === workspaceId
          && (String(agent.id) === String(agentRef) || String(agent.username) === String(agentRef))
        ));
        return { rows: found ? [found] : [] };
      }

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return { rows: agents.filter((agent) => agent.workspace_id === params[0]) };
      }

      return { rows: [] };
    }),
  };
}

describe('memory runtime e2e', () => {
  const agents = [
    { id: 'agent-1', name: 'Mike', username: 'mike', role: 'engineering', workspace_id: 'ws-1' },
    { id: 'agent-2', name: 'Jane', username: 'jane', role: 'engineering', workspace_id: 'ws-1' },
  ];

  beforeEach(() => {
    resetStore();
  });

  test('recalls a user preference in a later runtime bundle', async () => {
    const db = createDb(agents);

    await extractConversationMemories({
      db,
      workspaceId: 'ws-1',
      agent: agents[0],
      userMessage: 'My name is Alex and I prefer concise answers in French.',
      assistantMessage: 'Understood, I will answer briefly in French.',
      userName: 'Alex',
    });

    const bundle = await buildRuntimeMemoryBundle({
      db,
      workspaceId: 'ws-1',
      agent: agents[0],
      query: 'concise answers in French',
      runtime: 'chat',
    });

    expect(bundle.memories.some((memory) => memory.type === 'user_profile' && /French/i.test(memory.text))).toBe(true);
  });

  test('promotes a repeated local decision and shares it with another agent of the same role', async () => {
    const db = createDb(agents);

    await extractConversationMemories({
      db,
      workspaceId: 'ws-1',
      agent: agents[0],
      userMessage: 'On utilise toujours Codex pour les taches engineering.',
      assistantMessage: 'Compris, always use Codex for engineering tasks.',
      userName: 'Alex',
    });

    await extractConversationMemories({
      db,
      workspaceId: 'ws-1',
      agent: agents[0],
      userMessage: 'Rappel: on utilise toujours Codex pour les taches engineering.',
      assistantMessage: 'Compris, always use Codex for engineering tasks.',
      userName: 'Alex',
    });

    const bundle = await buildRuntimeMemoryBundle({
      db,
      workspaceId: 'ws-1',
      agent: agents[1],
      query: 'engineering tasks codex standard',
      runtime: 'task',
    });

    expect(bundle.sections.template.some((memory) => /Codex/i.test(memory.text))).toBe(true);
  });

  test('hides internal memories from dashboard lists and removes them during maintenance', async () => {
    const db = createDb(agents);

    await rememberScopedMemory({
      db,
      workspaceId: 'ws-1',
      agent: agents[0],
      scopeKey: 'instance',
      text: 'Conversation note: temporary tool chatter',
      type: 'action_log',
      importance: 0.1,
      visibility: 'internal',
      source: 'test',
      metadata: { expires_at: '2020-01-01T00:00:00.000Z' },
    });

    const listed = await listAgentMemories({
      db,
      workspaceId: 'ws-1',
      agentIdOrUsername: 'agent-1',
      includeInternal: false,
      includeExpired: true,
    });

    expect(listed.memories).toHaveLength(0);

    const maintenance = await runWorkspaceMemoryMaintenance(db, 'ws-1');

    expect(maintenance.deleted).toBeGreaterThan(0);
    expect(mockMemoryStore.some((memory) => /^\[DELETED memory /.test(memory.text))).toBe(true);
  });
});
