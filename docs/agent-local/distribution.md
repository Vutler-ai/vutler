# Distribution — Packaging & Installing Vutler Agent Local

---

## Distribution Channels

| Channel | Command | Target |
|---------|---------|--------|
| **npm** (primary) | `npx vutler-agent start` | Developers, CI/CD |
| **Homebrew** | `brew install vutler` | macOS users |
| **Docker** | `docker run vutler/agent` | Servers, headless |
| **Direct download** | Binary from GitHub Releases | Offline / air-gapped |
| **Electron app** (future) | Download from vutler.ai | Non-technical users |

---

## npm Package

### Package Name

```
@vutler/agent
```

Alias: `vutler-agent` (for `npx` convenience)

### Zero-Install Usage

```bash
# Start immediately — no global install needed
npx vutler-agent start

# Or install globally
npm install -g @vutler/agent
vutler-agent start
```

### Package Structure

```
@vutler/agent/
├── bin/
│   └── vutler-agent.js      # CLI entry point (#!/usr/bin/env node)
├── lib/
│   ├── agent.js              # Core agent runtime
│   ├── auth.js               # API key + OAuth2 device flow
│   ├── config.js             # Config loader (~/.vutler/)
│   ├── connection.js         # WebSocket client + reconnect
│   ├── heartbeat.js          # Heartbeat manager
│   ├── tools/                # Built-in local tools
│   │   ├── shell.js
│   │   ├── filesystem.js
│   │   ├── http.js
│   │   └── index.js
│   └── tasks.js              # Task executor
├── package.json
└── README.md
```

### `package.json` (key fields)

```json
{
  "name": "@vutler/agent",
  "version": "1.0.0",
  "description": "Run a Vutler AI agent on your local machine",
  "bin": {
    "vutler-agent": "./bin/vutler-agent.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "ws": "^8.0.0",
    "dotenv": "^16.0.0",
    "commander": "^12.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0",
    "conf": "^12.0.0",
    "open": "^10.0.0"
  }
}
```

---

## CLI Interface

### `vutler-agent init`

Interactive setup wizard. Creates `~/.vutler/config.json`.

```
$ vutler-agent init

  🤖 Vutler Agent Local — Setup

  ? Workspace URL: https://app.vutler.ai
  ? Authentication method: API Key
  ? API Key: vutler_a1b2c3d4...
  ? Agent name: My Dev Agent
  ? Enable shell access? Yes
  ? Enable filesystem access? Yes

  ✅ Configuration saved to ~/.vutler/config.json
  ✅ Agent registered with workspace

  Run `vutler-agent start` to connect.
```

### `vutler-agent start`

Connect to workspace and begin accepting tasks.

```
$ vutler-agent start

  🤖 Vutler Agent Local v1.0.0
  ├─ Agent: My Dev Agent (agent-dev-001)
  ├─ Workspace: https://app.vutler.ai
  ├─ Tools: shell, filesystem, http, calculator, knowledge, memory
  └─ Status: ✅ Connected

  Listening for tasks... (Ctrl+C to stop)

  [10:30:15] 📋 Task received: "Run npm test and report results"
  [10:30:18] ✅ Task completed (3.2s)
```

### `vutler-agent status`

Show connection status and agent info.

```
$ vutler-agent status

  Agent:     My Dev Agent
  ID:        agent-dev-001
  Workspace: https://app.vutler.ai
  Status:    🟢 Connected (uptime: 2h 15m)
  Tasks:     47 completed, 0 failed
  Memory:    12 memories stored
  Tools:     shell ✅ | filesystem ✅ | http ✅ | calculator ✅
```

### `vutler-agent connect <workspace-url>`

Quick connect to a workspace (prompts for API key if needed).

```bash
vutler-agent connect https://app.vutler.ai
vutler-agent connect https://vutler.mycompany.com
```

### `vutler-agent config`

View or edit configuration.

```bash
vutler-agent config                  # Show current config
vutler-agent config set llm.model anthropic/claude-sonnet-4-5
vutler-agent config set tools.shell true
vutler-agent config reset            # Reset to defaults
```

### `vutler-agent logs`

Tail agent logs.

```bash
vutler-agent logs            # Follow live
vutler-agent logs --last 50  # Last 50 entries
```

### `vutler-agent update`

Check for and apply updates.

```bash
$ vutler-agent update

  Current: v1.0.0
  Latest:  v1.1.0

  Changelog:
    • Added git integration tool
    • Fixed reconnection on macOS sleep/wake
    • Improved task timeout handling

  ? Update now? Yes
  ✅ Updated to v1.1.0. Restart with `vutler-agent start`.
```

---

## Config File

### Location

```
~/.vutler/config.json       # Primary config
~/.vutler/credentials.json  # Sensitive (tokens, keys) — chmod 600
~/.vutler/logs/             # Agent logs
~/.vutler/cache/            # Cached workspace data
```

