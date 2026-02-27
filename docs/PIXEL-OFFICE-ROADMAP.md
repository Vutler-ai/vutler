# Vutler Pixel Office — Roadmap & Architecture

## 🎯 Vision
Le Pixel Office est la vue "Chat" du dashboard Vutler existant. Ce n'est PAS une app séparée — c'est une section intégrée dans le dashboard complet avec sidebar/navigation.

## 📐 Architecture cible

```
┌─────────────────────────────────────────────┐
│  TOPBAR: Vutler logo | breadcrumb | user    │
├──────────┬──────────────────────────────────┤
│ SIDEBAR  │  MAIN CONTENT AREA              │
│          │                                  │
│ WORKSPACE│  Dashboard → stats/metrics       │
│ Dashboard│  Chat → PIXEL OFFICE + panels    │
│ Chat ◄───│  Agents → list/detail table      │
│ Agents   │  Builder → agent config          │
│ Builder  │  Email → inbox                   │
│          │  Tasks → kanban/list             │
│ TOOLS    │  Calendar → events               │
│ Email    │  Drive → files                   │
│ Tasks    │  etc.                            │
│ Calendar │                                  │
│ Drive    │                                  │
│          │                                  │
│ CONFIG   │                                  │
│ Providers│                                  │
│ LLM      │                                  │
│ Usage    │                                  │
│ Settings │                                  │
│          │                                  │
│ DISCOVER │                                  │
│ Templates│                                  │
│ Market   │                                  │
└──────────┴──────────────────────────────────┘
```

## Vue "Chat" (Pixel Office)
```
┌──────────────────────────────────────┐
│  Pixel Office Canvas (60%)           │  Chat Panel (40%)
│                                      │  ┌────────────────┐
│  ┌─────┐ ┌─────┐ ┌─────┐           │  │ 🤖 Jarvis      │
│  │ OPS │ │ ENG │ │CONF │           │  │ Coordinator     │
│  │ 🤖📋│ │⚙️🎨│ │     │           │  │ ● Online        │
│  │ 📈💰│ │ 🧪 │ │     │           │  ├────────────────┤
│  └─────┘ └─────┘ └─────┘           │  │                │
│  ═══════ CORRIDOR ═══════           │  │ Chat messages   │
│  ┌──────┐ ┌─────┐ ┌─────┐          │  │                │
│  │LOUNGE│ │ WAR │ │ SVR │          │  │                │
│  │📝🎮📖│ │📰📊│ │ 🛡️ │          │  ├────────────────┤
│  └──────┘ └─────┘ └─────┘          │  │ [Message...]   │
│                                      │  └────────────────┘
│  Zoom: + − ⊞  |  Agents: 13 online │
└──────────────────────────────────────┘
```

## Ce qu'on a déjà (✅)
- Dashboard complet avec sidebar (toutes les pages)
- 13 agents configurés dans l'API
- JWT auth (login/register)
- Chat API fonctionnel (`/api/agents/:id/chat`)
- Marketplace avec 12 templates
- Pixel Office v3 prototype (canvas séparé)

## Ce qu'il manque
1. Le Pixel Office n'est pas intégré dans le dashboard
2. Les sprites ne ressemblent pas aux images de référence
3. Pas de vraie animation de vie (pathfinding, états)
4. Dashboard "Chat" montre juste un chat texte basique

---

## 🗓️ Phases de développement

### Phase 1 — Intégration Dashboard (Sprint 12)
**Objectif:** Intégrer le canvas Pixel Office dans la vue "Chat" du dashboard existant, à côté d'un chat panel.

**Tâches:**
- [ ] 1.1 Modifier le dashboard existant pour que "Chat" charge le canvas pixel office
- [ ] 1.2 Layout split: canvas (gauche 60%) + chat panel (droite 40%)
- [ ] 1.3 Click sur agent dans le canvas → ouvre le chat avec cet agent
- [ ] 1.4 Garder toutes les autres sections du dashboard intactes (Agents, Builder, Email, etc.)
- [ ] 1.5 Mobile: canvas full-width, chat slide-over

**Critère de succès:** Le dashboard garde sa sidebar, et la vue Chat montre le bureau pixel avec chat intégré.

### Phase 2 — Sprites & Environnement (Sprint 13)
**Objectif:** Rendre le bureau visuellement fidèle aux images de référence.

**Tâches:**
- [ ] 2.1 Créer une sprite sheet (PNG) avec le mobilier pixel art fidèle aux références
- [ ] 2.2 Utiliser les 3 images de référence comme source de style :
  - `reference-starter.jpg` — Studio (1-5 agents)
  - `reference-business.jpg` — 6 pièces (6-15 agents) ← **priorité**
  - `reference-enterprise.jpg` — Étage complet (15-50+)
- [ ] 2.3 Dessiner les meubles en sprite sheet : desks avec multi-écrans, chaises de bureau, serveurs, plantes détaillées, canapés, ping-pong, distributeurs, machines café, frigo
- [ ] 2.4 Tile map éditeur ou JSON map pour placer le mobilier
- [ ] 2.5 Walls avec texture brique/béton, sols carrelés variés, portes animées

