/**
 * Chat Runtime v3 — Snipara-connected agent message processor
 */
'use strict';

const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');
const { getSwarmCoordinator } = require('../../../services/swarmCoordinator');
const { insertChatMessage } = require('../../../services/chatMessages');
const { createMemoryRuntimeService } = require('../../../services/memory/runtime');
const { createSniparaGateway } = require('../../../services/snipara/gateway');
const { resolveAgentRecord } = require('../../../services/sniparaMemoryService');
const { resolveOrchestrationCapabilities } = require('../../../services/orchestrationCapabilityResolver');
const {
  resolveAgentEmailProvisioning,
  agentHasProvisionedEmail,
} = require('../../../services/agentProvisioningService');
const {
  buildOverlaySuggestionMessages,
  filterExecutionOverlay,
  isOverlayEmpty,
} = require('../../../services/executionOverlayService');

const SCHEMA = 'tenant_vutler';
const POLL_INTERVAL = 3000;
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const SNIPARA_TIMEOUT_MS = 15_000;
const MAX_POLL_INTERVAL = 60_000;
const MAX_AUTO_RETRIES = 5;
const RETRY_BACKOFF_MS = [5000, 15_000, 60_000, 300_000];
const ERROR_LOG_THROTTLE = 30_000;
const SOUL_CACHE_TTL = 300_000;
const AGENT_CACHE_TTL = 60_000;
const DIRECT_EMAIL_SEND_PATTERNS = [
  /\bsend\b/i,
  /\breply\b/i,
  /\bforward\b/i,
  /\benvo(?:ie|ies|ient|yer|yez|yons|yaient|yant)\b/i,
  /\brépond(?:s|re)?\b/i,
  /\brepond(?:s|re)?\b/i,
  /\btransf(?:e|è)re(?:r)?\b/i,
  /\bmail(?:e|er)?\b/i,
];
const DRAFT_EMAIL_PATTERNS = [
  /\bdraft\b/i,
  /\bbrouillon\b/i,
  /\bprépare\b/i,
  /\bprepare\b/i,
  /\brédige\b/i,
  /\bredige\b/i,
  /\breview\b/i,
  /\brelecture\b/i,
];
const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

let running = false;
let pollInterval = POLL_INTERVAL;
let consecutiveErrors = 0;
let lastErrorMessage = null;
let lastErrorLogTime = 0;
let processingColumnsAvailable = true;
let attachmentsColumnAvailable = true;

const soulCache = new Map();
const agentCache = new Map();
const memoryRuntime = createMemoryRuntimeService();

function normalizeWorkspaceId(workspaceId) {
  const value = typeof workspaceId === 'string' ? workspaceId.trim() : workspaceId;
  if (value) return value;
  throw new Error('workspaceId is required for chat runtime operations');
}

function getSoulCacheKey(agent, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId || agent?.workspace_id);
  const agentName = agent?.username || String(agent?.name || '').toLowerCase() || String(agent?.id || 'unknown-agent');
  return `${ws}:${agentName}`;
}

function buildHumanContext(message = {}) {
  const id = String(message.sender_id || '').trim() || null;
  const name = String(message.sender_name || '').trim() || null;
  if (!id && !name) return null;
  return { id, name };
}

function buildChatMemoryQuery(message = {}, history = [], humanContext = null) {
  const recentUserText = history
    .filter((entry) => entry && entry.role === 'user')
    .slice(-3)
    .map((entry) => entry.content)
    .filter(Boolean)
    .join('\n');
  const humanName = humanContext?.name ? `User ${humanContext.name}` : 'Current user';
  return [
    humanName,
    'preferences language timezone style goals current context',
    String(message.content || '').trim(),
    recentUserText,
  ].filter(Boolean).join('\n').trim();
}

async function hydrateAgent(agent, workspaceId) {
  if (!agent) return agent;
  const ws = normalizeWorkspaceId(workspaceId || agent.workspace_id);
  const agentRef = agent.id || agent.username || agent.agent_id;
  if (!agentRef) return { ...agent, workspace_id: ws };

  try {
    return await resolveAgentRecord(pool, ws, agentRef, { ...agent, workspace_id: ws });
  } catch (_) {
    return { ...agent, workspace_id: ws };
  }
}

function getRetryDelayMs(attempts) {
  if (!attempts || attempts <= 0) return RETRY_BACKOFF_MS[0];
  return RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
}

function isMissingColumnError(err) {
  return /processing_state|processing_attempts|processing_started_at|next_retry_at|last_error/i.test(String(err?.message || ''));
}