### `config.json` Schema

```json
{
  "version": 1,
  "workspace": {
    "url": "https://app.vutler.ai",
    "id": "workspace-uuid"
  },
  "agent": {
    "id": "agent-dev-001",
    "name": "My Dev Agent",
    "capabilities": ["shell", "filesystem", "http"]
  },
  "connection": {
    "heartbeatInterval": 30000,
    "taskTimeout": 300000,
    "reconnectDelay": 5000,
    "maxReconnectAttempts": -1
  },
  "tools": {
    "shell": { "enabled": true, "allowedCommands": [] },
    "filesystem": { "enabled": true, "rootPath": "~", "readOnly": false },
    "http": { "enabled": true, "allowlist": [] }
  },
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "useWorkspaceLLM": true
  },
  "logging": {
    "level": "info",
    "file": true,
    "maxFiles": 7
  }
}
```

### `credentials.json` (auto-generated, restricted permissions)

```json
{
  "apiKey": "vutler_a1b2c3d4...",
  "localToken": "hex64...",
  "oauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "2026-03-23T00:00:00Z"
  }
}
```

---

## Authentication Flow

### Option 1: API Key (simple)

```bash
vutler-agent init
# Paste your API key from Vutler dashboard → Settings → API Keys
```

The API key is stored in `~/.vutler/credentials.json` with `chmod 600`.

### Option 2: OAuth2 Device Flow (secure, recommended)

```
$ vutler-agent login

  🔐 Open this URL in your browser:
  https://app.vutler.ai/device?code=ABCD-1234

  Waiting for authorization...

  ✅ Authorized! Logged in as alex@company.com
  Token saved to ~/.vutler/credentials.json
```

**Device flow steps:**
1. Agent requests a device code from `POST /oauth/device/code`
2. User opens URL in browser, enters code, approves
3. Agent polls `POST /oauth/device/token` until approved
4. Access token + refresh token stored locally
5. Tokens auto-refresh before expiry

---

## Auto-Update

### npm-based

The CLI checks for updates on every `start`:

```
$ vutler-agent start

  ⚠️  Update available: v1.0.0 → v1.1.0
  Run `vutler-agent update` or `npm update -g @vutler/agent`
```

### Homebrew

```bash
brew upgrade vutler
```

### Update check implementation

```javascript
// On startup, check npm registry (non-blocking)
const https = require('https');
https.get('https://registry.npmjs.org/@vutler/agent/latest', (res) => {
  // Compare versions, show notice if newer
});
```

Update checks are **opt-out** via `vutler-agent config set updates.check false`.

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** (arm64) | ✅ Supported | Primary dev platform. Homebrew + npm |
| **macOS** (x64) | ✅ Supported | npm + Homebrew |
| **Linux** (x64) | ✅ Supported | npm + Docker + direct binary |
| **Linux** (arm64) | ✅ Supported | npm + Docker |
| **Windows** (x64) | ✅ Supported | npm + direct binary. PowerShell + CMD |
| **Windows** (arm64) | ⚠️ Untested | Should work via npm |

### System Requirements

- **Node.js** 18+ (for npm install)
- **Disk:** ~50 MB for package + logs
- **RAM:** ~100 MB runtime
- **Network:** Outbound WebSocket (port 443 for TLS, or 8081 for local)

---

## Docker Image

For headless / server deployments:

```dockerfile
FROM node:22-alpine
RUN npm install -g @vutler/agent
COPY config.json /root/.vutler/config.json
COPY credentials.json /root/.vutler/credentials.json
CMD ["vutler-agent", "start"]
```

```bash
# Run
docker run -d \
  --name vutler-agent \
  -v ~/.vutler:/root/.vutler \
  vutler/agent:latest

# Or with env vars
docker run -d \
  -e VUTLER_WORKSPACE_URL=https://app.vutler.ai \
  -e VUTLER_API_KEY=vutler_... \
  vutler/agent:latest
```

Published to Docker Hub as `vutler/agent`.

---

## Homebrew (macOS)

```ruby
# Formula: homebrew-vutler/vutler.rb
class Vutler < Formula
  desc "Vutler AI Agent — run locally, connected to your workspace"
  homepage "https://vutler.ai"
  url "https://registry.npmjs.org/@vutler/agent/-/agent-1.0.0.tgz"
  license "MIT"
  depends_on "node@22"

  def install
    system "npm", "install", "--prefix", libexec
    bin.install_symlink libexec/"bin/vutler-agent"
  end
end
```

```bash
brew tap vutler/tap
brew install vutler
```

---

## Future: Electron Desktop App

For non-technical users who want a visual interface:

- System tray icon with status indicator
- Notification center for incoming tasks
- Visual task history and logs
- Settings UI (no command line needed)
- Auto-start on login
- One-click workspace connection

Timeline: v2.0+
