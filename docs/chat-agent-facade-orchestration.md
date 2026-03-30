# Chat Agent Facade with Central Orchestration

## Goal

Allow users to talk to any visible agent directly in chat while keeping orchestration centralized behind the scenes.

This model must support:

- direct chat with `Jarvis`
- direct chat with a specialist agent such as `Mike`, `Andrea`, or `Luna`
- the same backend orchestration path for `chat`, `tasks`, `email`, `drive`, `calendar`, and `memory`
- replies that come back signed by the requested agent, even when the execution path was coordinated centrally

## Core Decision

Separate:

- `conversation identity`
- `execution orchestration`

The visible agent in the thread is the `conversation identity`.
The internal planner/router is the `execution orchestrator`.

Default rule:

- every inbound user command enters one orchestration pipeline
- the pipeline may be coordinated by `Jarvis`
- the final answer may still be emitted as the requested agent

Example:

1. User opens a DM with `Andrea`
2. User asks: "Check the latest legal emails, create a task, and block time on the calendar"
3. The message enters the central orchestration engine
4. The engine resolves intent, permissions, context, tools, and delegation
5. `Andrea` remains the responder of record in the thread
6. Any internal coordination with `Jarvis` or other agents is hidden unless explicitly surfaced

## Why This Model

This gives the best balance between product flexibility and platform control.

Benefits:

- users can address whichever agent they prefer
- orchestration logic is implemented once
- permissions are enforced once
- audit, retries, memory writes, and tool dispatch are consistent
- specialist agents stay useful as first-class chat entry points

Without this split, Vutler drifts into one of two bad states:

- every agent implements its own partial orchestration logic
- Jarvis becomes a mandatory visible bottleneck for all interactions

## Target Runtime Model

### 1. Agent Facade

Every visible chat agent is an `AgentFacade`.

An `AgentFacade` is responsible for:

- owning the thread identity
- carrying persona and role instructions
- declaring default capabilities
- formatting the final response in that agent's voice

An `AgentFacade` is not responsible for:

- routing tasks
- resolving tools
- direct database/provider calls
- global memory policy

### 2. Central Orchestrator

The orchestrator is the control plane.

Responsibilities:

- classify the user request
- determine whether this is direct answer vs tool use vs task creation vs delegation
- resolve available capabilities for the requested agent
- fetch relevant memory and workspace context
- enforce permissions
- dispatch actions to adapters
- aggregate action results
- decide whether to route through Jarvis, directly execute, or ask another agent

The orchestrator may internally use `Jarvis` as coordinator, but `Jarvis` is not required to be the visible speaker.

### 3. Capability Adapters

Each business surface must be exposed through a stable capability adapter.

Initial adapters:

- `chat`
- `tasks`
- `email`
- `drive`
- `calendar`
- `memory`

Each adapter must provide:

- capability discovery
- permission check
- execution
- structured result
- structured error
- audit payload

### 4. Response Identity Layer

The final message emitted to chat must carry both execution metadata and display metadata.

Display metadata:

- `display_agent_id`
- `display_agent_name`

Execution metadata:

- `requested_agent_id`
- `orchestrated_by`
- `executed_by`
- `delegated_agents`
- `actions`

The UI normally renders only the display identity.
The metadata remains available for audit, admin, and debugging.

### 5. Memory and Context Layer

Snipara memory and context are part of the orchestration path, not an optional side feature.

For chat-first execution, the system must be able to recognize:

- what the user already said
- what the workspace already decided
- what the requested agent already did
- what actions were already executed recently

This layer must support two distinct concerns:

- `context loading before execution`
- `memory persistence after execution`

The orchestration engine must treat memory as structured operational context, not only as long-form text recall.

## Required Message Flow

### Direct specialist chat

1. User sends message to channel containing `Andrea`
2. Chat API stores message as `pending`
3. Orchestrator loads:
   - requested agent facade = `Andrea`
   - workspace context
   - relevant memory
   - available capabilities
4. Orchestrator decides:
   - answer directly
   - run tools
   - create tasks
   - delegate internally
5. Capability adapters execute
6. Final chat reply is stored as a message from `Andrea`

### Direct Jarvis chat

1. User sends message to `Jarvis`
2. Same pipeline
3. Jarvis remains both orchestrator and visible responder unless delegated output should be surfaced

### Multi-agent work request

1. User sends message to `Mike`
2. Orchestrator detects multi-step work
3. Orchestrator uses Jarvis-style planning internally
4. Subtasks are created and assigned
5. Intermediate coordination can go to internal system channels
6. Final summary returns in the original thread from `Mike`

## Phase 1 Backlog

The first implementation phase should unblock chat-first execution without trying to redesign the whole platform at once.

### P0 Security and isolation

1. Scope all calendar reads and writes by `workspace_id`
2. Scope email state mutations (`unread`, `flag`, `move`) by `workspace_id`
3. Enforce direct-message membership checks in REST and WebSocket join paths
4. Remove any random-agent fallback in chat runtime and require explicit requested-agent resolution

### P1 Chat orchestration baseline

