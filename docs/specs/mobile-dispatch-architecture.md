# Mobile Dispatch Architecture

> **Status:** Draft — 2026-03-27
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** alopez
> **Snipara Plan ID:** plan_4c065bb4
> **Feature Gate:** Paid plans only (cloud sandbox required)

---

## 1. Problem Statement

Vutler agents run in two modes:
- **Online (cloud):** Hosted on Vutler infrastructure, accessible via chat API and WebSocket.
- **Local:** Running on developer machines (Mac/PC) for code production, git operations, and tasks requiring local resources.

**Challenge:** How does a user on a mobile phone communicate with local agents?
Until now, WhatsApp + Jarvis (OpenClaw) was used. We need a native Vutler solution.

**Additional constraint:** Enterprise nexus nodes (cloud VMs) communicate via standard REST APIs — no daemon needed.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MOBILE PHONE                            │
│  Vutler Chat (PWA/App) → REST API + WebSocket              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   VUTLER CLOUD                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Chat API    │  │  Workflow    │  │  Nexus Routing   │  │
│  │  /ws/chat-pro│  │  Mode Scorer │  │  (task→agent)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         ▼                 ▼                    ▼            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SANDBOX WORKSPACE                       │   │
│  │  - Multi-file virtual filesystem per session         │   │
│  │  - Git clone of target repo                          │   │
│  │  - Code execution (JS/Python/Shell)                  │   │
│  │  - Test runner                                       │   │
│  │  - Iterative dev loop (agent ↔ sandbox)              │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │ code.ready event              │
│                             ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           DISPATCH ROUTER                            │   │
│  │  Routes validated code to target:                    │   │
│  │  - Local daemon → WebSocket /ws/chat                 │   │
│  │  - Enterprise nexus → REST webhook                   │   │
│  └──────┬───────────────────────────┬───────────────────┘   │
│         │                           │                       │
└─────────┼───────────────────────────┼───────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────────┐    ┌─────────────────────────────┐
│  LOCAL DAEMON (Mac)  │    │  ENTERPRISE NEXUS NODE      │
│                      │    │                             │
│  - WebSocket client  │    │  - REST endpoint            │
│  - Git pull/checkout │    │  - Webhook receiver         │
│  - File write        │    │  - Container execution      │
│  - Status report     │    │  - API callback on done     │
│  NO code execution   │    │                             │
└──────────────────────┘    └─────────────────────────────┘
```

---

## 3. Workflow Mode Integration

The existing `WorkflowModeSelector` (services/workflowMode.js) maps directly:

| Workflow Mode | Mobile Use Case | Sandbox | Local Daemon |
|---------------|-----------------|---------|--------------|
| **LITE** (score < 2) | Quick command, status check, simple fix | Single execution, no workspace | Git pull only |
| **FULL** (score >= 2) | Multi-file feature, refactor, architecture | Full workspace with git clone | Branch + multi-file sync |

### LITE Flow (quick task from phone)
```
1. User sends message in chat
2. WorkflowModeSelector scores → LITE
3. Agent processes with sandbox single execution
4. Result returned to chat
5. If code change: single file pushed to daemon → git commit
```

### FULL Flow (complex task from phone)
```
1. User sends message in chat
2. WorkflowModeSelector scores → FULL
3. Snipara gatherFullContext() → shared context, memories, plan
4. Agent creates sandbox workspace (git clone + branch)
5. Iterative dev loop in sandbox (code → test → fix → test)
6. On validation: code.ready event
7. Dispatch router sends file bundle to local daemon
8. Daemon: git checkout -b <branch>, write files, commit
9. Agent reports back in chat with diff summary
```

---

## 4. Component Specifications

### 4.1 Sandbox Workspace (Cloud — Enhancement to existing sandbox)

**Current state:** `POST /sandbox/execute` runs stateless single scripts.
**Target state:** Persistent workspace per task with git integration.

```javascript
// New endpoints
POST   /api/v1/sandbox/workspace          // Create workspace (git clone + branch)
GET    /api/v1/sandbox/workspace/:id      // Get workspace state
POST   /api/v1/sandbox/workspace/:id/exec // Execute in workspace context
DELETE /api/v1/sandbox/workspace/:id      // Cleanup

