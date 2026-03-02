# Pixel Office — Analyse Architecture & Plan

> Date: 2026-03-02
> Statut: Architecture complète pour implémentation future
> Priorité: Beta (feature flag dans Settings)

---

## 🎯 Vision du Pixel Office (Concept Original)

Bureau virtuel pixel art où les agents IA se déplacent en temps réel selon leurs activités :

```
┌─────────────────────────────────────────────────────────┐
│  PIXEL OFFICE — Vue Top-Down                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌───────────┐        ┌─────────────┐                 │
│   │  ☕ Cafe  │        │ 📊 War Room │                 │
│   │           │        │   (meet)    │                 │
│   │  ┌───┐    │        │  ┌─┐   ┌─┐  │                 │
│   │  │ 👤│    │        │  │👤│   │👤│  │                 │
│   │  └───┘    │        │  └─┘   └─┘  │                 │
│   └───────────┘        └─────────────┘                 │
│                                                         │
│   ┌───────────────────────────────────────┐            │
│   │         🏢 OPEN SPACE                 │            │
│   │                                       │            │
│   │   ┌───┐  ┌───┐  ┌───┐  ┌───┐         │            │
│   │   │ 👤│  │ 👤│  │ 👤│  │ ★ │  ← Nexus│            │
│   │   └───┘  └───┘  └───┘  └───┘         │            │
│   │   [Dev]  [Mkt]  [QA]   [Coord]       │            │
│   └───────────────────────────────────────┘            │
│                                                         │
│   ┌─────────────┐        ┌─────────────┐               │
│   │ 🌐 Mission  │        │ 🌐 Mission  │               │
│   │ @ Acme Corp │        │ @ TechStart │               │
│   │    [👤]     │        │    [👤]     │               │
│   └─────────────┘        └─────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Comportements Attendus

| Activité | Comportement Agent | Animation |
|----------|-------------------|-----------|
| **Idle** | Reste à son bureau | Respiration lente (scale 1.0 → 1.02) |
| **Task** | Reste concentré, statut 🟡 | Indicateur "busy" + barre de progression |
| **Meeting** | Se déplace vers War Room | Marche animée vers la salle |
| **Pause** | Va au Café | Marche + animation café |
| **Deployé** | Disparaît du bureau | Réapparaît dans zone "Missions Externes" |
| **Offline** | S'assombrit/opacité 50% | Pas d'animation |

---

## 🔴 Ce qui Manque Actuellement

### 1. Backend — APIs

| API | Statut | Description |
|-----|--------|-------------|
| `GET /api/v1/pixel-office/rooms` | ❌ Manque | Liste des salles avec coordonnées |
| `GET /api/v1/pixel-office/positions` | ❌ Manque | Positions X/Y actuelles des agents |
| `GET /api/v1/pixel-office/activities` | ❌ Manque | Activités en cours (tasks, meetings) |
| `POST /api/v1/pixel-office/rooms/:id/join` | ❌ Manque | Rejoindre une salle (meeting) |
| `GET /api/v1/pixel-office/layout` | ❌ Manque | Layout du bureau selon plan |
| WebSocket `/ws/pixel-office` | ❌ Manque | Updates temps réel positions/activités |

### 2. Backend — Database Schema

```sql
-- Table: pixel_office_rooms
CREATE TABLE pixel_office_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL, -- "Open Space", "War Room", "Café", "Mission Externe"
  type TEXT NOT NULL, -- "open_space", "meeting", "break", "external"
  x INTEGER NOT NULL, -- Position X sur la carte (grid 0-100)
  y INTEGER NOT NULL, -- Position Y sur la carte (grid 0-100)
  width INTEGER NOT NULL DEFAULT 20,
  height INTEGER NOT NULL DEFAULT 15,
  capacity INTEGER DEFAULT 1, -- Nombre max d'agents
  color TEXT DEFAULT '#3b82f6', -- Couleur de la zone
  icon TEXT, -- Emoji/icon
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: pixel_office_agent_positions
CREATE TABLE pixel_office_agent_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  room_id UUID REFERENCES pixel_office_rooms(id),
  x DECIMAL(5,2) NOT NULL DEFAULT 50, -- Position précise (0.00 - 100.00)
  y DECIMAL(5,2) NOT NULL DEFAULT 50,
  target_x DECIMAL(5,2), -- Destination en cours (si déplacement)
  target_y DECIMAL(5,2),
  status TEXT DEFAULT 'idle', -- idle, moving, working, meeting, break
  activity TEXT, -- Description de l'activité en cours
  meeting_id UUID, -- Si en réunion
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: pixel_office_meetings
CREATE TABLE pixel_office_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  room_id UUID REFERENCES pixel_office_rooms(id),
  title TEXT NOT NULL,
  agent_ids UUID[] NOT NULL, -- Agents participants
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  topic TEXT, -- Sujet de la réunion (ex: "Sprint Planning")
  auto_generated BOOLEAN DEFAULT true -- Créée automatiquement par l'orchestrateur
);

