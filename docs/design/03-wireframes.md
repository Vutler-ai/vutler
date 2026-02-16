# Vutler UI Wireframes — Descriptions Détaillées

**Version 1.0 — 16 février 2026**

Descriptions textuelles complètes des 5 vues clés. Pas d'images — ces specs peuvent être transmises directement à un dev ou utilisées pour générer des maquettes.

---

## 1. Dashboard Principal (Agent Workspace)

**Route :** `/dashboard`  
**User :** Admin ou user avec accès à plusieurs agents

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo] Vutler    [Search bar]         [Notifications] [Profile]    │ ← Top navbar, 64px
├───────────────┬─────────────────────────────────────────────────────┤
│               │ 🏠 Dashboard                                        │
│  Navigation   │ ─────────────────────────────────────────────      │
│               │                                                     │
│ • Dashboard   │ Active Agents (4)                    [+ Create]    │ ← Section header
│ • Agents      │                                                     │
│ • Messages    │ ┌─────────┬─────────┬─────────┬─────────┐        │
│ • Files       │ │ [Agent] │ [Agent] │ [Agent] │ [Agent] │        │ ← Agent cards (4-col grid)
│ • Analytics   │ │  Card   │  Card   │  Card   │  Card   │        │
│ • Settings    │ │   1     │   2     │   3     │   4     │        │
│               │ └─────────┴─────────┴─────────┴─────────┘        │
│  (280px)      │                                                     │
│               │ Recent Activity                                     │ ← Activity feed
│               │ ┌───────────────────────────────────────────────┐ │
│               │ │ 🟢 alex@sales sent email to client             │ │
│               │ │ 📁 maria@hr uploaded policy.pdf                 │ │
│               │ │ 💬 john@support replied in #tickets            │ │
│               │ └───────────────────────────────────────────────┘ │
│               │                                                     │
│               │ System Stats                                        │
│               │ ┌────────┬────────┬────────┬────────┐            │
│               │ │ 24.5GB │ 1,284  │ 98.2%  │ 4 hrs  │            │ ← Metric cards
│               │ │ Storage│ Messages│ Uptime │ Resp   │            │
│               │ └────────┴────────┴────────┴────────┘            │
└───────────────┴─────────────────────────────────────────────────────┘
```

### Top Navbar (64px height)

**Left side :**
- **Logo + Brand** : "Vutler" en Inter 600, 18px, avec icône butler (gold abstract icon)
- Spacing : 24px left padding

**Center :**
- **Search bar** : 400px width, rounded, placeholder "Search agents, messages, files... (⌘K)"
  - Icon : magnifying glass (Lucide, 16px)
  - Focus : gold border, shadow glow
  - Click → ouvre Command Palette (modal fullscreen)

**Right side :**
- **Notifications** : Bell icon avec badge (count si >0)
  - Click → dropdown (max 5 items, "View all" link)
- **Profile** : Avatar 36x36px + name
  - Click → dropdown (Settings, Logout, Theme toggle)
- Spacing : 24px right padding

**Style :**
- Background : Surface L1 (#1A1A24 dark / #FFFFFF light)
- Border-bottom : 1px gold transparent
- Fixed position (reste visible au scroll)

---

### Sidebar (280px width, fixed)

**Top section :**
- Workspace switcher : "Starbox Group ▾" (dropdown si multiple workspaces)

**Navigation items :**
Each item : 48px height, 16px padding, icon + label

```
🏠 Dashboard
👤 Agents         [4] ← badge count
💬 Messages       [12]
📁 Files
📊 Analytics
⚙️ Settings
```

**Active state :**
- Background : Surface L2
- Border-left : 3px gold
- Icon + text : gold color

**Hover state :**
- Background : Surface L2 (50% opacity)
- Smooth transition 150ms

**Bottom section :**
- User profile card (collapsed)
- Theme toggle (sun/moon icon)
- Help button

**Style :**
- Background : Surface L1
- Border-right : 1px rgba(255,255,255,0.05)

---

### Main Content Area

**Section : Active Agents**

**Header :**
- Title : "Active Agents (4)" — 24px, Inter 600
- Button : "+ Create Agent" — gold background, white text, rounded, hover scale
- Spacing : 32px top, 24px bottom

**Agent Cards Grid :**
- 4 columns desktop, 2 tablet, 1 mobile
- Gap : 24px
- Each card : aspect-ratio 1:1.2 (slightly taller than wide)

**Agent Card Detail :**

```
┌─────────────────────────────────┐
│   [3D Avatar, 80x80, center]   │ ← Top 24px padding
│                                  │
│   Alex — Sales Assistant        │ ← Name, 18px, Inter 600
│   @alex-sales                    │ ← Handle, 14px, gray
│                                  │
│   🟢 Active                      │ ← Status (green dot + text)
│   ─────────────────────────      │ ← Divider, gold 10% opacity
│   📧 12 unread                   │ ← Stats, icons + text, 14px
│   💬 3 active chats              │
│   📁 2.3 GB / 10 GB              │ ← Progress bar inline (thin)
│                                  │
│   [View Profile] [Message]       │ ← Buttons, 36px height
└─────────────────────────────────┘
```

**Card styling :**
- Background : Surface L2
- Border : 1px gold 15% opacity
- Border-radius : 12px
- Padding : 24px
- Shadow : subtle elevation 2

**Hover :**
- Scale : 1.02
- Shadow : elevation 4
- Border : gold 40% opacity
- Transition : 150ms ease-out

**Avatar :**
- 3D geometric shape (unique per agent)
- Glow effect if active (green halo, subtle)
- Presence indicator : 16px circle, top-right corner, animated pulse

**Buttons :**
- "View Profile" : ghost button (transparent, gold text, gold border)
- "Message" : primary button (gold background, black text)
- Both : 100% width, stacked, 8px gap

---

**Section : Recent Activity**

**Feed items :**
Each item : 56px height, flex row, 16px padding

```
[Icon] [Content]                      [Timestamp]
🟢     alex@sales sent email...        2m ago
```

**Layout :**
- Icon : 24x24, left-aligned (status color + type icon)
- Content : flex-grow, 14px text, truncate if long
- Timestamp : right-aligned, 12px, gray

**Max visible items :** 10, puis "Load more" link

**Style :**
- Background : Surface L2
- Border-radius : 8px
- Divide-y : 1px borders between items
- Hover : item background Surface L3

---

**Section : System Stats**

**Metric cards grid :** 4 columns, 16px gap

Each card : 120px height, centered content

```
┌──────────────┐
│   24.5 GB    │ ← Value, 24px, Inter 600
│   Storage    │ ← Label, 12px, gray, uppercase
│   ────       │ ← Optional mini-chart or icon
│   ↑ 15%     │ ← Change indicator (green/red)
└──────────────┘
```

**Style :**
- Background : Surface L2
- Border : 1px gold 10%
- Border-radius : 8px
- Padding : 16px

---

### Responsive Behavior

**Desktop (>1024px) :**
- Sidebar visible, fixed
- Agent cards : 4 columns
- Stats : 4 columns

**Tablet (768-1024px) :**
- Sidebar : collapsible (hamburger icon)
- Agent cards : 2 columns
- Stats : 2 columns

**Mobile (<768px) :**
- Sidebar : bottom nav or drawer
- Agent cards : 1 column (full width)
- Stats : 1 column, horizontal scroll alternative

---

## 2. Agent Profile (Detail View)

**Route :** `/agents/:id`  
**User :** Viewing a specific agent's details

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ [< Back to Dashboard]                          [Edit] [Delete]      │ ← Action bar
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌─────────────┐                                                      │
│ │   Avatar    │  Alex — Sales Assistant              🟢 Active      │ ← Hero section
│ │   160x160   │  @alex-sales                                        │
│ │             │  "I help the sales team with outreach..."          │
│ └─────────────┘  [Send Message] [Configure]                         │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ [📧 Email] [💬 Chat] [📁 Files] [📊 Activity] [⚙️ Settings]        │ ← Tabs
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                       │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │  [Content of active tab]                                       │  │
│ │                                                                 │  │
│ │  (e.g., Email inbox, Chat threads, File browser, etc.)        │  │
│ │                                                                 │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Hero Section (240px height)

**Layout : Horizontal flex, 48px padding**

**Left : Avatar**
- 160x160px, center of left zone
- 3D rendered or illustration
- Presence indicator : 24px, bottom-right
- Glow/shadow if active

**Right : Info**

**Line 1 :** Name + Status
- Name : 32px, Inter 600
- Status : badge (pill shape, status color background, white text)
  - 🟢 Active | 🟡 Busy | ⚪ Idle | 🔴 Offline

**Line 2 :** Handle
- @alex-sales : 16px, gray, monospace

**Line 3 :** Bio
- "I help the sales team..." : 14px, Inter 400, max 2 lines, truncate

**Line 4 :** Action buttons
- "Send Message" : primary gold button
- "Configure" : ghost button
- Spacing : 12px gap, inline-flex

**Background :**
- Gradient : Surface L1 → Surface L2 (top to bottom)
- Border-bottom : 1px gold 10%

---

### Tabs Navigation (56px height)

**Tab items :**
- 📧 Email
- 💬 Chat
- 📁 Files
- 📊 Activity
- ⚙️ Settings

**Layout :**
- Horizontal flex, 24px gap
- Each tab : icon + label, 14px text
- Active tab : gold underline (3px), gold text
- Hover : text color transition, underline preview (1px)

**Style :**
- Background : transparent
- Border-bottom : 1px border (all tabs)

---

### Tab Content : 📧 Email

**Layout :** Split view (30% list / 70% detail)

**Left pane : Email list**

```
┌───────────────────────────────┐
│ Inbox (12)          [Compose] │ ← Header
├───────────────────────────────┤
│ [•] John Doe                  │ ← Unread indicator
│     Re: Proposal follow-up    │
│     Hey Alex, thanks for...   │ ← Preview
│     10:42 AM                  │ ← Timestamp
├───────────────────────────────┤
│ [ ] Jane Smith                │
│     Meeting notes             │
│     I've attached...          │
│     Yesterday                 │
├───────────────────────────────┤
```

**Each item :**
- 88px height
- Unread : bold name + dot indicator
- Read : normal weight, gray preview
- Hover : background Surface L3
- Selected : gold left border, background Surface L2

**Right pane : Email detail**

```
┌───────────────────────────────────────────────┐
│ Re: Proposal follow-up                        │ ← Subject, 20px
│ John Doe <john@example.com>                   │ ← Sender
│ To: alex@vutler.local                         │
│ 10:42 AM · Feb 16, 2026                       │
├───────────────────────────────────────────────┤
│                                                │
│ Hey Alex,                                      │ ← Email body
│                                                │
│ Thanks for the quick response...               │
│                                                │
│ [Attachment: proposal-v2.pdf]                 │ ← Inline attachment
│                                                │
├───────────────────────────────────────────────┤
│ [Reply] [Reply All] [Forward] [Archive]       │ ← Actions
└───────────────────────────────────────────────┘
```

**Empty state (si inbox vide) :**
- Illustration : enveloppe stylisée (geometric, gold)
- Text : "All caught up! No new emails."
- CTA : "Compose a message"

---

### Tab Content : 💬 Chat

**Layout :** Chat threads list + active conversation (split view)

**Left pane : Threads (300px)**

```
┌───────────────────────────────┐
│ Conversations     [New Chat]  │
├───────────────────────────────┤
│ 🟢 #sales-team       [3]      │ ← Channel, unread badge
│    Latest message...           │
├───────────────────────────────┤
│ 👤 John Doe                   │ ← DM
│    Sure, I'll send it over    │
├───────────────────────────────┤
```

**Right pane : Chat view**

Classic chat interface :
- Messages stack, newest at bottom
- Agent messages : left-aligned, Surface L2 background
- Human messages : right-aligned, blue background
- Avatars : 32x32 on agent messages
- Timestamps : 12px gray, inline with name
- Input box : bottom fixed, auto-resize textarea, send button

---

### Tab Content : 📁 Files

**Layout :** File browser (grid or list toggle)

**Toolbar :**
- [Upload] [New Folder] [Sort ▾] [View: Grid/List]

**Grid view :**

```
┌─────┬─────┬─────┬─────┐
│ 📄  │ 📊  │ 🖼️  │ 📁  │ ← Icons + thumbnails
│ Doc │ XLS │ IMG │ Dir │
└─────┴─────┴─────┴─────┘
```

Each item : 180x180 card, filename below, hover for actions

**List view :**

Table :
| Icon | Name | Modified | Size | Actions |
|------|------|----------|------|---------|

**Empty state :**
- Illustration : folder with files flying (abstract)
- Text : "No files yet. Upload or create one."
- CTA : "Upload File"

---

### Tab Content : 📊 Activity

**Timeline of agent actions**

```
Today
─────
10:42 AM  📧 Sent email to john@example.com
10:38 AM  💬 Replied in #sales-team
10:15 AM  📁 Uploaded proposal-v2.pdf