**Critère de succès:** Le bureau ressemble aux images de référence (style pixel art pro).

### Phase 3 — Agents Vivants (Sprint 14)
**Objectif:** Les agents bougent, vivent, réagissent.

**Tâches:**
- [ ] 3.1 Sprite sheet agents : 4 directions × 3 frames (idle, walk, sit)
- [ ] 3.2 Chaque agent a un avatar pixel unique (couleur cheveux, vêtements, accessoires)
- [ ] 3.3 A* pathfinding sur le tilemap (respecte murs, portes, meubles)
- [ ] 3.4 États animés :
  - `working` → assis à son poste, tape au clavier
  - `idle` → se balade, va au café, ping-pong
  - `meeting` → marche vers conf room, s'assoit
  - `chatting` → bulle de dialogue quand on lui parle
  - `break` → lounge, café, distributeur
  - `offline` → sprite grisé ou absent
- [ ] 3.5 Transitions animées entre états (agent se lève, marche, s'assoit)
- [ ] 3.6 Bulles de texte contextuelles ("coding...", "reviewing PR", "☕ Break")

**Critère de succès:** Les agents se déplacent fluidement et ont des comportements réalistes.

### Phase 4 — Interactivité (Sprint 15)
**Objectif:** L'utilisateur peut interagir avec le bureau.

**Tâches:**
- [ ] 4.1 Click agent → ouvre chat + agent réagit (se tourne, bulle "Hello!")
- [ ] 4.2 Click conf room → group chat (tous les agents de la salle répondent)
- [ ] 4.3 Drag & drop agent → le déplacer dans une autre salle
- [ ] 4.4 Mini-map en coin (vue d'ensemble du bureau)
- [ ] 4.5 Tooltip riche au hover (nom, rôle, état, dernière activité)
- [ ] 4.6 Notifications visuelles (agent clignote quand il a un message)

**Critère de succès:** Le bureau est intuitif et ludique à utiliser.

### Phase 5 — Plans tarifaires (Sprint 16)
**Objectif:** 3 variantes de bureau selon le plan.

**Tâches:**
- [ ] 5.1 **Starter** — Studio unique (1 pièce, coin café, 2-5 postes)
- [ ] 5.2 **Business** — Bureau 6 pièces (OPS, Engineering, Conf, Lounge, War Room, Server)
- [ ] 5.3 **Enterprise** — Étage complet (open spaces, cafétéria, salle de sport, terrasse, multi-étages)
- [ ] 5.4 Sélection automatique du plan selon le nombre d'agents
- [ ] 5.5 Preview "Upgrade" — montrer le bureau du plan supérieur en grisé

**Critère de succès:** Chaque plan a un bureau visuellement distinct et motivant.

### Phase 6 — Real-time & API (Sprint 17)
**Objectif:** Connecter le pixel office à l'état réel des agents.

**Tâches:**
- [ ] 6.1 WebSocket pour état real-time des agents (online/offline/busy)
- [ ] 6.2 L'état dans le bureau reflète l'activité API réelle (token usage, dernière requête)
- [ ] 6.3 Notifications live (nouvel agent déployé → il "entre" dans le bureau)
- [ ] 6.4 Dashboard stats intégrées (tokens/jour, uptime, réponses)

---

## 📋 Priorités

| Priorité | Phase | Impact | Effort |
|----------|-------|--------|--------|
| 🔴 P0 | Phase 1 — Intégration dashboard | Critique — sans ça, c'est une page séparée inutile | 1 sprint |
| 🟠 P1 | Phase 2 — Sprites visuels | Haute — le look actuel est trop basique | 1-2 sprints |
| 🟡 P2 | Phase 3 — Agents vivants | Haute — c'est le WOW factor | 1 sprint |
| 🟢 P3 | Phase 4 — Interactivité | Moyenne — polish et UX | 1 sprint |
| 🔵 P4 | Phase 5 — Plans tarifaires | Business — monetization driver | 1 sprint |
| ⚪ P5 | Phase 6 — Real-time | Nice-to-have pour MVP | 1 sprint |

## 📎 Images de référence
- Business (priorité): image envoyée par Alex (6 pièces, ping-pong, conf room, server room)
- Starter: studio unique (2 postes, kitchenette)
- Enterprise: étage complet (open spaces, cafétéria, gym, terrasse)

## 🔧 Stack technique
- **Canvas 2D** (HTML5) — pas de framework, vanilla JS
- **Sprite sheet PNG** — 1 fichier, toutes les tiles et meubles
- **JSON tilemap** — positions des meubles, murs, portes
- **Offscreen buffer** — rendu natif puis scale pour pixel-perfect
- **requestAnimationFrame** — 60fps game loop

---

*Document créé le 27 février 2026 — Jarvis*
*Validé par: Alex (en attente)*