-- Table: pixel_office_layouts (par plan)
CREATE TABLE pixel_office_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  plan_type TEXT NOT NULL, -- 'free', 'starter', 'pro', 'enterprise'
  name TEXT NOT NULL,
  rooms JSONB NOT NULL, -- Configuration complète des salles
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_positions_agent ON pixel_office_agent_positions(agent_id);
CREATE INDEX idx_agent_positions_room ON pixel_office_agent_positions(room_id);
CREATE INDEX idx_agent_positions_ws ON pixel_office_agent_positions(workspace_id);
```

### 3. Backend — Services

| Service | Statut | Description |
|---------|--------|-------------|
| `PixelOfficeEngine` | ❌ Manque | Moteur de simulation (tick 1s) |
| `AgentMovementService` | ❌ Manque | Gère les déplacements A→B |
| `MeetingOrchestrator` | ❌ Manque | Crée/résout les réunions auto |
| `ActivitySimulator` | ❌ Manque | Simule les activités des agents |
| `WebSocketBroadcaster` | ❌ Manque | Push temps réel aux clients |

### 4. Frontend — Composants

| Composant | Statut | Description |
|-----------|--------|-------------|
| `PixelMap` | ❌ Manque | Canvas avec grille et salles |
| `AgentAvatarAnimated` | ⚠️ Partiel | SVG pixel existant, mais pas d'animation de marche |
| `RoomZone` | ❌ Manque | Zone cliquable d'une salle |
| `MovementPath` | ❌ Manque | Ligne de déplacement A→B |
| `ActivityIndicator` | ❌ Manque | Bulle "Working on..." |
| `MeetingPopup` | ❌ Manque | Popup réunion en cours |

### 5. Frontend — Hooks/State

| Hook | Statut | Description |
|------|--------|-------------|
| `usePixelOffice` | ❌ Manque | Hook principal (positions, activités) |
| `useWebSocket` | ⚠️ Existe | `/api/websocket` existe mais pas pour pixel-office |
| `useAgentMovement` | ❌ Manque | Interpolation smooth des déplacements |
| `useMeetingManager` | ❌ Manque | Gérer les réunions |

---

## 🟡 Architecture Proposée

### Flux de Données

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Frontend  │ ◄─────────────────►│  PixelOffice    │
│  (Canvas)   │    positions       │   WebSocket     │
└──────┬──────┘    activities      └────────┬────────┘
       │                                     │
       │ HTTP                                │ tick(1s)
       ▼                                     ▼
┌─────────────┐                    ┌─────────────────┐
│    API      │◄──────────────────►│  PixelOffice    │
│   Routes    │   CRUD positions   │    Engine       │
└──────┬──────┘                    │  (Simulation)   │
       │                           └─────────────────┘
       ▼                                    │
┌─────────────┐                    ┌────────┴────────┐
│  PostgreSQL │                    │   Agent Tasks   │
│  (positions)│                    │   (real data)   │
└─────────────┘                    └─────────────────┘
```

### Simulation Engine (Pseudo-code)