function isMissingAttachmentsColumnError(err) {
  return /attachments/i.test(String(err?.message || ''));
}

function isTimeoutError(err) {
  return err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message || ''));
}

function buildFailureMessage(err) {
  if (isTimeoutError(err)) return 'Timeout while waiting for external agent services';
  return String(err?.message || err || 'Unknown error').slice(0, 4000);
}

async function sniparaCall(toolName, args = {}, workspaceId) {
  const gateway = createSniparaGateway({ db: pool, workspaceId });
  const config = await gateway.resolveConfig();
  if (!config.configured) {
    console.warn('[ChatRuntime] No SNIPARA_API_KEY — skipping Snipara call');
    return null;
  }

  try {
    return await gateway.call(toolName, args, { timeoutMs: SNIPARA_TIMEOUT_MS });
  } catch (err) {
    console.error(`[ChatRuntime] Snipara ${toolName} failed:`, err.message);
    return null;
  }
}

async function loadAgents(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const cached = agentCache.get(ws);
  const now = Date.now();
  if (cached && (now - cached.time) < AGENT_CACHE_TTL) return cached.rows;

  const result = await pool.query(
    `SELECT id, name, username, email, role, model, provider, system_prompt, temperature, max_tokens, status, workspace_id, capabilities
     FROM ${SCHEMA}.agents
     WHERE workspace_id = $1 AND COALESCE(status, 'online') IN ('online', 'active')`,
    [ws]
  );

  agentCache.set(ws, { rows: result.rows, time: now });
  return result.rows;
}

async function getChannelAgents(channelId, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const result = await pool.query(
    `SELECT cm.user_id, cm.role AS channel_role,
            a.id, a.name, a.username, a.email, a.role, a.model, a.provider, a.system_prompt,
            a.temperature, a.max_tokens, a.workspace_id, a.capabilities
     FROM ${SCHEMA}.chat_channel_members cm
     JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id OR a.username = cm.user_id
     WHERE cm.channel_id = $1 AND a.workspace_id = $2`,
    [channelId, ws]
  );
  return result.rows;
}

function findMentionedAgent(content, agents) {
  if (!content) return null;
  const lower = String(content).toLowerCase();
  return agents.find((agent) => {
    const username = agent.username ? `@${String(agent.username).toLowerCase()}` : null;
    const name = agent.name ? `@${String(agent.name).toLowerCase()}` : null;
    return (username && lower.includes(username)) || (name && lower.includes(name));
  }) || null;
}

function findJarvisAgent(agents = []) {
  return agents.find((agent) => {
    const username = String(agent.username || '').toLowerCase();
    const name = String(agent.name || '').toLowerCase();
    return username === 'jarvis' || name === 'jarvis';
  }) || null;
}

function findSingleNonJarvisAgent(agents = []) {
  const nonJarvisAgents = agents.filter((agent) => {
    const username = String(agent.username || '').toLowerCase();
    const name = String(agent.name || '').toLowerCase();
    return username !== 'jarvis' && name !== 'jarvis';
  });
  return nonJarvisAgents.length === 1 ? nonJarvisAgents[0] : null;
}

function sortAgentsDeterministically(agents = []) {
  return [...agents].sort((left, right) => {
    const leftKey = `${String(left.name || '').toLowerCase()}|${String(left.username || '').toLowerCase()}|${String(left.id || '')}`;
    const rightKey = `${String(right.name || '').toLowerCase()}|${String(right.username || '').toLowerCase()}|${String(right.id || '')}`;
    return leftKey.localeCompare(rightKey);
  });
}

function resolveRequestedAgent(message, channelAgents = []) {
  if (!Array.isArray(channelAgents) || channelAgents.length === 0) return null;

  const explicitRequested = message?.requested_agent_id
    ? channelAgents.find((agent) => String(agent.id) === String(message.requested_agent_id) || String(agent.username || '') === String(message.requested_agent_id))
    : null;
  if (explicitRequested) return { agent: explicitRequested, reason: 'explicit' };

  const mentioned = findMentionedAgent(message?.content, channelAgents);
  if (mentioned) return { agent: mentioned, reason: 'mention' };

  if (channelAgents.length === 1) {
    return { agent: channelAgents[0], reason: 'single_channel_agent' };
  }

  const jarvis = findJarvisAgent(channelAgents);
  if (jarvis) return { agent: jarvis, reason: 'jarvis_fallback' };

  return { agent: sortAgentsDeterministically(channelAgents)[0], reason: 'deterministic_fallback' };
}

