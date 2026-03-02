# 🤖 Vutler Nexus - Complete Local Agent Runtime

Vutler Nexus is a complete local AI agent runtime that provides a powerful, privacy-focused AI assistant that runs entirely on your machine. Now powered by **Claude Code CLI** - use your existing Claude Max subscription for unlimited local AI with **$0 additional costs**!

## ✨ Features

### 🧠 **Complete Agent Runtime**
- **Claude Code CLI Integration**: Uses your Max subscription - no API costs!
- **Smart Context Loading**: Auto-loads workspace files as system context
- **Tool Execution**: File operations, shell commands, memory management
- **Conversation Management**: Persistent chat history and memory

### 💰 **Zero LLM Costs**
- **Primary**: Claude Code CLI (uses your Max subscription - $0 extra)
- **Fallback**: Anthropic API (pay-per-token if you need it)
- **Automatic Detection**: Detects and recommends the best option

### 🌐 **Local Web Interface**
- **Modern Dark UI**: Beautiful Vutler-branded interface on `localhost:3939`
- **Real-time Streaming**: Live responses from Claude CLI
- **Settings Dashboard**: Configure everything through the web UI
- **Chat Management**: Export conversations, clear history, status monitoring

### 📁 **Intelligent File System**
- **Workspace Integration**: Seamlessly works with your project directories
- **Context Files**: Auto-loads SOUL.md, MEMORY.md, USER.md, IDENTITY.md, TOOLS.md
- **Memory System**: Daily memory files with searchable history
- **File Tools**: Read, write, search files through natural language

### ☁️ **Cloud Integration** (Optional)
- **Secure Tunnel**: Connect to Vutler Cloud for remote access
- **Privacy-First**: Your data stays local, only metadata syncs
- **Multi-Device**: Access your agent from anywhere

### 🛡️ **Security & Privacy**
- **Local-First**: All processing happens on your machine via Claude CLI
- **Sandboxed Execution**: Optional shell access with safety controls
- **No Data Collection**: Your conversations and files stay private
- **Configurable Features**: Enable only what you need

## 🚀 Quick Start

### Prerequisites

**Option 1: Claude Code CLI (Recommended)**
```bash
# Install Claude CLI (requires Claude Max subscription)
pip install claude-cli

# Verify installation
claude --version
```

