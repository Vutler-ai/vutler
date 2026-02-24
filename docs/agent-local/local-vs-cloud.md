# Local Agent vs Cloud Agent

Vutler supports two deployment models for agents. Choose based on your use case.

---

## At a Glance

| | **Local Agent** | **Cloud Agent** |
|---|---|---|
| **Runs on** | Your machine (Node.js) | Vutler server (Docker) |
| **Connection** | WebSocket to server | Native in-process |
| **File access** | ✅ Full local filesystem | ❌ Sandboxed only |
| **Network access** | ✅ Your local network | URL allowlist only |
| **LLM routing** | Via server API | Direct (LLM Router) |
| **Chat integration** | Via REST/WS API | Native Rocket.Chat DDP |
| **Startup** | `node agent-local.js` | `POST /agents/:id/start` |
| **Persistence** | You manage uptime | Managed by server |
| **Security** | Trusted environment | Sandboxed, multi-tenant safe |
| **Best for** | Dev, admin, automation | Chat bots, customer-facing |

---

## When to Use Local Agent

**Development & Testing**
- Rapid iteration without redeploying containers
- Debug with local dev tools
- Test tool integrations with local services

**Admin & Automation**
- Run scripts that need local filesystem access
- Process files on your machine
- Interact with local databases or services
- Backup, deploy, and maintain workflows

**Trusted Environment**
- Internal tools that need network access
- Agents that interact with local hardware (printers, IoT)
- CI/CD pipeline agents

**Custom Tools**
- When you need tools beyond the built-in 7
- When tools need access to local resources
- When you want to iterate quickly on tool development

---

## When to Use Cloud Agent

**Customer-Facing Bots**
- Chat agents embedded in Rocket.Chat channels
- Agents that need to be always-on without user intervention
- Multi-agent routing with @mentions and round-robin

**Sandboxed Execution**
- Running untrusted code or user inputs
- Multi-tenant environments where isolation matters
- When security boundaries are critical

**Managed Infrastructure**
- You don't want to manage uptime
- You want centralized logging, monitoring, and billing
- You need automatic reconnection and failover

**Team Collaboration**
- Multiple agents working together via AgentBus
- Agent-to-agent delegation and communication
- Shared knowledge bases and memory

---

## Hybrid Approach

You can run both. A common pattern:

```
┌─────────────────┐     ┌─────────────────┐
│  Cloud Agents   │     │  Local Agent     │
│  (chat, users)  │────►│  (admin, files)  │
│                 │     │                  │
│  Mike 🤖        │     │  DevBot 🔧       │
│  Luna 🌙        │     │                  │
│  Philip 📊      │     │                  │
└─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────────────────────────────┐
│           Vutler Server                  │
│  AgentBus (Redis) for coordination      │
│  Snipara for shared knowledge           │
└─────────────────────────────────────────┘
```

- **Cloud agents** handle user-facing chat in Rocket.Chat
- **Local agent** handles dev ops, file management, and admin tasks
- Both share memory and communicate via AgentBus

### Delegation Example

A cloud chat agent can delegate tasks to a local agent:

```bash
# Cloud agent delegates file processing to local agent
curl -X POST http://your-server:3001/api/v1/agent-comms/delegations \
  -H 'Content-Type: application/json' \
  -d '{
    "requesterId": "cloud-agent-mike",
    "delegateId": "local-agent-dev",
    "taskDescription": "Process the uploaded CSV and generate a report",
    "priority": "normal"
  }'
```

---

## Migration Path

### Local → Cloud

When your local agent is ready for production:

1. Package your tool handlers into the server-side tools registry
2. Register the agent as a cloud agent via `POST /agents`
3. Configure LLM via `PUT /agents/:id/llm-config`
4. Assign to Rocket.Chat channels
5. Start with `POST /agents/:id/start`

### Cloud → Local

When you need to debug or add local capabilities:

1. Register a local agent via `POST /agents/local/register`
2. Copy the agent's tool configuration
3. Implement the task handler in your local script
4. Connect and authenticate