```typescript
// PixelOfficeEngine.ts
class PixelOfficeEngine {
  tick() {
    // 1. Récupérer les agents actifs
    // 2. Pour chaque agent:
    //    - Si a une task en cours → statut 'working', reste en place
    //    - Si plusieurs agents sur même task → créer meeting dans War Room
    //    - Si idle depuis > 5min → 20% chance d'aller au Café
    //    - Si meeting programmé → pathfinding vers salle
    // 3. Calculer les déplacements (lerp positions)
    // 4. Broadcast WebSocket aux clients
  }
}

// Exécution: setInterval(() => engine.tick(), 1000)
```

---

## 🔵 Plan d'Implémentation (Quand Priorisé)

### Phase 1 — Backend Core (3-4 jours)
- [ ] Créer les tables SQL (rooms, positions, meetings, layouts)
- [ ] API REST CRUD basique
- [ ] WebSocket `/ws/pixel-office`
- [ ] Seed data (salles par défaut)

### Phase 2 — Simulation Engine (3-4 jours)
- [ ] `PixelOfficeEngine` class avec tick
- [ ] Intégration avec Tasks API (agents "travaillent" sur vraies tâches)
- [ ] Auto-meeting quand agents collaborent
- [ ] Pathfinding simple (A* ou ligne droite avec obstacles)

### Phase 3 — Frontend Canvas (4-5 jours)
- [ ] Composant `PixelMap` avec canvas
- [ ] Rendu des salles (zones colorées)
- [ ] Rendu des agents avec animations
- [ ] Interactions (clic agent → détails, clic salle → rejoindre)

### Phase 4 — Polish (2-3 jours)
- [ ] Animations smooth (déplacements)
- [ ] Indicateurs d'activité (bulles "Working on...")
- [ ] Sound effects optionnels
- [ ] Mobile responsive (simplifié)

**Total estimé: 12-16 jours**

---

## 🟢 Feature Flag (Implémentation Immédiate)

Pour mettre dans Settings maintenant:

```typescript
// Dans Settings > Feature Flags/Beta
{
  id: 'pixel_office_enabled',
  name: 'Pixel Office (Beta)',
  description: 'Enable the virtual pixel office with real-time agent simulation. Agents will appear in rooms, attend meetings, and move based on their tasks.',
  default: false,
  plan_required: 'pro', // ou 'all' pour test
  warning: 'Beta feature — may impact performance'
}
```

### Quand activé:
- Sidebar: "Pixel Office" devient cliquable (au lieu de juste externe)
- Page: `/pixel-office` montre le bureau virtuel (pas juste une grille)
- Settings: Options supplémentaires (layout editor, animations)

### Quand désactivé:
- Sidebar: "Pixel Office" masqué ou "Coming Soon" badge
- Redirection vers dashboard si accès direct

---

## 📊 Comparaison: Actuel vs Cible

| Aspect | Actuel (Sprint 7) | Cible (Full) | Gap |
|--------|-------------------|--------------|-----|
| **Affichage** | Grille statique | Canvas temps réel | ❌ Grand |
| **Positions** | Fixes | X/Y dynamiques | ❌ Grand |
| **Mouvement** | Aucun | Pathfinding + animations | ❌ Grand |
| **Salles** | 2 zones texte | 4-6 zones interactives | ❌ Moyen |
| **Réunions** | Aucune | Auto-created, visibles | ❌ Grand |
| **Activités** | Statut texte | Bulles contextuelles | ❌ Moyen |
| **Temps réel** | Poll 30s | WebSocket instant | ❌ Grand |

---

## 🎯 Recommandation

**Court terme (cette semaine):**
1. ✅ Feature flag dans Settings (documenté)
2. ✅ Message "Beta - Coming Soon" sur `/pixel-office`
3. ✅ Garder l'affichage grille actuel comme fallback

**Moyen terme (quand priorisé):**
1. Implémenter Phase 1-2 (backend simulation)
2. Implémenter Phase 3 (frontend canvas)
3. Beta test avec users Pro/Enterprise

**Notes:**
- C'est une feature lourde (~2 semaines) mais différenciante
- Dépend de l'orchestrateur multi-agent (Nexus) pour être vraiment utile
- Peut être un upsell Pro/Enterprise fort