**Option 2: Anthropic API (Fallback)**
- Get API key from [console.anthropic.com](https://console.anthropic.com/)

### Installation

```bash
# Install globally
npm install -g @vutler/nexus

# Or run directly with npx
npx @vutler/nexus init
```

### Setup

```bash
# Interactive setup - automatically detects Claude CLI
vutler-nexus init
```

This will:
- ✅ **Detect Claude CLI** and recommend it (uses Max subscription)
- ⚙️ Configure agent name and workspace
- ☁️ Optional cloud integration
- 🔧 Feature preferences

### Launch

```bash
# Start the complete agent runtime
vutler-nexus start

# Open http://localhost:3939 in your browser
# Or chat directly in terminal:
vutler-nexus chat
```

## 📖 Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `vutler-nexus init` | Interactive setup wizard (detects Claude CLI) |
| `vutler-nexus start` | Start agent runtime + web server + cloud tunnel |
| `vutler-nexus stop` | Gracefully stop all services |
| `vutler-nexus status` | Show complete system status including Claude CLI |
| `vutler-nexus chat` | Terminal-based chat interface |
| `vutler-nexus config` | View/edit configuration |

### Utility Commands

| Command | Description |
|---------|-------------|
| `vutler-nexus workspace` | Show workspace information and file status |
| `vutler-nexus version` | Version and system information |
| `vutler-nexus --help` | Complete command reference |

### CLI Options

```bash
# Start without web interface
vutler-nexus start --no-web

# Start without cloud connection
vutler-nexus start --no-cloud

# Set configuration values
vutler-nexus config --set llm.provider=claude-code
vutler-nexus config --set agent.name="JARVIS"

# Edit config file
vutler-nexus config --edit
```

## ⚙️ Configuration

Nexus stores configuration in `~/.vutler/config.json`:

```json
{
  "cloudUrl": "app.vutler.ai",
  "token": "your-pairing-token",
  "workspace": "/Users/you/.vutler/workspace",
  "webPort": 3939,
  "llm": {
    "provider": "claude-code",
    "model": "claude-sonnet-4-20250514",
    "claudePath": "claude",
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "agent": {
    "name": "Jarvis",
    "systemPrompt": "auto",
    "contextFiles": ["SOUL.md", "MEMORY.md", "USER.md", "IDENTITY.md", "TOOLS.md"]
  },
  "features": {
    "webInterface": true,
    "cloudSync": true,
    "localChat": true,
    "fileAccess": true,
    "shellAccess": false
  }
}
```

### LLM Providers

**claude-code** (Recommended)
- Uses your Claude Max subscription
- No additional API costs
- Requires `claude` CLI installed
- Unlimited usage within Max limits

**anthropic-api** (Fallback)
- Direct API integration
- Requires API key and pay-per-token
- Use when Claude CLI not available

### Workspace Structure

Your workspace directory contains:

```
~/.vutler/workspace/
├── SOUL.md          # Agent personality and core instructions
├── MEMORY.md        # Long-term curated memories  
├── USER.md          # Information about you
├── IDENTITY.md      # Agent identity and capabilities
├── TOOLS.md         # Tool configurations and preferences
└── memory/
    ├── 2024-01-01.md  # Daily memory files
    ├── 2024-01-02.md
    └── ...
```

## 🧠 LLM Integration

### Claude Code CLI (Primary)

**Why Claude Code CLI?**
- 💰 **Zero extra costs** - uses your Max subscription
- ⚡ **Fast local execution** - no API round trips
- 🔐 **Maximum privacy** - everything stays local
- 🚀 **Unlimited usage** within Max plan limits

**Setup:**
```bash
pip install claude-cli
claude --version
```

**Models Supported:**
- Claude Sonnet (default)
- Claude Opus
- Claude Haiku

### Anthropic API (Fallback)

**When to use:**
- Claude CLI not available
- Need specific API features
- Running on systems without Python

**Supported Models:**
- **Claude Sonnet 4** (recommended) - `claude-sonnet-4-20250514`
- **Claude Opus 4** (most powerful) - `claude-opus-4-6`  
- **Claude Haiku 4** (fastest) - `claude-haiku-4-20250514`

### Context Loading

When `systemPrompt: "auto"` (default), Nexus automatically loads and concatenates your workspace context files:

1. **SOUL.md** - Agent personality, goals, style
2. **MEMORY.md** - Long-term memories and learnings  
3. **USER.md** - Information about you and preferences
4. **IDENTITY.md** - Agent capabilities and identity
5. **TOOLS.md** - Tool configurations and local notes

This creates a rich, personalized system prompt that makes your agent uniquely yours.

## 🛠️ Agent Tools

Your agent has powerful built-in tools:

### File Operations
- `read_file(path)` - Read any file in workspace
- `write_file(path, content)` - Write/create files
- `list_files(directory)` - Browse directories  
- `search_files(query, extensions)` - Full-text search

### Memory Management
- `append_memory(content)` - Add to today memory file
- Auto-loads recent memory for context
- Search through historical memory files

### Shell Access (Optional)
- `execute_shell(command)` - Run terminal commands
- Sandboxed to workspace directory
- 30-second timeout protection
- Disabled by default for security

### Web Interface
- Real-time status monitoring
- Configuration management
- Chat history and export
- File browser integration

## 🌐 Web Interface

Access your agent via beautiful web interface:

### Chat Page (`/`)
- Real-time streaming responses from Claude CLI
- Message history with timestamps
- Export conversations as JSON
- Clear history and toggle streaming

### Settings Page (`/settings.html`)
- **Provider Selection**: Choose Claude CLI or Anthropic API
- **Auto-Detection**: Shows Claude CLI availability
- **Cost Display**: Shows $0 for Claude CLI, usage costs for API
- Complete configuration management
- Status monitoring and diagnostics

### API Endpoints

Build custom integrations:

```javascript
// Chat with the agent
POST /api/chat
{
  "message": "Hello!",
  "stream": true
}

// Get status (includes Claude CLI info)
GET /api/status

// Test Claude CLI availability
GET /api/test-claude-cli

// Update config
POST /api/config
{
  "agent": { "name": "JARVIS" }
}
```

## 🔗 Cloud Integration

Connect to Vutler Cloud for remote access:

1. **Get Pairing Token**: Visit [app.vutler.ai](https://app.vutler.ai)
2. **Configure**: `vutler-nexus config --set token=your-token`
3. **Connect**: Cloud tunnel automatically starts with `vutler-nexus start`

### Privacy & Security
- **Local Processing**: LLM calls happen via local Claude CLI
- **Metadata Only**: Only connection status and basic info syncs
- **End-to-End**: Your conversations stay on your machine
- **Optional**: Works completely offline without cloud

## 🔧 Development

### Project Structure

```
packages/nexus/
├── bin/cli.js           # Enhanced CLI with Claude CLI support
├── lib/
│   ├── config.js        # Configuration (claude-code default)
│   ├── tunnel.js        # WebSocket cloud tunnel
│   ├── agent-runtime.js # Claude CLI integration and tools
│   ├── file-manager.js  # Workspace file operations
│   ├── web-server.js    # Express web interface
│   └── web/             # Static web assets
│       ├── index.html   # Main chat interface
│       ├── settings.html # Configuration UI with provider selection
│       ├── style.css    # Vutler dark theme
│       ├── chat.js      # Chat functionality
│       └── settings.js  # Settings with Claude CLI support
├── package.json         # Dependencies (removed Anthropic SDK)
└── README.md           # This file
```

### Local Development

```bash
# Clone and setup
git clone <repo>
cd vutler/packages/nexus
npm install

# Test commands
node bin/cli.js --help
node bin/cli.js init
node bin/cli.js start
```

## 🚨 Troubleshooting

### Common Issues

**"Claude CLI not found"**
- Install: `pip install claude-cli`
- Verify: `claude --version`
- Or use Anthropic API fallback

**"LLM not configured"**
- Run setup: `vutler-nexus init`
- Check status: `vutler-nexus status`

**"Port already in use"**
- Change web port: `vutler-nexus config --set webPort=3940`
- Or find what's using port: `lsof -i :3939`

**"Workspace not found"**
- Check workspace path: `vutler-nexus workspace`
- Recreate workspace: `vutler-nexus config --set workspace=/new/path`

**"Cloud connection failed"**
- Check your pairing token: `vutler-nexus status`
- Try without cloud: `vutler-nexus start --no-cloud`

### Getting Help

1. **Status Check**: `vutler-nexus status`
2. **Logs**: Check terminal output when running `vutler-nexus start`
3. **Configuration**: `vutler-nexus config` to see current settings
4. **Reset**: Delete `~/.vutler/config.json` and run `vutler-nexus init`

## 💰 Cost Comparison

| Provider | Cost | Speed | Privacy |
|----------|------|--------|---------|
| **Claude Code CLI** | **$0** (Max subscription) | ⚡ Fast (local) | 🔐 Maximum |
| Anthropic API | ~$3-15/month typical usage | 🌐 Network dependent | 🔒 API calls |

**Recommendation**: Use Claude Code CLI with your Max subscription for unlimited local AI at no extra cost!

## 📄 License

UNLICENSED - Proprietary software by Starbox Group

## 🎯 Built for Alex's Setup

This agent is specifically designed to work with Claude Max subscriptions and automatically detects:

- **Claude Code CLI availability** and recommends it
- **OpenClaw workspace** at `/Users/lopez/.openclaw/workspace/`
- **Existing context files**: SOUL.md, MEMORY.md, USER.md, etc.
- **Zero additional costs** by leveraging your Max subscription

The agent will auto-configure itself for cost-free operation using your existing Claude subscription.

---

**🚀 Ready to get started?** Run `vutler-nexus init` and let it detect your Claude CLI for unlimited AI at $0 extra cost!