// Workspace object
{
  id: "ws_abc123",
  repo_url: "git@github.com:user/project.git",
  branch: "feature/mobile-fix-123",
  base_branch: "main",
  files_modified: ["src/api/auth.js", "tests/auth.test.js"],
  status: "active" | "validated" | "dispatched" | "closed",
  created_at: "2026-03-27T...",
  agent_id: "mike",
  task_id: "task_xyz"
}
```

**Database:** `tenant_vutler.sandbox_workspaces`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| workspace_id | uuid | FK tenant workspace |
| repo_url | text | Git repo URL |
| branch | text | Working branch |
| base_branch | text | Target branch for merge |
| status | text | active/validated/dispatched/closed |
| agent_id | uuid | FK agent |
| files_snapshot | jsonb | Modified files + content |
| created_at | timestamptz | |
| closed_at | timestamptz | |

### 4.2 Local Daemon (Mac — New component)

**Purpose:** Minimal git-sync agent. NO code execution.

**Tech:** Single Node.js file (~150 lines), runs as launchd service on Mac.

```javascript
// vutler-local-daemon.js — core loop
const WebSocket = require('ws');

const VUTLER_WS = process.env.VUTLER_WS_URL || 'wss://api.vutler.com/ws/chat';
const API_KEY = process.env.VUTLER_LOCAL_TOKEN;
const REPOS_DIR = process.env.VUTLER_REPOS_DIR || '~/Developer';

function connect() {
  const ws = new WebSocket(VUTLER_WS, {
    headers: { 'x-api-key': API_KEY }
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'code.ready':
        await handleCodeReady(msg.payload);
        break;
      case 'git.pull':
        await handleGitPull(msg.payload);
        break;
      case 'status.request':
        ws.send(JSON.stringify({ type: 'status.response', status: 'online' }));
        break;
    }
  });

  ws.on('close', () => setTimeout(connect, 5000)); // reconnect
}

async function handleCodeReady({ repo, branch, files }) {
  const repoDir = path.join(REPOS_DIR, repo);
  await exec(`git -C ${repoDir} fetch origin`);
  await exec(`git -C ${repoDir} checkout -b ${branch} origin/main`);

  for (const file of files) {
    await fs.writeFile(path.join(repoDir, file.path), file.content);
  }

  await exec(`git -C ${repoDir} add -A`);
  await exec(`git -C ${repoDir} commit -m "${branch}: code from cloud sandbox"`);

  return { status: 'synced', branch };
}
```

**Security constraints:**
- Whitelist of allowed repos (configured locally)
- No arbitrary code execution — only git + file write
- Token scoped to specific workspace
- TLS mandatory (wss://)

**Installation:**
```bash
npm install -g @vutler/local-daemon
vutler-daemon init    # generates config + token
vutler-daemon start   # connects to cloud
vutler-daemon status  # shows connection state
```

### 4.3 Enterprise Nexus Nodes (Cloud — REST API)

**Current state:** Nexus nodes exist with shell/file providers.
**Enhancement:** Add webhook-based task dispatch.

```javascript
// Enterprise node receives tasks via webhook
POST /api/v1/nexus/enterprise/:nodeId/dispatch
{
  task_id: "task_xyz",
  type: "code.ready",
  payload: {
    repo: "project-name",
    branch: "feature/xyz",
    files: [{ path: "...", content: "..." }]
  },
  callback_url: "https://api.vutler.com/api/v1/nexus/callback"
}

// Enterprise node reports back
POST /api/v1/nexus/callback
{
  task_id: "task_xyz",
  status: "completed" | "failed",
  result: { ... }
}
```

### 4.4 Dispatch Router (Cloud — New component)

Routes `code.ready` events to the appropriate target.

```javascript
// services/dispatchRouter.js
class DispatchRouter {

  async dispatch(workspace, target) {
    const { files_snapshot, branch, base_branch } = workspace;

    switch (target.type) {
      case 'local':
        // Send via WebSocket to local daemon
        return this.dispatchToLocal(target.agentId, {
          type: 'code.ready',
          payload: { repo: workspace.repo_url, branch, files: files_snapshot }
        });

      case 'enterprise':
        // Send via REST to enterprise nexus node
        return this.dispatchToEnterprise(target.nodeId, {
          task_id: workspace.task_id,
          type: 'code.ready',
          payload: { repo: workspace.repo_url, branch, files: files_snapshot }
        });

      case 'cloud':
        // Agent is online — direct git push from sandbox
        return this.dispatchToCloud(workspace);
    }
  }

  async dispatchToLocal(agentId, message) {
    const ws = app.locals.wsConnections.get(agentId);
    if (!ws) throw new Error(`Local agent ${agentId} is offline`);
    ws.send(JSON.stringify(message));
  }