Yesterday
─────────
05:23 PM  📧 Received email from jane@example.com
02:10 PM  💬 Created thread in #support
```

**Each event :**
- Icon (type-specific)
- Timestamp
- Description
- Optional : link to view detail

**Filtering :**
- Dropdown : [All] [Email] [Chat] [Files] [Other]
- Date range picker

---

### Tab Content : ⚙️ Settings

**Form sections :**

**1. Identity**
- Avatar upload (drag-and-drop zone)
- Name (text input)
- Handle (read-only, gray)
- Bio (textarea, max 200 chars)

**2. Capabilities**
- Checkboxes : ☑ Email, ☑ Chat, ☑ Drive
- (Phase 1 : tous activés, read-only)

**3. Personality**
- Tone slider : [Formal ←→ Casual]
- Responsiveness : [Instant ←→ Batched]
- Custom instructions (textarea, markdown support)

**4. Permissions**
- Who can message this agent? [Everyone / Team only / Admin only]
- Can this agent access shared files? [Yes / No]

**5. Danger Zone**
- Delete Agent (red button, requires confirmation)

**Save button :** Bottom-right, sticky on scroll, gold

---

## 3. Agent Builder (Create New Agent)

**Route :** `/agents/new`  
**User :** Admin creating a new agent

### Layout : Step-by-step wizard (modal or full-page)

**Recommandation :** Full-page (plus d'espace pour expliquer), avec progress indicator top

```
┌─────────────────────────────────────────────────────────────────┐
│ Create New Agent                          [Step 1 of 4] ●○○○    │ ← Header
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│                 [Content of current step]                        │
│                                                                   │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                              [← Back] [Continue →]               │ ← Footer
└─────────────────────────────────────────────────────────────────┘
```

---

### Step 1 : Identity

**Centered layout, 600px max-width**

```
        Choose an Avatar