1. Add `requested_agent_id`, `display_agent_id`, and `orchestrated_by` metadata to chat execution
2. Introduce a single chat command bus inside `app/custom/services/chatRuntime.js`
3. Route every chat command through one capability resolution path before agent response generation
4. Keep visible authorship on the requested agent by default

### P1 Skill and capability execution

1. Execute advertised `skill_*` tool calls inside `services/llmRouter.js`
2. Normalize skill execution results back into the tool-call loop so the LLM can continue with grounded output
3. Treat skill execution as the Phase 1 bridge between agent prompts and real business capabilities
4. Add capability-level audit metadata for actions triggered by chat

### P1 Memory baseline

1. Add a unified `MemoryContextResolver` read path for chat
2. Load `user`, `workspace`, `agent`, and recent execution facts before response generation
3. Write minimal structured facts after execution: user preferences, user decisions, action logs, created entity refs
4. Keep the taxonomy intentionally small in Phase 1 so orchestration work is not blocked

### P1 Surface adapters

1. Wire `email`, `calendar`, and `drive` adapters behind capability execution
2. Keep write actions gated by existing approval paths where required
3. Resolve credentials from workspace-scoped configuration, not process-global defaults
4. Return structured adapter payloads that can be inserted into chat messages and memory facts

### P2 Platform convergence

1. Unify Snipara namespaces and write policy across chat, tasks, memory UI, and swarm coordination
2. Replace advisory-only integration fallbacks with real connected-provider checks and adapters
3. Extend drive support from Google read paths to the workspace drive layer backed by Exoscale S3
4. Add admin-grade audit, replay, and observability around orchestration actions

## Architecture Rules

### Rule 1: One ingress path

All chat-originated user messages must go through a single orchestration entry point.

Target entry point:

- `app/custom/services/chatRuntime.js`

This service should become the only place that decides:

- who is the requested agent
- whether Jarvis coordination is needed
- which adapters or tasks are invoked

### Rule 2: Requested agent is explicit

Every inbound chat message must resolve a `requested_agent_id`.

Resolution order:

1. DM target agent
2. explicit mention such as `@andrea`
3. channel default agent
4. fallback `Jarvis`

This avoids the current random-agent fallback behavior.

### Rule 3: Tools are capability-driven, not prompt-driven

Agents should not merely be "told" that drive/calendar/email exist.
They must receive executable capabilities.

Required capability set for chat:

- `list_emails`
- `read_email_thread`
- `draft_email`
- `approve_email`
- `search_drive`
- `read_drive_file`
- `create_drive_folder`
- `list_calendar_events`
- `create_calendar_event`
- `update_calendar_event`
- `create_task`
- `update_task`
- `search_memory`
- `remember_fact`

### Rule 4: Internal orchestration does not change visible authorship

If `Andrea` is the requested agent, the default response author is still `Andrea`, even if:

- Jarvis planned the work
- a task executor ran part of the job
- another agent contributed evidence

Override only when the user explicitly asked for a different speaking agent.

### Rule 5: Surface adapters must be workspace-aware

Every adapter must resolve credentials and state from workspace-scoped configuration.

Do not rely on process-global env-only behavior for:

- Snipara
- Postal
- Google integrations
- Exoscale S3

### Rule 6: Chat always loads memory before action

Before the orchestrator decides whether to answer, call tools, or create tasks, it must resolve memory and context for the request.

Minimum read set:

- `user memory`
- `workspace memory`
- `agent memory`
- `recent execution memory`

This is required so the agent can recognize things that were already said, already done, or already created.

### Rule 7: Memory writes must be structured

Post-execution memory writes must not rely only on freeform summaries.

Each write should carry enough structure to support:

- deduplication
- later retrieval
- cross-surface correlation
- audit

Minimum fields:

- `workspace_id`
- `user_id`
- `agent_id`
- `source`
- `entity_type`
- `entity_id`
- `event_type`
- `message_id`
- `timestamp`

## Proposed Components

### ChatCommandBus

New logical component, initially implemented inside `chatRuntime`, later extracted if needed.

Responsibilities:

- receive normalized chat command
- resolve requested agent
- call orchestrator
- persist lifecycle events

Suggested payload:

```js
{
  message_id,
  channel_id,
  workspace_id,
  user_id,
  user_name,
  requested_agent_id,
  requested_agent_name,
  content,
  attachments: [],
  source: 'chat'
}
```

### AgentExecutionContext

Canonical runtime object passed through orchestration.

```js
{
  workspaceId,
  userId,
  channelId,
  requestedAgent,
  displayAgent,
  orchestratorAgent: 'jarvis',
  memoryContext,
  memoryScopes,
  capabilities,
  permissions,
  source: 'chat'
}
```

### CapabilityRegistry

Central registry of executable business capabilities.

It should map:

- capability key
- adapter
- required permissions
- required integrations
- result schema

This should replace the current fragmented mix of:

- prompt-only awareness
- `skill_*` declarations without execution
- Nexus-only tool dispatch

### MemoryContextResolver

New logical component, initially used only by chat and chat-origin task creation.

Responsibilities:

- resolve Snipara scopes consistently
- load relevant memory before orchestration
- normalize recalled context into a stable shape
- persist structured facts after execution

