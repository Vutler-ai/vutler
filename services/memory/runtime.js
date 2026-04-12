'use strict';

const { createSniparaGateway } = require('../snipara/gateway');
const { buildRuntimeMemoryBundle } = require('../sniparaMemoryService');
const { listRuntimeContinuitySummaries } = require('../sessionContinuityService');
const { buildMemoryPrompt } = require('./promptBuilder');
const { resolveMemoryMode } = require('./modeResolver');
const { createMemoryWritePipeline } = require('./writePipeline');

class MemoryRuntimeService {
  constructor({ gatewayFactory = createSniparaGateway, writePipeline = createMemoryWritePipeline() } = {}) {
    this.gatewayFactory = gatewayFactory;
    this.writePipeline = writePipeline;
  }

  async preparePromptContext({
    db,
    workspaceId,
    agent,
    humanContext = null,
    query = '',
    runtime = 'chat',
    includeSharedContext = true,
    includeSummaries = runtime === 'chat' || runtime === 'task',
    summaryArgs = null,
    budgetTokens = 1200,
  } = {}) {
    const mode = await resolveMemoryMode({ db, workspaceId, agent });
    if (!mode.inject) {
      return {
        mode,
        prompt: '',
        memories: [],
        stats: {
          runtime,
          query,
          selected: { total: 0, human: 0, human_agent: 0, instance: 0, template: 0, global: 0 },
          tokens: 0,
        },
        sections: { human: [], human_agent: [], instance: [], template: [], global: [] },
      };
    }

    const gateway = this.gatewayFactory({ db, workspaceId });
    const summariesPromise = !includeSummaries
      ? Promise.resolve([])
      : summaryArgs
        ? gateway.summaries.list(summaryArgs).catch(() => [])
        : listRuntimeContinuitySummaries({ db, workspaceId, agent })
          .catch(() => (
            gateway.summaries.list({}).catch(() => [])
          ));

    const [runtimeBundle, sharedContext, summaries] = await Promise.all([
      buildRuntimeMemoryBundle({ db, workspaceId, agent, humanContext, query, runtime }).catch(() => ({
        prompt: '',
        memories: [],
        stats: {
          runtime,
          query,
          selected: { total: 0, human: 0, human_agent: 0, instance: 0, template: 0, global: 0 },
        },
        sections: { human: [], human_agent: [], instance: [], template: [], global: [] },
      })),
      includeSharedContext ? gateway.knowledge.sharedContext({}).catch(() => '') : Promise.resolve(''),
      summariesPromise,
    ]);

    const prompt = buildMemoryPrompt({
      sharedContext: typeof sharedContext === 'string' ? sharedContext : '',
      humanMemories: runtimeBundle.sections?.human || [],
      humanAgentMemories: runtimeBundle.sections?.human_agent || [],
      instanceMemories: runtimeBundle.sections?.instance || [],
      templateMemories: runtimeBundle.sections?.template || [],
      globalMemories: runtimeBundle.sections?.global || [],
      summaries: Array.isArray(summaries) ? summaries : [],
      budgetTokens,
    });

    return {
      mode,
      prompt: prompt.prompt,
      memories: runtimeBundle.memories || [],
      stats: {
        ...(runtimeBundle.stats || {}),
        tokens: prompt.tokens,
      },
      sections: runtimeBundle.sections || { instance: [], template: [], global: [] },
    };
  }

  async recordConversation({
    db,
    workspaceId,
    agent,
    userMessage,
    assistantMessage,
    userId,
    userName,
  } = {}) {
    const mode = await resolveMemoryMode({ db, workspaceId, agent });
    if (!mode.write) return [];
    return this.writePipeline.recordConversation({
      db,
      workspaceId,
      agent,
      userMessage,
      assistantMessage,
      userId,
      userName,
    });
  }

  async recordTaskEpisode({
    db,
    workspaceId,
    agent,
    task,
    response,
  } = {}) {
    const mode = await resolveMemoryMode({ db, workspaceId, agent });
    if (!mode.write) return [];
    return this.writePipeline.recordTaskEpisode({
      db,
      workspaceId,
      agent,
      task,
      response,
    });
  }

  async recordToolObservation({
    db,
    workspaceId,
    agent,
    toolName,
    args,
    result,
  } = {}) {
    const mode = await resolveMemoryMode({ db, workspaceId, agent });
    if (!mode.write) return null;
    return this.writePipeline.recordToolObservation({
      db,
      workspaceId,
      agent,
      toolName,
      args,
      result,
    });
  }
}

function createMemoryRuntimeService(options) {
  return new MemoryRuntimeService(options);
}

module.exports = {
  MemoryRuntimeService,
  createMemoryRuntimeService,
};