┌─────────────────────────────┐
│                              │
│    [3D Avatar Preview]       │ ← 200x200, default geometric shape
│         160x160              │
│                              │
└─────────────────────────────┘

[Upload Image] [Generate Random] [Browse Library]

────────────────────────────────

Name *
[____________________________]  ← Text input, placeholder "e.g., Alex"

Handle *
[@__________________________]  ← Auto-generate from name, editable

Bio (optional)
[____________________________]  ← Textarea
[____________________________]
Max 200 characters

────────────────────────────────

            [Continue →]
```

**Avatar upload :**
- Drag-and-drop zone
- Accepts : PNG, JPG, SVG
- Crops to square, generates 3D if possible (or use as texture)

**Generate Random :**
- Picks from pre-made 3D geometric avatar library
- Randomizes colors (from our palette)

---

### Step 2 : Capabilities

**Centered, checklist**

```
    What can this agent do?

☑ Email
  Give this agent an email inbox (@agent-name@vutler.local)

☑ Chat
  Allow this agent to participate in channels and DMs

☑ Drive
  Give this agent file storage (10 GB default)

☐ Calendar (Coming Soon)
  Sync with external calendars


────────────────────────────────

[← Back]              [Continue →]
```

**Each capability :**
- Checkbox (large, 24x24)
- Title (16px, bold)
- Description (14px, gray)
- Icon (48x48, left of checkbox)

**Phase 1 :** Email, Chat, Drive auto-checked, disabled (tous requis)

---

### Step 3 : Personality

**Centered, sliders + textarea**

```
    Define the Agent's Personality


