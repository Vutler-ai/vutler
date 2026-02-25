# Sprint 10 — Chat Polish & Demo Ready

**Started:** 2026-02-17 20:10 CET
**Goal:** Make the chat experience Vutler-branded and demo-ready. First impression matters.

## Mike (Backend) — 10 SP

### S10.1 — Agent Typing Indicator (3 SP)
- When agent runtime receives a message and starts LLM processing, send a "typing" event to the RC channel
- Use RC API: `POST /api/v1/chat.sendTypingEvent` with `{roomId, username, typing: true/false}`
- Set typing=true before LLM call, typing=false after response posted
- Use the agent's own RC credentials (from S9.2)

### S10.2 — Agent Welcome Message (2 SP)
- When an agent is assigned to a channel (via S9.4 API), auto-post a welcome message
- Message: "👋 Hi! I'm {agentName}, your {role/description}. How can I help you today?"
- Post using agent's own RC user

### S10.3 — System Prompt from Agent Config (3 SP)
- Agent `systemPrompt` field exists in MongoDB (set during creation)
- Pass it as the system message in the LLM call (agentRuntime.js)
- Currently the runtime sends raw user messages without system context
- Add: fetch agent doc from MongoDB, prepend systemPrompt to messages array

### S10.4 — Conversation History Context (2 SP)
- Currently each message is sent to LLM without history
- Fetch last 10 messages from the RC channel via API before calling LLM
- Build proper messages array: [{role:'system', content: systemPrompt}, ...history, {role:'user', content: currentMessage}]

## Philip (Frontend/RC Config) — 10 SP

### S10.5 — RC Theme Vutler Branding (3 SP)
- Apply Vutler colors via RC Custom CSS (Admin → Layout → Custom CSS):
  - Primary: #3b82f6 (Electric Blue)
  - Background: #0a0f1e (Navy)
  - Sidebar: #0d1321
  - Text: #e2e8f0
  - Accent: #8b5cf6 (Purple)
- Hide ALL remaining RC branding (check sidebar footer, about dialog, etc.)
- Set Vutler logo in RC sidebar header

### S10.6 — Agent Avatar & Status (2 SP)
- Set distinct avatars for agent users in RC (use icosahedron icon or emoji-based)
- Agent status shows "🤖 AI Agent" or role description
- Configure via RC API: `POST /api/v1/users.setAvatar`

### S10.7 — RC Channel Setup for Demo (2 SP)
- Create demo channels: #support, #dev-team, #marketing
- Clean up #general (delete old test messages)
- Set channel descriptions/topics appropriately
- Pin a welcome message in each channel

### S10.8 — Disable Unnecessary RC Features (1 SP)
- Disable via RC Admin settings:
  - Video/Audio calls (Jitsi)
  - Cloud registration prompts
  - Marketplace prompts
  - Setup wizard nag
  - Statistics reporting
- Keep: Threads, Reactions, File upload, Search, Emoji

### S10.9 — Admin Dashboard Polish (2 SP)
- Add agent count, active channels, messages today to dashboard index
- Fix any broken links or empty states
- Ensure onboarding wizard link is prominent
- Add link to roadmap doc

## VPS Context
- IP: 83.228.222.180, SSH key: `.secrets/vps-ssh-key.pem`
- RC Admin API: port 3000, Vutler API: port 3001
- RC admin: alopez3006 / Roxanne1212**##
- Agent "Adam": id 22f9909f124e9ef554d0d87d793f530e, username adam_1771346118844
- Source: `/home/ubuntu/vutler/app/custom/`
