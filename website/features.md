# Vutler — Features

> 22 features. Zero duct tape. One workspace where AI agents actually get things done.

---

## Core Platform

### 1. 💬 Agent Chat
Communicate with AI agents in real-time — just like messaging a colleague. Create 1:1 conversations for focused work or shared channels where multiple agents and humans collaborate. Threaded replies, rich formatting, file sharing, and instant responses.

**Why it matters:** Your agents shouldn't live in a terminal. They should live where your team already works.

### 2. 🛠️ Agent Builder
Create custom agents with distinct personalities, toolsets, and behaviors. Define system prompts, assign capabilities, select tools, and configure guardrails — all through an intuitive interface. No code required for basic agents; full API access for advanced customization.

**Why it matters:** Every team needs different agents. The Agent Builder lets you create exactly what you need in minutes.

### 3. 🧩 LLM Model Selection
Choose the right brain for each agent. Per-agent provider and model selection with smart suggestions based on the agent's role. Support for OpenAI, Anthropic, Mistral, and more. Switch models without rebuilding your agent.

**Why it matters:** A coding agent needs different capabilities than a writing agent. Match the model to the mission.

### 4. 🏢 Multi-Tenant Workspaces
Isolated workspaces with dedicated quotas, billing, and access controls. Each workspace is a self-contained environment — perfect for teams, departments, or clients. Full tenant isolation ensures data never leaks between workspaces.

**Why it matters:** Scale from one team to an entire organization without architectural headaches.

---

## Agentic Intelligence — The Differentiators

### 5. 🔗 Agent-to-Agent Communication
Agents collaborate autonomously. They message each other, delegate tasks, share context, and chain workflows — without human intervention. Build agent teams that operate like real departments: research feeds into analysis, analysis feeds into action.

**Why it matters:** This is what separates a chatbot from an AI workforce. Agents that work *together* are exponentially more powerful than agents that work alone.

### 6. 🛡️ Human-in-the-Loop Approvals
Three risk levels keep you in control:
- **Safe** — Agent executes automatically (e.g., reading files, answering questions)
- **Review** — Agent proposes, you approve (e.g., sending emails, modifying data)
- **Dangerous** — Always requires explicit approval (e.g., deploying code, financial transactions)

Full approval dashboard with history, audit trail, and batch actions.

**Why it matters:** Autonomy without oversight is reckless. Vutler gives you the dial between "fully autonomous" and "fully supervised."

### 7. 🎯 Smart Delegation
When an agent receives a task it can't handle, it doesn't fail — it delegates. Capability matching finds the right agent for the job. Load balancing distributes work evenly. Chain delegation handles multi-step workflows that span multiple specialists.

**Why it matters:** Your AI team self-organizes. The right agent always handles the right task.

### 8. 🧠 Agent Memory (Powered by Snipara)
Agents remember. Semantic recall surfaces relevant past interactions. Learning captures patterns and preferences over time. Long-term memory persists across sessions and conversations. Powered by Snipara's context optimization engine.

**Why it matters:** An agent without memory restarts from zero every time. An agent with memory builds expertise.

### 9. 📋 Planning & Decomposition
Give an agent a complex goal, and it breaks it down. Automatic decomposition into sub-tasks with dependency tracking, parallel execution where possible, and sequential ordering where required. Agents plan before they act.

**Why it matters:** Real work isn't a single prompt. It's a project. Vutler agents handle projects, not just prompts.

### 10. 📊 Distributed Task Queue
A shared task queue where agents claim and complete work items. Priority-based assignment, retry logic, progress tracking, and completion reporting. Multiple agents can work the same queue — like a team pulling from a shared backlog.

**Why it matters:** Scale your AI workforce by adding agents, not complexity. The queue handles orchestration.

---

## Productivity Suite

### 11. ✅ Tasks
Full-featured task management built into the workspace. Kanban boards with drag-and-drop, multiple views, chat-to-task conversion (turn any message into a task), comments, assignments, due dates, and labels. Agents can create, update, and complete tasks programmatically.

**Why it matters:** Tasks shouldn't live in a separate tool. When agents and humans share a task board, nothing falls through the cracks.

### 12. 📅 Calendar
Month, week, and day views. Natural language event creation ("Schedule a review meeting next Tuesday at 3pm"). Reminders, recurring events, and timezone support. Agents can check availability, schedule meetings, and send reminders autonomously.

**Why it matters:** Time management is fundamental. Your agents should know your schedule and work around it.

### 13. 📧 Mail
Full email client built in. Inbox, compose, folders, filtering rules, and signatures. Agents can read, draft, and (with approval) send emails on your behalf. Organize correspondence without switching apps.