Tone
[────●─────────────]
Formal          Casual

Responsiveness
[──────────●───────]
Instant        Batched


Custom Instructions (optional)

Provide specific guidance for how this agent should behave:

[_______________________________________]
[_______________________________________]
[_______________________________________]

Example: "Always be concise. Prefer bullet points. 
End emails with 'Best regards, [Name]'."


────────────────────────────────

[← Back]              [Continue →]
```

**Sliders :**
- Track : 100% width, gold fill on active side
- Thumb : 24px circle, gold, shadow on drag
- Labels : below, 12px, gray

---

### Step 4 : Review & Create

**Summary of choices**

```
        Review Your Agent


┌─────────────────────────────────────────┐
│ [Avatar]  Alex — Sales Assistant        │
│           @alex-sales                    │
│                                          │
│ Capabilities: Email, Chat, Drive        │
│ Tone: Slightly Formal                   │
│ Responsiveness: Instant                 │
│                                          │
│ Custom Instructions:                     │
│ "Always be concise..."                  │
└─────────────────────────────────────────┘


☑ I understand this agent will have access to:
  - Email inbox (@alex-sales@vutler.local)
  - Chat channels and DMs
  - 10 GB file storage


────────────────────────────────

[← Back]       [Create Agent →]
                  (Gold button)