function shouldBypassSwarmRouting(resolution) {
  const reason = String(resolution?.reason || '');
  return reason === 'explicit' || reason === 'mention' || reason === 'single_channel_agent';
}

function analyzeEmailIntent(message = '') {
  const text = String(message || '').trim();
  if (!text) {
    return {
      hasExplicitRecipient: false,
      directSend: false,
      draftOnly: false,
    };
  }

  const draftOnly = DRAFT_EMAIL_PATTERNS.some((pattern) => pattern.test(text));
  const directSend = !draftOnly && DIRECT_EMAIL_SEND_PATTERNS.some((pattern) => pattern.test(text));

  return {
    hasExplicitRecipient: EMAIL_ADDRESS_PATTERN.test(text),
    directSend,
    draftOnly,
  };
}

function resolveDirectEmailTargetAgent(resolution, targetAgent, channelAgents = [], allWorkspaceAgents = []) {
  if (!targetAgent) return null;
  if (String(resolution?.reason || '') !== 'jarvis_fallback') return targetAgent;

  const singleNonJarvis = findSingleNonJarvisAgent(channelAgents);
  if (!singleNonJarvis) return targetAgent;

  return allWorkspaceAgents.find((agent) =>
    String(agent.id || '') === String(singleNonJarvis.id || '')
      || String(agent.username || '').toLowerCase() === String(singleNonJarvis.username || '').toLowerCase()
  ) || singleNonJarvis;
}

function appendPlacementInstruction(prompt, instruction) {
  const basePrompt = String(prompt || '');
  const extraInstruction = String(instruction || '').trim();
  if (!extraInstruction || basePrompt.includes(extraInstruction)) return basePrompt;
  return `${basePrompt}\n\n## Workspace Tools\n${extraInstruction}\n`;
}

async function getRecentHistory(channelId, channelAgents = [], workspaceId, limit = 10) {
  const ws = normalizeWorkspaceId(workspaceId);
  let result;

  if (attachmentsColumnAvailable !== false) {
    try {
      result = await pool.query(
        `SELECT id, sender_id, sender_name, content, attachments
         FROM ${SCHEMA}.chat_messages
         WHERE channel_id = $1 AND workspace_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [channelId, ws, limit]
      );
    } catch (err) {
      if (!isMissingAttachmentsColumnError(err)) throw err;
      attachmentsColumnAvailable = false;
    }
  }

  if (!result) {
    result = await pool.query(
      `SELECT id, sender_id, sender_name, content, NULL::jsonb AS attachments
       FROM ${SCHEMA}.chat_messages
       WHERE channel_id = $1 AND workspace_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [channelId, ws, limit]
    );
  }

  const agentIds = new Set(channelAgents.map((agent) => String(agent.id)));
  const agentUsernames = new Set(channelAgents.map((agent) => String(agent.username || '').toLowerCase()).filter(Boolean));

  return result.rows.reverse().map((message) => {
    let attachments = [];
    if (Array.isArray(message.attachments)) {
      attachments = message.attachments;
    } else if (typeof message.attachments === 'string') {
      try {
        attachments = JSON.parse(message.attachments);
      } catch (_) {
        attachments = [];
      }
    }
    const attachmentBlock = attachments.length > 0
      ? `\nAttachments:\n${attachments.map((file) => `- ${file.filename || file.name || 'file'} (${file.mime || file.mimeType || 'application/octet-stream'}) at ${file.path || file.url || 'unknown path'}`).join('\n')}`
      : '';
    const senderId = String(message.sender_id || '');
    const senderIdLower = senderId.toLowerCase();
    const isAssistant = agentIds.has(senderId) || agentUsernames.has(senderIdLower);
    const baseContent = `${String(message.content || '')}${attachmentBlock}`.trim();
    return {
      role: isAssistant ? 'assistant' : 'user',
      content: isAssistant ? baseContent : `${message.sender_name || 'User'}: ${baseContent}`
    };
  });
}

async function getAgentSoul(agent) {
  const hydratedAgent = await hydrateAgent(agent, agent?.workspace_id);
  const workspaceId = normalizeWorkspaceId(hydratedAgent.workspace_id);
  const agentName = hydratedAgent.username || String(hydratedAgent.name || '').toLowerCase();
  const cacheKey = getSoulCacheKey(hydratedAgent, workspaceId);
  const now = Date.now();
  const cached = soulCache.get(cacheKey);

  if (cached && (now - cached.time) < SOUL_CACHE_TTL) {
    return cached.soul;
  }

  const context = await sniparaCall('rlm_context_query', {
    query: `${agentName} agent role responsibilities at Starbox Group`,
    max_tokens: 1000
  }, workspaceId);

  let soul = '';
  if (context && String(context).trim()) soul += `## Context\n${context}\n\n`;
  soul += `## Identity\nYou are ${hydratedAgent.name}, an AI agent at Starbox Group.\n`;
  soul += `Your username in the swarm is "${agentName}".\n`;
  soul += 'You work as part of a multi-agent team coordinated by Jarvis.\n';
  soul += 'Respond in the same language as the user (French or English).\n';
  soul += 'Be concise, helpful, and stay in character.\n';
  if (hydratedAgent.system_prompt) soul += `\n## Additional Instructions\n${hydratedAgent.system_prompt}\n`;

  soulCache.set(cacheKey, { soul, time: now });
  return soul;
}

function rememberInteraction(agent, workspaceId, userMessage, agentResponse, humanContext = null) {
  if (String(userMessage || '').length < 20 && String(agentResponse || '').length < 50) return;
  soulCache.delete(getSoulCacheKey(agent, workspaceId));
  memoryRuntime.recordConversation({
    db: pool,
    workspaceId,
    agent,
    userMessage,
    assistantMessage: agentResponse,
    userId: humanContext?.id || null,
    userName: humanContext?.name || null,
  }).catch((err) => {
    console.warn('[ChatRuntime] memory conversation persistence failed:', err.message);
  });
}

async function claimMessage(messageId, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);

  if (processingColumnsAvailable !== false) {
    try {
      const claimed = await pool.query(
        `UPDATE ${SCHEMA}.chat_messages
         SET processing_state = 'processing',
             processing_started_at = NOW(),
             processing_attempts = COALESCE(processing_attempts, 0) + 1
         WHERE id = $1
           AND workspace_id = $2
           AND processing_state IN ('pending', 'failed')
           AND COALESCE(next_retry_at, NOW()) <= NOW()
         RETURNING *`,
        [messageId, ws]
      );
      return claimed.rows[0] || null;
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      processingColumnsAvailable = false;
    }
  }

  const legacy = await pool.query(
    `UPDATE ${SCHEMA}.chat_messages
     SET processed_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND processed_at IS NULL
     RETURNING *`,
    [messageId, ws]
  );
  return legacy.rows[0] || null;
}