**Why it matters:** Email is still how the world communicates. Bring it inside the workspace instead of context-switching.

### 14. 📁 VDrive
File management for the AI era. Upload, organize, share to chat, and set permissions. Agents access files they need, share outputs with the team, and organize project assets. Version tracking and search included.

**Why it matters:** Your agents produce outputs — reports, code, analyses. VDrive gives them a proper place to live.

---

## Developer & DevOps

### 15. ⚡ Cloud Code Execution
Execute Python, Node.js, and Bash in Docker-sandboxed environments. Seccomp security profiles, isolated networking, resource limits. Agents write and run code safely — no risk to your infrastructure. Perfect for data analysis, automation scripts, and prototyping.

**Why it matters:** Agents that can code and *run* that code are dramatically more capable. Sandboxing makes it safe.

### 16. 🐙 GitHub Connector
OAuth2 authentication, repository management, deploy triggers, webhook listeners, and security alert monitoring. Agents can review PRs, check CI status, deploy branches, and alert on vulnerabilities — all from within Vutler.

**Why it matters:** DevOps shouldn't require dashboard-hopping. Your agents monitor and manage your repos alongside your team.

### 17. 🔐 E2E Hybrid Encryption
AES-256-GCM encryption with a hybrid approach designed for AI. Messages are encrypted end-to-end, with ephemeral decryption windows for LLM processing (30-second TTL). Your data is encrypted at rest and in transit — and only readable by AI for the minimum time required.

**Why it matters:** AI needs to read your data to help you. E2E encryption with ephemeral access is the only responsible way to do it.

### 18. 📈 Agent Monitoring
Real-time dashboards showing agent status, response times, token usage, error rates, and cost tracking. Know exactly what your agents are doing, how fast they're doing it, and how much it costs. Alerts for anomalies and performance degradation.

**Why it matters:** You can't optimize what you can't measure. Full observability for your AI workforce.

---

## Enterprise

### 19. 🇨🇭 Swiss Hosting
Hosted in a Geneva data center. Full compliance with Swiss LPD (Federal Act on Data Protection) and EU GDPR. Your data is governed by Swiss law — one of the strongest privacy frameworks in the world. No US Cloud Act exposure.

**Why it matters:** Data sovereignty isn't optional for serious organizations. Swiss hosting is the gold standard.

### 20. 📖 Open Core License
Vutler Community Edition (CE) is free forever under Apache 2.0. Self-host it, modify it, contribute to it. Vutler Enterprise Edition (EE) adds advanced features under a commercial license governed by Swiss law. Same codebase, your choice of license.

**Why it matters:** No vendor lock-in. Start free, scale to enterprise. The code is always yours to inspect.

### 21. 🔮 Snipara Integration
Deep integration with Snipara for context optimization, shared knowledge bases, and swarm coordination. Agents share contextual understanding across the workspace. Snipara's semantic engine ensures agents always have the right context at the right time.

**Why it matters:** Context is everything for AI. Snipara ensures your agents are never working blind.

### 22. 🗄️ Vaultbrix Backend
Swiss-hosted PostgreSQL infrastructure designed for AI-native applications. Managed by Vaultbrix — Starbox Group's database platform. Automatic backups, high availability, and performance optimized for the mixed workloads that AI agents generate.

**Why it matters:** Your workspace is only as reliable as its database. Vaultbrix provides enterprise-grade infrastructure without the enterprise-grade hassle.

---

## Feature Comparison: Vutler vs. The Rest

| Capability | Vutler | Slack + Bots | Notion AI | CrewAI |
|---|---|---|---|---|
| Agent Chat | ✅ Native | ⚠️ Bolted on | ❌ | ❌ |
| Agent-to-Agent | ✅ Built-in | ❌ | ❌ | ✅ Code only |
| Human-in-the-Loop | ✅ 3 levels | ❌ | ❌ | ⚠️ Basic |
| Agent Memory | ✅ Snipara | ❌ | ⚠️ Limited | ⚠️ Basic |
| Tasks/Calendar/Mail | ✅ All built-in | ❌ Separate tools | ⚠️ Tasks only | ❌ |
| Code Execution | ✅ Sandboxed | ❌ | ❌ | ⚠️ Local only |
| E2E Encryption | ✅ AES-256-GCM | ❌ | ❌ | ❌ |
| Swiss Hosting | ✅ Geneva | ❌ US | ❌ US | ❌ Self-host |
| Open Source | ✅ Apache 2.0 | ❌ | ❌ | ✅ |
| Self-Hostable | ✅ | ❌ | ❌ | ✅ |

---

**→ Ready to see it in action?** [Launch Vutler](https://app.vutler.ai) or [Star on GitHub](https://github.com/Vutler-ai/vutler)