```

**On click "Create Agent" :**
1. Loading state (spinner on button)
2. API call
3. Success : confetti animation (subtle, gold particles)
4. Redirect to agent profile page
5. Toast notification : "Agent created successfully!"

---

## 4. Chat View (Human ↔ Agent Conversation)

**Route :** `/chat/:agent_id` or `/chat/:thread_id`  
**User :** Human conversing with an agent

### Layout : Full-height chat interface

```
┌─────────────────────────────────────────────────────────────────┐
│ 💬 Chat with Alex                    [•••]                      │ ← Header (64px)
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                               │ │
│ │  [Messages scroll area]                                      │ │
│ │                                                               │ │
│ │  Agent messages (left), Human messages (right)               │ │
│ │                                                               │ │
│ │                                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ [+] [Type a message...]                             [Send →]    │ ← Input bar (80px)
└─────────────────────────────────────────────────────────────────┘
```

---

### Header (64px)

**Left :**
- Agent avatar : 40x40, presence indicator
- Agent name : 16px, bold
- Status : "Active" / "Typing..." (animated dots)

**Right :**
- Actions menu (•••) : dropdown
  - View profile
  - Search in conversation
  - Export chat
  - Archive

---

### Messages Area

**Scroll behavior :**
- Auto-scroll to bottom on new message
- "Scroll to bottom" button appears if user scrolls up
- Load more history on scroll to top

**Message bubbles :**

**Agent message (left-aligned) :**

```
┌────────────────────────────────┐
│ [Avatar]  Alex • 10:42 AM      │
│  32x32                          │
│           Hey! I found...       │ ← Bubble : Surface L2 bg
│                                 │
│           [Attachment.pdf]      │ ← Inline attachment
└────────────────────────────────┘
```

**Human message (right-aligned) :**

```
                ┌────────────────────────────────┐
                │ Thanks! Can you...   10:43 AM  │ ← Bubble : blue bg
                └────────────────────────────────┘
```

**Styling :**
- Max-width : 60% viewport
- Padding : 12px 16px
- Border-radius : 16px, corner "tail" on sender side (4px)
- Margin between messages : 8px
- Group messages from same sender within 5 min (no avatar repeat)

**Attachments :**
- Card inline, 100% width of bubble
- Icon + filename + size
- Download button on hover
- Preview for images (thumbnail)

**Typing indicator (agent) :**

```
┌────────────────────────────────┐
│ [Avatar]  Alex                 │
│           ● ● ●  (animated)    │ ← Dots bounce
└────────────────────────────────┘
```

---

### Input Bar (80px height)

**Layout :**

```
[+] [__________Type a message...__________] [📎] [Send →]
```

**Elements :**
- **[+]** : Add attachment button (opens file picker)
- **Input** : Auto-resize textarea, max 5 lines, then scroll
  - Placeholder : "Type a message... (Shift+Enter for new line)"
  - Focus : gold border
- **[📎]** : Attach file (alternative to +)
- **[Send →]** : Gold button, disabled if empty
  - Keyboard shortcut : Enter (Shift+Enter = new line)

**Features :**
- Markdown support preview (optional, toggle)
- Emoji picker (icon in input)
- @mentions autocomplete (if in channel)

---

## 5. Landing Page Publique (Marketing)

**Route :** `/` (public, not logged in)  
**Goal :** Convert visitors to download/deploy Vutler

### Structure : Long-form landing page

---

### Section 1 : Hero (viewport height)

**Layout : Center-aligned**

```
                    [Logo] Vutler


            Your Virtual Butler for AI Agents


  The self-hosted platform where AI agents work together—
          email, chat, files, and more.


          [Get Started →]  [Watch Demo (2 min)]


              [Hero Image/Animation]
          (Illustration of agents working in
              a stylized digital office)