async function markProcessed(messageId, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  if (processingColumnsAvailable !== false) {
    try {
      await pool.query(
        `UPDATE ${SCHEMA}.chat_messages
         SET processing_state = 'processed',
             processed_at = NOW(),
             processing_started_at = NULL,
             last_error = NULL,
             next_retry_at = NULL
         WHERE id = $1 AND workspace_id = $2`,
        [messageId, ws]
      );
      return;
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      processingColumnsAvailable = false;
    }
  }

  await pool.query(
    `UPDATE ${SCHEMA}.chat_messages SET processed_at = NOW() WHERE id = $1 AND workspace_id = $2`,
    [messageId, ws]
  );
}

async function markFailed(message, err) {
  const ws = normalizeWorkspaceId(message.workspace_id);
  const attempts = Number(message.processing_attempts || 1);
  const failure = buildFailureMessage(err);
  const terminal = attempts >= MAX_AUTO_RETRIES;

  if (processingColumnsAvailable !== false) {
    try {
      await pool.query(
        `UPDATE ${SCHEMA}.chat_messages
         SET processing_state = CASE WHEN $5 THEN 'processed' ELSE 'failed' END,
             processing_started_at = NULL,
             last_error = $3,
             next_retry_at = $4,
             processed_at = CASE WHEN $5 THEN NOW() ELSE NULL END
         WHERE id = $1 AND workspace_id = $2`,
        [
          message.id,
          ws,
          failure,
          terminal ? null : new Date(Date.now() + getRetryDelayMs(attempts)),
          terminal
        ]
      );
      return { terminal, attempts, error: failure };
    } catch (updateErr) {
      if (!isMissingColumnError(updateErr)) throw updateErr;
      processingColumnsAvailable = false;
    }
  }

  await pool.query(
    `UPDATE ${SCHEMA}.chat_messages SET processed_at = NULL WHERE id = $1 AND workspace_id = $2`,
    [message.id, ws]
  );
  return { terminal: false, attempts, error: failure };
}