  async dispatchToEnterprise(nodeId, payload) {
    const node = await db.query('SELECT * FROM nexus_nodes WHERE id = $1', [nodeId]);
    await fetch(node.webhook_url, {
      method: 'POST',
      headers: { 'x-api-key': node.api_key },
      body: JSON.stringify(payload)
    });
  }
}
```

---

## 5. Feature Gating: Paid vs Open Source

| Capability | Open Source | Paid (Cloud) |
|------------|-----------|--------------|
| Local agent execution | Direct on machine | Via cloud sandbox + git sync |
| Mobile dispatch | Not available | Full support |
| Sandbox workspace | Not available | Multi-file, git-integrated |
| Enterprise nexus | Not available | REST webhook dispatch |
| Workflow scoring | Available (local) | Available (cloud-enriched) |
| Snipara memory | Basic (self-hosted) | Full (cloud memories + context) |
| Agent chat | Local WebSocket only | Cloud + mobile |

**Implementation:** Feature check middleware on sandbox workspace endpoints.

```javascript
// middleware/featureGate.js
function requirePlan(feature) {
  return async (req, res, next) => {
    const plan = await getWorkspacePlan(req.workspaceId);
    if (!plan.features.includes(feature)) {
      return res.status(403).json({
        error: 'upgrade_required',
        feature,
        message: `${feature} requires a paid plan`
      });
    }
    next();
  };
}

// Usage
router.post('/sandbox/workspace', requirePlan('cloud_sandbox'), createWorkspace);
router.post('/nexus/enterprise/:id/dispatch', requirePlan('enterprise_nexus'), dispatchToEnterprise);
```

---

## 6. Snipara Workflow Integration

The existing WorkflowModeSelector orchestrates the full pipeline:

```
┌─────────────────────────────────────────────────────┐
│              WorkflowModeSelector                   │
│                                                     │
│  score(task) → LITE or FULL                         │
│                                                     │
│  LITE:                                              │
│    1. Inject LITE prompt                            │
│    2. Single sandbox execution                      │
│    3. Direct response in chat                       │
│    4. Optional: single-file dispatch to daemon      │
│                                                     │
│  FULL:                                              │
│    1. gatherFullContext() from Snipara               │
│    2. Create sandbox workspace (git clone)          │
│    3. Iterative dev loop (code/test/fix)            │
│    4. Validate → code.ready event                   │
│    5. DispatchRouter → local daemon or enterprise   │
│    6. persistFullModeResult() to Snipara            │
│    7. Report in chat with diff summary              │
└─────────────────────────────────────────────────────┘
```

### Snipara Memory Persistence

Each dispatch creates memories for continuity:
- **Decision:** "Dispatched feature X to local daemon on branch Y"
- **Learning:** "User prefers local sync for repo Z"
- **Context:** "Workspace ws_abc123 closed, branch merged"

---

## 7. Implementation Phases

### Phase 1 — MVP (2 weeks)
- [ ] Sandbox workspace endpoints (create, exec-in-context, cleanup)
- [ ] `sandbox_workspaces` table migration
- [ ] Local daemon Node.js package (WebSocket + git sync)
- [ ] `code.ready` event type in `/ws/chat`
- [ ] Basic dispatch router (local only)
- [ ] Feature gate middleware

### Phase 2 — Robustness (2 weeks)
- [ ] Daemon reconnection (exponential backoff)
- [ ] Local queue (SQLite) for offline message buffering
- [ ] Streaming progress updates (sandbox → chat)
- [ ] Workspace git conflict detection
- [ ] launchd/systemd service files for daemon

### Phase 3 — Enterprise (2 weeks)
- [ ] Enterprise nexus webhook dispatch
- [ ] Callback endpoint for async results
- [ ] Enterprise node health monitoring
- [ ] Multi-node load balancing

### Phase 4 — Polish (1 week)
- [ ] Mobile UX: workspace status cards in chat
- [ ] Daemon CLI installer (`npm install -g @vutler/local-daemon`)
- [ ] Dashboard: active workspaces, daemon connections
- [ ] Snipara memory optimization (prune old workspace memories)

---

## 8. Security Considerations

1. **Local daemon scope:** ONLY git + file write. No shell execution, no network calls from daemon.
2. **Token rotation:** Local tokens expire after 30 days, renewable via CLI.
3. **Repo whitelist:** Daemon only accepts operations on pre-configured repos.
4. **TLS mandatory:** All WebSocket connections must use wss://.
5. **Code review:** Sandbox workspace changes are visible in chat before dispatch — user can reject.
6. **Enterprise isolation:** Each nexus node has its own API key, scoped to specific workspaces.

---

## 9. Open Questions

- [ ] Should the daemon support multiple repos simultaneously?
- [ ] Do we need a "dry run" mode where code is shown but not written?
- [ ] Should enterprise nodes support bidirectional git sync (not just push)?
- [ ] Rate limiting on sandbox workspaces per workspace plan tier?