Suggested output:

```js
{
  user: [],
  workspace: [],
  agent: [],
  recentActions: [],
  rawContextText: ''
}
```

### Internal System Channels

Use hidden internal channels for:

- team coordination
- orchestration traces
- escalation
- tool execution logs

Do not overload end-user channels with raw internal chatter.

## Data Model Changes

### chat_messages

Add or standardize metadata fields:

- `display_agent_id`
- `display_agent_name`
- `requested_agent_id`
- `orchestrated_by`
- `executed_by`
- `actions_json`
- `delegation_json`

### tasks.metadata

Standardize orchestration-origin metadata:

- `origin`
- `origin_chat_channel_id`
- `origin_chat_message_id`
- `requested_agent_id`
- `requested_agent_name`
- `orchestrated_by`

### Optional new memory event table

Suggested table: `tenant_vutler.memory_events`

Fields:

- `id`
- `workspace_id`
- `user_id`
- `agent_id`
- `chat_message_id`
- `source`
- `entity_type`
- `entity_id`
- `event_type`
- `payload_json`
- `created_at`

This table does not replace Snipara.
It provides a local operational index for recent actions and exact entity references.

### New audit table

Suggested table: `tenant_vutler.chat_action_runs`

Fields:

- `id`
- `workspace_id`
- `chat_message_id`
- `channel_id`
- `requested_agent_id`
- `orchestrated_by`
- `action_key`
- `adapter`
- `status`
- `input_json`
- `output_json`
- `error_json`
- `started_at`
- `completed_at`

## Mapping to Current Codebase

### `app/custom/services/chatRuntime.js`

Refactor target:

- remove random agent fallback
- resolve requested agent deterministically
- build execution context
- call `MemoryContextResolver` before orchestration
- pass adapter-capable tools into `llmRouter`
- preserve display authorship separately from orchestration

### `services/llmRouter.js`

Required changes:

- execute `skill_*` tools for real
- support capability tools beyond memory/social/Nexus
- accept `executionContext` rather than only bare agent config
- emit structured tool run metadata
- support memory-aware tool execution without fragmenting scope logic

### `services/skills/handlers/IntegrationHandler.js`

Required changes:

- stop hardcoding `_isIntegrationConnected()` to `false`
- wire workspace integration lookup to PostgreSQL
- actually register adapters for `calendar`, `email`, and other surfaces

### `app/custom/services/swarmCoordinator.js`

Role in target model:

- planner and dispatcher for complex work
- hidden coordinator for multi-agent execution
- not mandatory as visible speaker
- write structured execution facts for downstream recall

### `app/custom/services/taskExecutor.js`

Role in target model:

- worker path for asynchronous delegated execution
- return outputs back to original chat thread
- preserve requested/display agent identity
- persist task completion facts usable by future chat context loading

## Rollout Plan

### Phase 1: Make specialist chat real

Scope:

- deterministic requested-agent resolution
- capability registry for chat
- real execution of `skill_*`
- specialist replies remain signed by specialist
- unified `memory read path` for chat
- minimal structured memory writes after chat and chat-origin task execution

Success criteria:

- user can ask `Andrea` about email/calendar/drive/tasks and get real actions, not just descriptive text
- the requested agent can recognize things already said or already done in recent interactions

Phase 1 memory scope:

- load `user memory`
- load `workspace memory`
- load `agent memory`
- load recent action facts
- write minimal facts for:
  - user preferences
  - user decisions
  - created tasks
  - drafted/sent emails
  - created/updated calendar events
  - referenced drive files

Phase 1 explicitly does not try to solve:

- full long-term memory ranking
- memory dedup at platform scale
- template/global promotion workflows
- advanced memory admin UX

### Phase 2: Centralize orchestration metadata

Scope:

- `display_agent` vs `orchestrated_by` metadata
- audit table for chat action runs
- hidden internal coordination channel
- full memory taxonomy and write policy
- unified Snipara namespace policy across chat, tasks, dashboard memory, and task verification
- deduplication and relevance scoring
- local operational memory index
- memory promotion and shared-memory governance

Success criteria:

- every chat-triggered action is traceable end-to-end
- memory behaves consistently across surfaces, not only inside direct chat

### Phase 3: Unify workspace context and memory

Scope:

- workspace-scoped credential resolution
- unified memory namespace policy
- reusable context resolver for `chat/tasks/email/calendar/drive`

Success criteria:

- the same user/project/tool knowledge is accessible consistently regardless of entry surface

## Non-Goals

Not part of this design:

- exposing all internal coordination to end users
- making Jarvis the only visible chat endpoint
- duplicating orchestration logic in every agent prompt
- allowing direct provider access without permission checks

## Recommendation

Adopt:

- `requested agent as facade`
- `Jarvis-style orchestration as control plane`
- `specialist agent as response identity`

Short version:

- users can talk to whoever they want
- the system still orchestrates centrally
- the answer comes back from the agent they asked

This is the right model for Vutler if the product goal is:

- chat-first control
- multi-agent collaboration
- strong tool integration
- consistent memory and auditability