async function postTerminalFailure(message, failure) {
  await insertChatMessage(pool, null, SCHEMA, {
    channel_id: message.channel_id,
    sender_id: 'jarvis',
    sender_name: 'Jarvis',
    content: `Je n'ai pas pu traiter ce message apres ${failure.attempts} tentative(s). Erreur: ${failure.error}`,
    message_type: 'text',
    workspace_id: normalizeWorkspaceId(message.workspace_id),
    processed_at: new Date(),
    processing_state: 'processed',
    reply_to_message_id: message.id,
    requested_agent_id: message.requested_agent_id || null,
    display_agent_id: message.display_agent_id || null,
    orchestrated_by: 'jarvis',
    executed_by: 'jarvis',
    metadata: {
      orchestration_status: 'failed',
      failure_attempts: failure.attempts,
      failure_reason: failure.error,
    }
  });
}

async function handleMessage(message) {
  const workspaceId = normalizeWorkspaceId(message.workspace_id);
  const allWorkspaceAgents = await loadAgents(workspaceId);
  let channelAgents = await getChannelAgents(message.channel_id, workspaceId);
  if (channelAgents.length === 0) {
    channelAgents = allWorkspaceAgents;
  }
  if (channelAgents.length === 0 && allWorkspaceAgents.length === 0) {
    throw new Error('No agents available for this workspace');
  }

  try {
    const { isRunbookIntent, parseRunbookFromText } = require('../../../services/runbooks');
    if (isRunbookIntent(message.content)) {
      const runbook = await parseRunbookFromText(message.content).catch(() => null);
      if (runbook && Array.isArray(runbook.steps) && runbook.steps.length >= 2) {
        const stepsPreview = runbook.steps
          .map((step) => `  ${step.order}. ${step.action}${step.target ? ` [vault: ${step.target}]` : ''}`)
          .join('\n');
        const preview =
          'J\'ai detecte un runbook dans ton message.\n\n' +
          `**${runbook.name}**\n${runbook.description ? `${runbook.description}\n` : ''}` +
          `\nEtapes (${runbook.steps.length}) :\n${stepsPreview}\n\n` +
          'Pour lancer l\'execution: `POST /api/v1/runbooks/execute` avec ce runbook, ou confirme ici avec \'yes, execute\'.';

        await insertChatMessage(pool, null, SCHEMA, {
          channel_id: message.channel_id,
          sender_id: 'mike',
          sender_name: 'Mike',
          content: preview,
          message_type: 'text',
          workspace_id: workspaceId,
          processed_at: new Date(),
          processing_state: 'processed',
          reply_to_message_id: message.id,
          requested_agent_id: null,
          display_agent_id: 'mike',
          orchestrated_by: 'jarvis',
          executed_by: 'mike',
          metadata: {
            orchestration_status: 'runbook_preview',
          }
        });
        return;
      }
    }
  } catch (err) {
    console.warn('[ChatRuntime] Runbook detection error (non-blocking):', err.message);
  }

  const resolution = resolveRequestedAgent(message, channelAgents);
  const requestedAgentFromDirectory = resolution?.agent
    ? allWorkspaceAgents.find((agent) => String(agent.id) === String(resolution.agent.id)
      || String(agent.username || '').toLowerCase() === String(resolution.agent.username || '').toLowerCase())
    : null;
  const resolvedTargetAgent = requestedAgentFromDirectory || resolution?.agent;
  if (!resolvedTargetAgent) {
    throw new Error('Unable to resolve requested agent');
  }

  const emailIntent = analyzeEmailIntent(message.content);
  const targetAgent = emailIntent.directSend && emailIntent.hasExplicitRecipient
    ? (resolveDirectEmailTargetAgent(
        resolution,
        resolvedTargetAgent,
        channelAgents,
        allWorkspaceAgents
      ) || resolvedTargetAgent)
    : resolvedTargetAgent;
  const needsDirectEmailBypassCheck = emailIntent.directSend
    && emailIntent.hasExplicitRecipient;
  const targetAgentEmailProvisioning = needsDirectEmailBypassCheck
    ? await resolveAgentEmailProvisioning({
        workspaceId,
        agentId: targetAgent.id || null,
        agent: targetAgent,
        db: pool,
      }).catch(() => ({
        provisioned: false,
        email: null,
        source: 'none',
      }))
    : null;
  const bypassSwarmForDirectEmail = emailIntent.directSend
    && emailIntent.hasExplicitRecipient
    && agentHasProvisionedEmail(targetAgent, targetAgentEmailProvisioning);

  const swarmCoordinator = getSwarmCoordinator();
  const history = await getRecentHistory(message.channel_id, channelAgents, workspaceId, 10);
  const orchestrationDefaults = {
    domains: [],
    overlayProviders: [],
    overlaySkillKeys: [],
    overlayToolCapabilities: [],
    primaryDelegate: null,
    delegatedAgents: [],
    reasons: [],
    availability: null,
    unavailableDomains: [],
    workspacePressure: null,
    specializationProfile: null,
    recommendations: [],
  };
  const resolvedOrchestration = await resolveOrchestrationCapabilities({
    workspaceId,
    messageText: message.content,
    history,
    requestedAgent: targetAgent,
    availableAgents: allWorkspaceAgents.length > 0 ? allWorkspaceAgents : channelAgents,
    db: pool,
  }).catch(() => orchestrationDefaults);
  const orchestration = bypassSwarmForDirectEmail
    ? {
        ...orchestrationDefaults,
        ...resolvedOrchestration,
        domains: resolvedOrchestration.domains || ['email'],
        primaryDelegate: null,
        delegatedAgents: [],
      }
    : resolvedOrchestration;

  if (!bypassSwarmForDirectEmail) {
    try {
      const routing = await swarmCoordinator.analyzeAndRoute(
        {
          ...message,
          requested_agent_id: String(targetAgent.id),
        },
        allWorkspaceAgents.length > 0 ? allWorkspaceAgents : channelAgents,
        workspaceId,
        {
          history,
          preferredAgentId: orchestration.primaryDelegate?.agentRef || String(targetAgent.id),
        }
      );
      if (routing?.routed) {
        await insertChatMessage(pool, null, SCHEMA, {
          channel_id: message.channel_id,
          sender_id: 'jarvis',
          sender_name: 'Jarvis',
          content: `Bien recu. J'orchestre l'equipe et on lance l'execution. (${routing.created_count} tache(s) distribuee(s))`,
          message_type: 'text',
          workspace_id: workspaceId,
          processed_at: new Date(),
          processing_state: 'processed',
          reply_to_message_id: message.id,
          requested_agent_id: String(targetAgent.id),
          display_agent_id: 'jarvis',
          orchestrated_by: 'jarvis',
          executed_by: 'jarvis',
          metadata: {
            orchestration_status: 'routed',
            created_task_count: routing.created_count || 0,
            routed_domains: orchestration.domains || [],
            delegated_agents: orchestration.delegatedAgents || [],
            available_runtime_providers: orchestration.availability?.availableProviders || [],
            unavailable_runtime_providers: orchestration.availability?.unavailableProviders || [],
            unavailable_domains: orchestration.unavailableDomains || [],
            workspace_agent_pressure: orchestration.workspacePressure || null,
            specialization_profile: orchestration.specializationProfile || null,
            agent_recommendations: orchestration.recommendations || [],
          }
        });
        return;
      }
    } catch (err) {
      console.error('[ChatRuntime] Swarm analyzeAndRoute failed:', err.message);
    }
  }

  const delegatedAgent = orchestration.primaryDelegate?.agentId
    ? (allWorkspaceAgents.find((agent) => String(agent.id) === String(orchestration.primaryDelegate.agentId))
      || allWorkspaceAgents.find((agent) => String(agent.username || '') === String(orchestration.primaryDelegate.agentRef || '')))
    : null;
  const respondingAgent = delegatedAgent || targetAgent;
  const hydratedTargetAgent = await hydrateAgent(respondingAgent, workspaceId);
  const executionAgent = typeof swarmCoordinator.resolveAgentExecutionContext === 'function'
    ? await swarmCoordinator.resolveAgentExecutionContext(hydratedTargetAgent, workspaceId)
    : hydratedTargetAgent;
  const desiredExecutionOverlay = {
    skillKeys: orchestration.overlaySkillKeys || [],
    integrationProviders: orchestration.overlayProviders || [],
    toolCapabilities: orchestration.overlayToolCapabilities || [],
  };
  const filteredExecutionOverlay = await filterExecutionOverlay({
    workspaceId,
    agent: executionAgent,
    overlay: desiredExecutionOverlay,
    db: pool,
  }).catch(() => desiredExecutionOverlay);
  executionAgent.execution_overlay = isOverlayEmpty(filteredExecutionOverlay)
    ? {}
    : {
        skillKeys: filteredExecutionOverlay.skillKeys || [],
        integrationProviders: filteredExecutionOverlay.integrationProviders || [],
        toolCapabilities: filteredExecutionOverlay.toolCapabilities || [],
      };
  const effectiveHistory = !message.id
    ? [
      ...history,
      {
        role: 'user',
        content: `${message.sender_name || 'User'}: ${String(message.content || '').trim()}`,
      },
    ]
    : history;
  const humanContext = buildHumanContext(message);
  const memoryBundle = await memoryRuntime.preparePromptContext({
    db: pool,
    workspaceId,
    agent: executionAgent,
    humanContext,
    query: buildChatMemoryQuery(message, effectiveHistory, humanContext),
    runtime: 'chat',
    includeSummaries: true,
  }).catch(() => ({ prompt: '', stats: null, mode: null }));
  if (memoryBundle.stats) {
    console.info('[ChatRuntime] memory bundle', {
      agent: executionAgent.username || executionAgent.id,
      workspaceId,
      humanId: humanContext?.id || null,
      mode: memoryBundle.mode?.mode || null,
      mode_source: memoryBundle.mode?.source || null,
      runtime: memoryBundle.stats.runtime,
      selected: memoryBundle.stats.selected,
      tokens: memoryBundle.stats.tokens || 0,
    });
  }
  const baseSoul = await getAgentSoul(executionAgent);
  const soul = appendPlacementInstruction(
    memoryBundle.prompt
      ? `${baseSoul}\n\n${memoryBundle.prompt}`
      : baseSoul,
    executionAgent.workspaceToolPolicy?.placementInstruction
  );

  const response = await llmChat(
    {
      id: executionAgent.id,
      email: executionAgent.email || null,
      model: executionAgent.model,
      provider: executionAgent.provider,
      capabilities: Array.isArray(executionAgent.capabilities) ? executionAgent.capabilities : [],
      system_prompt: soul,
      temperature: parseFloat(executionAgent.temperature) || 0.7,
      max_tokens: executionAgent.max_tokens || 4096,
      workspace_id: workspaceId || executionAgent.workspace_id
    },
    effectiveHistory,
    pool,
    {
      chatActionContext: {
        workspaceId,
        messageId: message.id,
        channelId: message.channel_id,
        requestedAgentId: String(targetAgent.id),
        displayAgentId: String(executionAgent.id),
        orchestratedBy: 'jarvis',
      },
      humanContext,
    }
  );

  await insertChatMessage(pool, null, SCHEMA, {
    channel_id: message.channel_id,
    sender_id: String(executionAgent.id),
    sender_name: executionAgent.name,
    content: response.content,
    message_type: 'text',
    workspace_id: workspaceId,
    processed_at: new Date(),
    processing_state: 'processed',
    reply_to_message_id: message.id,
    requested_agent_id: String(targetAgent.id),
    display_agent_id: String(executionAgent.id),
    orchestrated_by: 'jarvis',
    executed_by: String(executionAgent.id),
    metadata: {
      orchestration_status: 'completed',
      facade_agent_id: String(targetAgent.id),
      facade_agent_username: targetAgent.username || null,
      requested_agent_username: executionAgent.username || null,
      requested_agent_reason: resolution?.reason || 'unknown',
      orchestration_domains: orchestration.domains || [],
      orchestration_overlay_skills: executionAgent.execution_overlay.skillKeys || [],
      orchestration_overlay_providers: executionAgent.execution_overlay.integrationProviders || [],
      orchestration_overlay_tool_capabilities: executionAgent.execution_overlay.toolCapabilities || [],
      orchestration_blocked_overlay_providers: filteredExecutionOverlay.blocked?.providers || [],
      orchestration_blocked_overlay_skills: filteredExecutionOverlay.blocked?.skills || [],
      orchestration_blocked_overlay_tool_capabilities: filteredExecutionOverlay.blocked?.toolCapabilities || [],
      orchestration_autonomy_suggestions: buildOverlaySuggestionMessages(filteredExecutionOverlay),
      orchestration_autonomy_insights: filteredExecutionOverlay.insights?.recurring_blockers || [],
      orchestration_autonomy_recommendation_summary: filteredExecutionOverlay.insights?.recommendation_summary || null,
      orchestration_autonomy_recurring_blocker: filteredExecutionOverlay.insights?.primary_blocker?.label || null,
      orchestration_autonomy_escalation_recommended: filteredExecutionOverlay.insights?.escalation_recommended === true,
      orchestration_delegated_agents: orchestration.delegatedAgents || [],
      available_runtime_providers: orchestration.availability?.availableProviders || [],
      unavailable_runtime_providers: orchestration.availability?.unavailableProviders || [],
      unavailable_domains: orchestration.unavailableDomains || [],
      workspace_agent_pressure: orchestration.workspacePressure || null,
      specialization_profile: orchestration.specializationProfile || null,
      agent_recommendations: orchestration.recommendations || [],
      llm_provider: response.provider || null,
      llm_model: response.model || null,
      input_tokens: response.usage?.input_tokens || null,
      output_tokens: response.usage?.output_tokens || null,
      resource_artifacts: response.resource_artifacts || [],
    }
  });

  rememberInteraction(executionAgent, workspaceId, message.content, response.content, humanContext);
}

