# Pixel Office — Technical Specifications

## 1. Architecture

### File Structure
```
dashboard.html          — Single-page app (sidebar + all views)
  └── Chat view         — Pixel Office canvas + chat panel
  └── Dashboard view    — Stats & metrics
  └── Agents view       — Agent list/table
  └── Other views       — Placeholders
```

### Layout
```
┌──────────────────────────────────────────────────┐
│ No topbar — sidebar handles navigation           │
├────────┬─────────────────────────────────────────┤
│SIDEBAR │ CONTENT AREA (100% of remaining space)  │
│ 240px  │                                         │
│        │ When view = "chat":                     │
│ Logo   │ ┌─────────────────────┬────────────────┐│
│        │ │ PIXEL OFFICE CANVAS │ CHAT PANEL     ││
│ WORK   │ │ (fills all space)   │ (380px, slide) ││
│ □ Dash │ │                     │                ││
│ ■ Chat │ │ 6 rooms + corridor  │ Agent header   ││
│ □ Agent│ │ 13 animated agents  │ Messages       ││
│ □ Build│ │ Furniture sprites   │ Input          ││
│        │ │                     │                ││
│ TOOLS  │ │ Zoom: + − ⊞        │                ││
│ □ Email│ └─────────────────────┴────────────────┘│
│ □ Tasks│                                         │
│ □ Cal  │ When view = "agents":                   │
│ □ Drive│ ┌──────────────────────────────────────┐│
│        │ │ Agent Table (13 rows)                ││
│ CONFIG │ │ Name | Role | Model | Status | Action││
│ □ Prov │ └──────────────────────────────────────┘│
│ □ LLM  │                                         │
│ □ Usage│ When view = "dashboard":                │
│ □ Sett │ ┌────┐ ┌────┐ ┌────┐ ┌────┐           │
│        │ │13  │ │24K │ │99% │ │ 42 │           │
│ DISC   │ │agt │ │tkns│ │up  │ │msg │           │
│ □ Templ│ └────┘ └────┘ └────┘ └────┘           │
│ □ Markt│                                         │
│        │                                         │
│ © 2026 │                                         │
└────────┴─────────────────────────────────────────┘
```

## 2. Pixel Office Canvas

### Dimensions
- **Native buffer**: 960 × 640 pixels
- **Render**: scaled to fill content area via CSS transform
- **Pixel art**: `image-rendering: pixelated` for crisp upscaling

### Room Layout (pixel coordinates on 960×640 buffer)
```
 16,16 ┌──────────┐ 336,16 ┌──────────┐ 656,16 ┌──────────┐
       │   OPS    │        │ENGINEERING│        │CONFERENCE │
       │  280×180 │        │  280×180  │        │  280×180  │
       │ Jarvis   │        │ Mike      │        │ (meetings)│
       │ Andrea   │        │ Philip    │        │           │
       │ Max      │        │ Luna      │        │           │
       │ Victor   │        │           │        │           │
 16,196└──────────┘ 336,196└──────────┘ 656,196└──────────┘
       ════════════ CORRIDOR (y:196-340, 144px) ════════════
 16,340┌──────────┐ 356,340┌──────────┐ 656,340┌──────────┐
       │  LOUNGE  │        │ WAR ROOM │        │  SERVER   │
       │  300×280 │        │  260×280 │        │  280×280  │
       │ Oscar    │        │ Sentinel │        │ Rex       │
       │ Nora     │        │ Marcus   │        │           │
       │ Stephen  │        │          │        │           │
 16,620└──────────┘ 616,620└──────────┘ 936,620└──────────┘
```

### Furniture Sprites (drawn procedurally)

Each furniture piece is a function that draws pixel art at given coordinates:

| Furniture | Size (px) | Rooms | Details |
|-----------|-----------|-------|---------|
| Desk + Monitor | 48×40 | OPS, ENG, WAR | Wood desk, monitor with code lines, keyboard |
| Chair | 14×18 | All offices | Wheeled office chair, colored seat |
| Plant | 20×22 | OPS, ENG, Lounge | Pot + leafy plant, 3 shades of green |
| Server Rack | 20×40 | Server Room | Dark metal, 5 LED slots (blinking R/G/B) |
| Big Screen | variable | Conference, WAR | World map dots, blinking cursor |
| Conference Table | 160×54 | Conference | Long wood table with notepads |
| Couch | variable | Lounge | Brown leather, armrests |
| Coffee Machine | 20×28 | OPS, Lounge | Dark body, green LED display, steam animation |
| Vending Machine | 24×36 | Lounge | Green body, 9 colored items, blinking LED |
| Ping Pong Table | 48×34 | Lounge | Green felt, white net and lines |
| Water Cooler | 16×26 | Lounge | Blue bottle on white body |

### Agent Sprites

```
   ████          ← Hair (agent-specific color)
  ██████         ← Head (skin #FFD5B0)
  █○  ○█         ← Eyes (blink every ~4s)
  ██████
 ████████        ← Body (agent color)
 ██ ██ ██        ← Arms (agent color)
 ████████
  ██  ██         ← Legs (dark, animate when walking)
  ██  ██
```

**Size**: 18×22 pixels per agent sprite
**Colors**: Each agent has unique body color (from AGENTS array)
**Animations**:
- Idle: eyes blink every 120 frames (~4s at 30fps)
- Working: hands alternate typing (every 12 frames)
- Walking: legs alternate (sin wave at 0.4 rad/frame)
- Bubble: text fades after 150 frames