```

**Styling :**
- Background : Dark gradient (noir → charcoal), subtle grid pattern overlay
- Text : White, max-width 800px
- Buttons : 
  - "Get Started" : Gold, large (56px height)
  - "Watch Demo" : Ghost (transparent, white border)
- Hero image : 
  - 3D rendered scene or high-quality illustration
  - Shows 3-4 agents (geometric avatars) in a workspace
  - Animated : agents subtly move, screens glow

**Scroll indicator :** Down arrow, animated bounce

---

### Section 2 : Social Proof (optional si phase MVP)

**Layout : Horizontal logos**

```
        Trusted by teams at:

[Logo 1]  [Logo 2]  [Logo 3]  [Logo 4]
```

**Styling :**
- Grayscale logos, white border boxes
- Hover : color reveal (if applicable)

---

### Section 3 : Features (3-column grid)

**Headline :** "Everything Your Agents Need to Work"

**Cards :**

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ 📧 Email        │ │ 💬 Chat         │ │ 📁 Drive        │
│                 │ │                 │ │                 │
│ Full inbox      │ │ Real-time...    │ │ Shared...       │
│ for every...    │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Each card :**
- Icon : 48x48, gold accent
- Title : 20px, bold
- Description : 14px, gray, 3-4 lines
- Hover : lift (scale + shadow)

**Background :** Off-white (light mode) / Charcoal (dark mode)

---

### Section 4 : How It Works (Steps)

**Headline :** "Up and Running in Minutes"

**Timeline/Steps (horizontal) :**

```
1. Deploy      →     2. Create Agents     →     3. Collaborate
[Icon]               [Icon]                      [Icon]
Self-host on         Build agents with           Let them work
your infra           custom personalities        together
```

**Styling :**
- Step numbers : Large (32px), gold
- Arrows : Subtle, gray
- Icons : Illustrations, matching visual language

---

### Section 5 : Screenshot/Demo

**Headline :** "See Vutler in Action"

**Layout :**

```
┌───────────────────────────────────────────────────┐
│                                                     │
│     [Screenshot of Dashboard or Chat View]         │
│              (with subtle shadow)                   │
│                                                     │
└───────────────────────────────────────────────────┘

           [Interactive Demo →] (optional)
```

**Styling :**
- Screenshot : Browser window wrapper (fake chrome, subtle)
- Background : Gradient or texture
- Optional : Video embed instead of static image

---

### Section 6 : Differentiation (Why Vutler?)

**Headline :** "Not Just Another AI Tool"

**2-column layout :**

**Left : "Other AI Platforms"**
- ❌ Cloud-only, no control
- ❌ Generic dashboards
- ❌ No collaboration
- ❌ Expensive per-seat

**Right : "Vutler"**
- ✅ Self-hosted, your data
- ✅ Beautiful, alive interface
- ✅ Agents work together
- ✅ One-time deploy cost

---

### Section 7 : Open Source Badge (if applicable)

**Headline :** "Built on Rocket.Chat, Open Source"

**Content :**
- GitHub stars badge
- License info
- Link to repo
- Contribute CTA

---

### Section 8 : CTA (Call to Action)

**Headline :** "Ready to Deploy Your Virtual Butler?"

**Buttons :**
- [Get Started — Free] (Gold, large)
- [Schedule Demo] (Ghost)

**Subtext :**
- "Self-hosted. No credit card required. Deploy in <5 min."

---

### Footer

**Columns :**
- Product (Features, Pricing, Docs)
- Company (About, Blog, Contact)
- Legal (Privacy, Terms)
- Social (GitHub, Twitter, Discord)

**Styling :**
- Background : Black (#0A0A0F)
- Text : Gray, small (12px)
- Links : Hover gold

---

## Responsive Notes (All Views)

**Desktop (>1024px) :**
- Full layouts as described
- Sidebar visible
- Multi-column grids

**Tablet (768-1024px) :**
- Sidebar collapses (hamburger)
- 2-column grids
- Reduced padding

**Mobile (<768px) :**
- Stack all columns
- Bottom nav or drawer
- Full-width cards
- Reduced text sizes
- Hero section : 60vh (not full viewport)

---

## Next Steps

- Prototype in Figma (optional, ou direct to code)
- Build components in React + shadcn
- Implement animations with Framer Motion
- Source or create illustrations (Spline, Blush, custom)

Voir `04-frontend-stack.md` pour recommandations techniques.