async function processMessageById(messageId, workspaceId) {
  const claimed = await claimMessage(messageId, workspaceId);
  if (!claimed) return null;

  try {
    await handleMessage(claimed);
    await markProcessed(claimed.id, claimed.workspace_id);
    return { ok: true };
  } catch (err) {
    const failure = await markFailed(claimed, err);
    if (failure.terminal) {
      await postTerminalFailure(claimed, failure).catch((postErr) => {
        console.error('[ChatRuntime] Failed to publish terminal failure:', postErr.message);
      });
    }
    throw err;
  }
}

async function processMessage(message) {
  if (message?.id) {
    return processMessageById(message.id, message.workspace_id);
  }
  return handleMessage({ ...message, workspace_id: normalizeWorkspaceId(message?.workspace_id) });
}

async function pollPendingMessages() {
  if (processingColumnsAvailable !== false) {
    try {
      const result = await pool.query(
        `SELECT m.id, m.workspace_id
         FROM ${SCHEMA}.chat_messages m
         WHERE m.processing_state IN ('pending', 'failed')
           AND COALESCE(m.next_retry_at, NOW()) <= NOW()
           AND m.created_at > NOW() - INTERVAL '1 day'
           AND NOT EXISTS (
             SELECT 1
             FROM ${SCHEMA}.agents a
             WHERE a.workspace_id = m.workspace_id
               AND (a.id::text = m.sender_id OR LOWER(a.username) = LOWER(m.sender_id))
           )
         ORDER BY m.created_at ASC
         LIMIT 10`,
        []
      );
      return result.rows;
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      processingColumnsAvailable = false;
    }
  }

  const legacy = await pool.query(
    `SELECT m.id, m.workspace_id
     FROM ${SCHEMA}.chat_messages m
     WHERE m.processed_at IS NULL
       AND m.created_at > NOW() - INTERVAL '1 day'
       AND NOT EXISTS (
         SELECT 1
         FROM ${SCHEMA}.agents a
         WHERE a.workspace_id = m.workspace_id
           AND (a.id::text = m.sender_id OR LOWER(a.username) = LOWER(m.sender_id))
       )
     ORDER BY m.created_at ASC
     LIMIT 10`,
    []
  );
  return legacy.rows;
}

