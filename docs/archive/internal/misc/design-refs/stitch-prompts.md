# Vutler — Stitch UI Prompts

> Design system: Navy (#0A1628) bg, Blue (#3B82F6) accent, Inter font, dark theme
> Sidebar: same as existing mockups (Dashboard, Marketplace, Notifications, Chat, Agents, Builder, Tools section, Nexus section, Config section)
> All screens: responsive, 1440x900 desktop-first, logged in as "Alex Lopez / alex@vutler.com"

---

## 1. Drive — File Manager with Drag & Drop

**Prompt:**

Design a dark-themed file manager page for "Vutler Drive" — an AI workspace file storage.

**Layout:**
- Left sidebar: standard Vutler nav (Drive is active/highlighted under TOOLS)
- Top bar: breadcrumb path navigation (e.g. `/ > shared > BMAD-Docs`), search input, view toggle (grid/list), "+ New Folder" button, "Upload" button with cloud icon
- Main area: file/folder grid with large drop zone

**File Grid:**
- Card-based grid layout (4 columns)
- Each card: file icon (folder 📁, PDF 📄, image 🖼️, code 💻), file name, file size, modified date
- Folder cards: navy-800 bg, folder icon, name, item count
- File cards: navy-800 bg, type icon, name, size, date
- Selected state: blue border (#3B82F6)
- Hover state: subtle highlight

**Drag & Drop Zone:**
- When dragging files over the page: full-area dashed border (#3B82F6), "Drop files here to upload" centered text with cloud upload icon
- Upload progress: bottom-right toast/panel showing file name, progress bar (blue), percentage, cancel button
- Multi-file support: stacked progress bars

**Context Menu (right-click):**
- Download, Rename, Move to…, Copy link, Delete (red)

**Empty State:**
- Large cloud upload icon, "No files yet — drag & drop files or click Upload", subtle dashed border area

**Toolbar:**
- Breadcrumb: `Home / shared / BMAD-Docs` — each segment clickable
- Sort by: Name, Date, Size, Type (dropdown)
- Filter: All, Folders only, Files only

**Storage indicator:**
- Bottom of sidebar or top-right: "1.9 TB available" with subtle progress bar

**Colors:** Background #0A1628, cards #111827, borders #1e293b, text white/#94a3b8, accent #3B82F6
**Font:** Inter
**Style:** Clean, minimal, Notion/Google Drive inspired but dark

**Sample data to show:**
- Folders: `default/`, `shared/`, `BMAD-Docs/`, `agents/`
- Files in shared: `snipara-bugs-report.md` (12 KB), `product-brief-v2.pdf` (847 KB), `architecture-diagram.png` (1.2 MB)

---

## 2. Nexus Dashboard — Agent Routing & Orchestration

**Prompt:**

Design a dark-themed "Nexus Dashboard" page for Vutler — the AI agent orchestration center.

**Layout:**
- Left sidebar: standard Vutler nav (Nexus Dashboard is active/highlighted)
- Top: "Nexus Dashboard" title, subtitle "Agent orchestration & routing intelligence"

**Section 1 — Active Agents Grid (top half):**
- 4-column grid of agent cards
- Each card: avatar circle (colored), agent name, role subtitle, status badge (🟢 Online / 🔴 Offline / 🟡 Busy), model name (e.g. "Sonnet 4.5"), current task count
- Cards for: Jarvis (Coordinator), Mike (Lead Engineer), Andrea (Office Manager), Philip (UI/UX), Luna (Product Manager), Michael (QA/Review), Release-DevOps (CI/CD), DB-Migration (Migrations), Max (Marketing), Victor (Sales)
- Online agents: subtle green left border
- Offline: dimmed card

**Section 2 — Routing Matrix (bottom left):**
- Table showing: Task Type → Primary Agent → Fallback Agent(s)
- Rows: bug_fix → Michael → Mike, code_review → Michael → Mike, frontend → Philip → Michael, backend → Mike → Michael, deploy → Release-DevOps → Mike, migration → DB-Migration → Mike, product → Luna → Jarvis, marketing → Max → Oscar, legal → Andrea → Jarvis
- Color-coded by domain (engineering=blue, product=purple, ops=orange)

**Section 3 — Live Activity Feed (bottom right):**
- Scrollable feed showing recent agent actions
- Each entry: timestamp, agent avatar, action text
- Example: "16:42 — Michael completed code review on PR #47"
- Example: "16:38 — Release-DevOps deployed v2.1.4 to staging"
- Example: "16:35 — Mike resolved bug #128 (sandbox timeout)"

**Stats bar (top):**
- 4 metric cards: "12 Agents Active", "47 Tasks Today", "98.2% Uptime", "3.2s Avg Response"

**Colors:** Background #0A1628, cards #111827, borders #1e293b, accent #3B82F6, green #22c55e, orange #f59e0b
**Font:** Inter

---

## 3. Mail Inbox

**Prompt:**

Design a dark-themed email inbox page for Vutler — AI-managed email for workspace agents.

**Layout:**
- Left sidebar: standard Vutler nav (Email is active under TOOLS)
- Email sidebar (second column, narrow): Inbox (6), Sent, Drafts, folder list
- Main area: split view — email list top, email preview bottom (or side-by-side)

**Email List:**
- Each row: sender avatar, sender name, subject (bold if unread), preview snippet (gray), timestamp (right-aligned)
- Unread: white text, blue left border
- Read: gray text, no border
- Selected: navy-700 bg highlight
- Checkbox for bulk actions
- Top bar: search, filter (All/Unread/Flagged), sort

**Email Preview Panel:**
- From, To, Date, Subject header
- Body rendered as HTML/markdown
- Action buttons: Reply, Forward, Archive, Delete, Assign to Agent (dropdown)

**Compose Button:**
- Floating "✏️ Compose" button bottom-right or top bar
- Opens modal: To, Subject, Body (rich text), "Send as Agent" dropdown (Andrea, Victor, etc.), Send button

**Sample emails:**
- From: contact@example.com — "Partnership inquiry for Starbox Group" — 2h ago (unread)
- From: support@client.ch — "Bug report: login timeout" — 5h ago (unread)
- From: noreply@github.com — "PR #47 merged successfully" — 1d ago (read)
- From: legal@supplier.com — "NDA review request" — 2d ago (read)

**Colors:** Background #0A1628, cards #111827, unread accent #3B82F6
**Font:** Inter

---

## 4. Sandbox — Code Execution & Testing

**Prompt:**

Design a dark-themed "Sandbox" page for Vutler — where AI agents execute code, run tests, and debug.

**Layout:**
- Left sidebar: standard Vutler nav (Sandbox is active under NEXUS)
- Top: "Sandbox" title, "Execute & test agent code in isolation"

**Section 1 — New Execution Panel (top):**
- Dropdown: Select Agent (Michael, Mike, Release-DevOps, DB-Migration)
- Dropdown: Task Type (bug_fix, code_review, incident_response, test_run)
- Text area: Code/context input (monospace, dark editor theme)
- "▶ Execute" button (blue), "Schedule" button (outline)

**Section 2 — Execution History (bottom):**
- Table: ID, Agent, Type, Status (badge: ✅ Success / ❌ Failed / ⏳ Running / ⚠️ Timeout), Duration, Started, Actions
- Row click: expands to show full output (terminal-style black bg, green/white monospace text)
- Sample rows:
  - #exec-001 | Michael | code_review | ✅ Success | 4.2s | 16:42
  - #exec-002 | Release-DevOps | deploy | ✅ Success | 12.1s | 16:38  
  - #exec-003 | Mike | bug_fix | ❌ Failed | 8.7s | 16:30

**Terminal Output Panel:**
- Expandable panel with full execution output
- Syntax highlighted, scrollable
- Copy button, "Re-run" button

**Colors:** Background #0A1628, terminal #0d1117, success #22c55e, error #ef4444, running #3B82F6
**Font:** Inter (UI), JetBrains Mono (code/terminal)

---

## 5. Settings — Workspace Configuration

**Prompt:**

Design a dark-themed Settings page for Vutler — workspace and account configuration.

**Layout:**
- Left sidebar: standard Vutler nav
- Settings sidebar (second column): Profile, Workspace, LLM Providers, API Keys, Integrations, Billing, Security
- Main content area with form sections

**Profile Section (shown):**
- Avatar upload circle, Name input, Email (read-only), Timezone dropdown
- "Save Changes" blue button

**Workspace Section:**
- Workspace name, Description, Logo upload
- Default LLM provider dropdown, Default model dropdown
- Storage quota display (bar chart: used/total)

**LLM Providers Section:**
- Cards for each provider: OpenAI (green), Anthropic (orange), MiniMax (purple)
- Each card: provider logo, status badge (Connected/Not configured), API key field (masked), "Test Connection" button
- "+ Add Provider" button

**API Keys Section:**
- Table: Key name, Created, Last used, Status, Actions (revoke)
- "+ Generate New Key" button

**Security Section:**
- Two-factor auth toggle
- Session history table
- "Change Password" section

**Colors:** Background #0A1628, form inputs #111827 with #1e293b borders, accent #3B82F6
**Font:** Inter

---

## 6. Login Page

**Prompt:**

Design a dark-themed login page for Vutler.

**Layout:**
- Centered card on dark background (#0A1628)
- Vutler logo (icosahedron wireframe) + "Vutler" text top center
- Tagline: "AI Agent Workspace" below logo

**Login Card:**
- White/navy card (#111827), rounded corners, subtle shadow
- Email input field with envelope icon
- Password input field with lock icon, show/hide toggle
- "Remember me" checkbox
- "Sign In" button (full width, #3B82F6, bold)
- "Forgot password?" link below
- Divider "or"
- "Sign up for free" link
- Footer: "© 2026 Vutler. All rights reserved."

**Background:**
- Subtle gradient or mesh pattern (navy to dark blue)
- Optional: floating geometric shapes (icosahedrons) very subtle

**Colors:** Background gradient #0A1628 → #0f172a, card #111827, accent #3B82F6, text white
**Font:** Inter

---

## 7. Agent Builder — Visual Agent Creator

**Prompt:**

Design a dark-themed "Agent Builder" page for Vutler — a visual no-code agent configuration tool.

**Layout:**
- Left sidebar: standard Vutler nav (Builder is active)
- Main area: multi-step form / wizard

**Steps (top progress bar):**
1. Identity → 2. Model & Provider → 3. Tools & Permissions → 4. System Prompt → 5. Review & Deploy

**Step 1 — Identity (shown):**
- Agent name input
- Username input (auto-generated from name)
- Email input
- Role input (free text or dropdown: Engineer, Designer, PM, Marketing, Sales, Support, Legal, Custom)
- MBTI dropdown (16 types)
- Avatar: upload or select from predefined set (grid of 12 avatars)
- Description textarea

**Step 2 — Model & Provider:**
- Provider cards: OpenAI, Anthropic, MiniMax (selectable)
- Model dropdown (filtered by provider): gpt-4o, claude-sonnet-4-20250514, etc.
- Temperature slider (0.0 — 2.0)
- Max tokens slider
- "Test with sample prompt" button

**Step 3 — Tools & Permissions:**
- Grid of tool cards (toggle on/off): Web Search, File Access, Shell Execution, Email, Memory (Snipara), Code Execution, API Calls
- Permission toggles: Can send emails, Can access Drive, Can execute code, Can call external APIs

**Step 4 — System Prompt:**
- Large textarea with syntax highlighting
- Template selector: "Start from template" dropdown
- Character count, token estimate
- Preview panel showing how the agent would respond to a test message

**Step 5 — Review & Deploy:**
- Summary card with all settings
- "Deploy Agent" blue button, "Save as Draft" outline button
- Estimated monthly cost display

**Colors:** Background #0A1628, step cards #111827, active step #3B82F6, completed step #22c55e
**Font:** Inter

---

## 8. Chat — Agent Conversations

**Prompt:**

Design a dark-themed Chat page for Vutler — where users converse with AI agents.

**Layout:**
- Left sidebar: standard Vutler nav (Chat is active)
- Chat sidebar (second column): list of conversations with agents
- Main area: chat window

**Chat Sidebar:**
- Search conversations input
- List of agent conversations: avatar, agent name, last message preview, timestamp, unread badge
- "New Chat" button top
- Online agents have green dot on avatar

**Chat Window:**
- Top bar: agent avatar + name + status + model badge (e.g. "Sonnet 4.5") + ⚙️ settings
- Message area: alternating bubbles
  - User messages: right-aligned, blue bg (#3B82F6)
  - Agent messages: left-aligned, navy-800 bg (#1e293b), with agent avatar
  - Code blocks: dark bg with syntax highlighting, copy button
  - Markdown rendered (bold, lists, links)
- Typing indicator: "Mike is thinking..." with animated dots
- Input area: textarea with attachment button 📎, send button, "Assign to agent" dropdown

**Sample conversation with Mike:**
- User: "Can you review the latest PR for the auth module?"
- Mike: "I'll review PR #52 now. Looking at the changes..." (with code block showing diff)
- Mike: "Found 2 issues: 1. Missing input validation on line 47..."

**Colors:** Background #0A1628, user bubbles #3B82F6, agent bubbles #1e293b, input #111827
**Font:** Inter (UI), JetBrains Mono (code blocks)