### Agent States & Behaviors

| State | Visual | Where | Trigger |
|-------|--------|-------|---------|
| working | Seated at desk, typing | Own desk | Default for non-idle |
| idle | Wandering, standing | Lounge, corridor | Oscar, Nora, Stephen default |
| meeting | Seated at conf table | Conference room | sendToConference() |
| chatting | Bubble "Hello! 👋" | Current position | User clicks agent |
| break | Near coffee/vending | Lounge | Random every ~5 min |
| offline | Grayed out sprite | Absent | API reports offline |

### Pathfinding
- Simple waypoint system (not full A* for MVP)
- Agent generates intermediate points between current pos and target
- Moves 2px per frame along path
- Respects room boundaries (stays within room unless transitioning)

## 3. Chat Panel

### Behavior
1. User clicks agent on canvas → panel slides from right (380px)
2. Panel shows: avatar, name, role, online status
3. Message history (per-agent, stored in JS memory)
4. User types message → POST to API → shows response
5. Agent sprite shows "Thinking..." bubble during API call
6. ESC or back button closes panel

### API Integration
```javascript
// Try v1 first, fallback to non-versioned
const endpoints = [
  `/api/v1/agents/${agentId}/chat`,
  `/api/agents/${agentId}/chat`
];
// Headers: Authorization: Bearer <token>
// Body: { message: "user text" }
// Response: { reply: "agent response" } or { response: "..." } or { message: "..." }
```

## 4. Dashboard Views

### Dashboard (stats)
- 4 stat cards: Agents Online (13), Total Tokens (from API), Uptime (99.9%), Messages Today
- Cards use dark theme with colored accents

### Agents (table)
- Table with columns: Name, Emoji, Role, Model, Status, Last Active, Actions
- 13 rows, all showing "Online" status
- "Chat" button in Actions column → switches to Chat view and opens that agent

### Other views
- Builder, Email, Tasks, Calendar, Drive, Providers, LLM Settings, Usage, Settings, Templates, Marketplace
- All show placeholder: icon + "Coming Soon" + description

## 5. Responsive Design

### Desktop (>1024px)
- Sidebar: 240px fixed
- Content: remaining space
- Chat panel: 380px overlay from right

### Tablet (768-1024px)
- Sidebar: collapsible (icon-only 60px)
- Content: full width
- Chat panel: 380px overlay

### Mobile (<768px)
- Sidebar: hidden, replaced by bottom nav (5 icons)
- Content: full width
- Chat panel: full width overlay
- Canvas: touch drag + pinch zoom

## 6. Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| --bg | #1a1a2e | Page background |
| --sidebar | #16162b | Sidebar background |
| --card | #22223a | Card backgrounds |
| --border | #3a3a5a | Borders |
| --blue | #7c7cff | Primary accent |
| --green | #22C55E | Online/success |
| --red | #EF4444 | Error/critical |
| --yellow | #EAB308 | Warning/idle |
| --light | #F8FAFC | Primary text |
| --gray | #8888aa | Secondary text |

## 7. Agent Data

```javascript
const AGENTS = [
  {id:'jarvis',  name:'Jarvis',  emoji:'🤖', role:'Coordinator & Strategy',  room:'ops',        color:'#7c7cff', state:'working'},
  {id:'andrea',  name:'Andrea',  emoji:'📋', role:'Office Manager & Legal',   room:'ops',        color:'#f472b6', state:'working'},
  {id:'max',     name:'Max',     emoji:'📈', role:'Marketing & Growth',       room:'ops',        color:'#34d399', state:'working'},
  {id:'victor',  name:'Victor',  emoji:'💰', role:'Sales',                    room:'ops',        color:'#fbbf24', state:'working'},
  {id:'mike',    name:'Mike',    emoji:'⚙️', role:'Lead Engineer',            room:'engineering', color:'#22d3ee', state:'working'},
  {id:'philip',  name:'Philip',  emoji:'🎨', role:'UI/UX Designer',           room:'engineering', color:'#a78bfa', state:'working'},
  {id:'luna',    name:'Luna',    emoji:'🧪', role:'Product Manager',          room:'engineering', color:'#fbbf24', state:'working'},
  {id:'oscar',   name:'Oscar',   emoji:'📝', role:'Content Writer',           room:'lounge',     color:'#fb923c', state:'idle'},
  {id:'nora',    name:'Nora',    emoji:'🎮', role:'Community Manager',        room:'lounge',     color:'#f87171', state:'idle'},
  {id:'stephen', name:'Stephen', emoji:'📖', role:'Spiritual Research',       room:'lounge',     color:'#c084fc', state:'idle'},
  {id:'sentinel',name:'Sentinel',emoji:'📰', role:'News Intelligence',        room:'warroom',    color:'#38bdf8', state:'working'},
  {id:'marcus',  name:'Marcus',  emoji:'📊', role:'Portfolio Manager',        room:'warroom',    color:'#4ade80', state:'working'},
  {id:'rex',     name:'Rex',     emoji:'🛡️', role:'Security',                room:'server',     color:'#f43f5e', state:'working'},
];
```

---

*Specs v1.0 — 27 Feb 2026*