async function pollOnce() {
  try {
    const rows = await pollPendingMessages();
    for (const row of rows) {
      try {
        await processMessageById(row.id, row.workspace_id);
      } catch (err) {
        console.error(`[ChatRuntime] Error processing message ${row.id}:`, err.message);
      }
    }

    if (consecutiveErrors > 0) {
      console.log('[ChatRuntime] DB connection restored — resuming normal polling');
    }
    consecutiveErrors = 0;
    lastErrorMessage = null;
    lastErrorLogTime = 0;
    pollInterval = POLL_INTERVAL;
  } catch (err) {
    consecutiveErrors += 1;
    const now = Date.now();
    const sameError = err.message === lastErrorMessage;
    const throttled = sameError && (now - lastErrorLogTime) < ERROR_LOG_THROTTLE;

    if (!throttled) {
      console.error('[ChatRuntime] Poll error:', err.message);
      lastErrorMessage = err.message;
      lastErrorLogTime = now;
    }

    pollInterval = Math.min(Math.max(POLL_INTERVAL * consecutiveErrors, POLL_INTERVAL), MAX_POLL_INTERVAL);
  }
}

function start() {
  if (running) return;
  running = true;
  console.log(`[ChatRuntime] Started v3 — polling every ${POLL_INTERVAL}ms`);

  const tick = async () => {
    if (!running) return;
    await pollOnce();
    setTimeout(tick, pollInterval);
  };

  setTimeout(tick, 5000);
}

function stop() {
  running = false;
  console.log('[ChatRuntime] Stopped');
}

module.exports = {
  start,
  stop,
  processMessage,
  processMessageById,
  loadAgents,
  getChannelAgents,
  getRecentHistory,
  _test: {
    getRetryDelayMs,
    buildFailureMessage,
    claimMessage,
    markFailed,
    markProcessed,
    handleMessage,
    pollOnce,
    normalizeWorkspaceId,
    resolveRequestedAgent,
    findJarvisAgent,
    sortAgentsDeterministically,
  }
};
