# Product Brief: Pixel Chat — La Fusion Pixel Office + Chat

**Date:** 2026-02-26
**Author:** Luna 🧪 (Product Manager)
**Status:** Draft v1.0
**Sprint target:** Sprint 9-10 (MVP), Sprint 11-12 (V2)

---

## 1. Problem Statement

### Le problème Rocket.Chat

Vutler repose sur un fork de Rocket.Chat pour la communication users ↔ agents IA. C'est un **boulet technique et UX** :

| Problème | Impact |
|----------|--------|
| Meteor + MongoDB = 3GB+ RAM | Coût serveur x3, déploiement lent |
| UX générique (chat humain) | Pas adapté à l'interaction avec des agents IA |
| Maintenance du fork | Chaque update RC = merge hell |
| Auth couplée à RC | Impossible de découpler sans casser le système |
| Aucune identité visuelle | L'user ne "voit" pas ses agents travailler |

### L'opportunité

Remplacer RC par **Pixel Chat** : un bureau pixel art interactif où les agents IA sont **visibles, vivants et accessibles**. L'user voit ses agents travailler dans un bureau animé et peut chatter avec eux en un clic.

**Ce n'est pas juste un chat de remplacement — c'est un nouveau paradigme UX pour l'interaction humain-agents IA.**

---

## 2. Target Users

### Persona 1: Alex — AI-First Founder
- 3-15 agents en production
- Veut voir l'activité de ses agents d'un coup d'œil
- Le bureau pixel = **dashboard vivant** de son équipe IA

### Persona 2: Elena — Non-Technical Business Owner
- Ne comprend pas les logs/terminaux
- Le bureau pixel = **métaphore visuelle** qu'elle comprend instinctivement
- "Mon comptable IA est assis à son bureau et traite mes factures"

### Persona 3: Stefan — Enterprise IT / Compliance
- Veut audit trail, contrôle, visibilité
- Le bureau pixel = **monitoring visuel** (vert/jaune/rouge par agent)
- Group chat en salle de conf = traçabilité des décisions multi-agents

### Persona 4: Maya — Solo AI Builder
- Expérimente avec 1-3 agents
- Le bureau pixel = **fun, engageant, shareworthy** (screenshot → Twitter)
- Effet "wow" qui drive l'adoption organique

---

## 3. Core Features

### 🟢 MVP (Sprint 9-10) — IN SCOPE

#### 3.1 Pixel Office (Canvas)
- Bureau pixel art responsive (Canvas 2D, pas WebGL pour le MVP)
- Agents animés à leur poste (idle, working, thinking, sleeping)
- Clic sur agent → sélection + ouverture chat panel
- Status visuel par agent (dot vert/jaune/rouge)
- Bulles de notification au-dessus des agents (dernière activité)
- Nom de l'entreprise en enseigne (configurable)
- Zones : Engineering, Marketing, Operations, Sales, Research, Server Room
- Basé sur le proto `pixel-office.html` de Philip (13 agents Starbox)

#### 3.2 Chat Panel
- Panel droit, style iMessage/WhatsApp
- Messages user → agent via WebSocket existant
- Réponses agent via LLM Router (Anthropic/OpenAI/Gemini)
- Historique des conversations (stocké en PostgreSQL)
- Markdown rendering dans les messages
- Indicateur "typing..." quand l'agent process
- Scroll infini (pagination)

#### 3.3 Auth Propre (remplacement RC)
- Login / Register (email + password)
- JWT tokens (access + refresh)
- Session management
- Middleware Express compatible avec l'existant
- Migration des users RC existants (script one-shot)

#### 3.4 Agent Sidebar
- Liste des agents avec status (online/busy/offline)
- Recherche/filtre
- Clic = sélection dans le bureau + ouverture chat
- Unread count par agent

#### 3.5 WebSocket Messaging
- Réutiliser le WebSocket existant (Express)
- Events : `message:send`, `message:receive`, `agent:status`, `typing`
- Presence (user online/offline)

#### 3.6 Storage PostgreSQL (Vaultbrix)
- Nouvelles tables : `messages`, `conversations`, `sessions`, `users_auth`
- Migration MongoDB → PG pour l'historique chat existant

### 🔴 V2+ (Sprint 11-12) — OUT OF MVP

| Feature | Raison du report |
|---------|-----------------|
| Group chat / Salle de conférence | Complexité UX + backend multi-agent conversations |
| Drag & drop agents vers salles | Nécessite group chat d'abord |
| File uploads dans le chat | Pas critique pour MVP, agents utilisent déjà les Tools API |
| Admin panel (remplacement RC admin) | Admin CLI ou API suffisent pour le MVP |
| Thèmes / customisation bureau | Nice-to-have cosmétique |
| Notifications push (mobile) | Pas de client mobile MVP |
| Voice messages | Roadmap audio-visio séparée |
| Agent-to-agent visible conversations | V2 spectacle mode |
| Bureau interactif (meubles, déco) | Gamification V2 |
| Multi-floor / Campus view (Enterprise) | Post-launch |

---

## 4. UX Wireframes (Textuels)

### Layout Principal
```
┌──────────────────────────────────────────────────────────┐
│  ⬡ VUTLER   [Company Name]            👤 User  ⚙️ Settings │
├────────┬──────────────────────────────┬──────────────────┤
│        │                              │                  │
│ AGENTS │      PIXEL OFFICE            │   CHAT PANEL     │
│        │                              │                  │
│ 🤖 Jarvis│  ┌─────────────────────┐    │ 🤖 Jarvis        │
│   ● online│  │  Bureau pixel art   │    │ ─────────────── │
│        │  │  avec agents animés  │    │                  │
│ ⚙️ Mike │  │  à leurs postes      │    │ User: Help me    │
│   ● busy │  │                     │    │ with the API     │
│        │  │  [Zone Eng] [Zone Mkt]│    │                  │
│ 🎨 Philip│  │  [Zone Ops] [Zone  ] │    │ Jarvis: Sure,    │
│   ● idle │  │                     │    │ let me check...  │
│        │  └─────────────────────┘    │                  │
│ 🧪 Luna │                              │ [____________]📎 │
│   ○ off  │                              │                  │
├────────┴──────────────────────────────┴──────────────────┤
│  Status bar: 8/13 agents online │ 3 tasks running │ Plan: Pro │
└──────────────────────────────────────────────────────────┘
```

### Layout Mobile (responsive)
```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   AGENTS     │  →   │ PIXEL OFFICE │  →   │  CHAT PANEL  │
│   (list)     │ tap  │  (fullscreen)│ tap  │  (fullscreen)│
│              │      │              │ agent│              │
└──────────────┘      └──────────────┘      └──────────────┘
       Tab 1               Tab 2               Tab 3
```

### Interactions clés
1. **Clic agent sidebar** → agent highlight dans bureau + chat panel s'ouvre
2. **Clic agent dans bureau** → même résultat
3. **Hover agent bureau** → tooltip (nom, rôle, activité en cours)
4. **Bulle notification** → apparaît 3s quand l'agent fait quelque chose

---

## 5. Architecture Technique

### Ce que Pixel Chat remplace dans RC

| Fonction RC | Remplacement Pixel Chat | Techno |
|-------------|------------------------|--------|
| Chat real-time | WebSocket natif (déjà existant) | Express + ws |
| Auth (login/register) | JWT auth propre | bcrypt + jsonwebtoken |
| Channels/DMs | Table `conversations` PG | Vaultbrix PostgreSQL |
| File uploads | V2 (out of MVP) | — |
| User presence | WebSocket presence events | ws heartbeat |
| Admin panel | V2 (CLI/API pour MVP) | — |
| MongoDB storage | Vaultbrix PostgreSQL | pg driver existant |

### Schéma d'architecture MVP

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│  Browser     │◄──────────────────►│  Express API     │
│  (React SPA) │     HTTP/REST      │  (port 3001)     │
│              │◄──────────────────►│                  │
│  - Pixel     │                    │  - Auth JWT      │
│    Canvas    │                    │  - Chat WS       │
│  - Chat UI   │                    │  - Agent Runtime │
│  - Sidebar   │                    │  - LLM Router    │
└─────────────┘                    │  - Memory API    │
                                   │  - Tools API     │
                                   └───────┬──────────┘
                                           │
                                   ┌───────▼──────────┐
                                   │  Vaultbrix PG    │
                                   │                  │
                                   │  - users_auth    │
                                   │  - sessions      │
                                   │  - conversations │
                                   │  - messages      │
                                   │  - (12 tables    │
                                   │    existantes)   │
                                   └──────────────────┘
```

### Nouvelles tables PostgreSQL

```sql
-- Auth (remplacement RC)
CREATE TABLE users_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users_auth(id),
  refresh_token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users_auth(id),
  agent_id VARCHAR(50) NOT NULL,
  type VARCHAR(20) DEFAULT 'dm', -- 'dm' | 'group' (V2)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  sender_type VARCHAR(10) NOT NULL, -- 'user' | 'agent'
  sender_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_user ON conversations(user_id);
```

### Frontend Stack
- **React** (existant dans le projet)
- **Canvas 2D** pour le bureau pixel (pas de lib lourde, vanilla canvas)
- **CSS-in-JS** ou Tailwind pour le chat/sidebar
- Code du proto `pixel-office.html` comme base (Philip l'a déjà fait)

---

## 6. Migration Path (RC → Pixel Chat)

### Phase 1 : Coexistence (Sprint 9)
1. Déployer Pixel Chat en parallèle de RC
2. Auth : supporter les deux systèmes (RC tokens + JWT)
3. Nouveau frontend pointe vers Pixel Chat API
4. RC reste actif en fallback

### Phase 2 : Migration (Sprint 10)
1. Script migration users RC → `users_auth` PG
2. Script migration historique chat MongoDB → `messages` PG
3. Basculer le frontend principal sur Pixel Chat
4. RC en read-only (archive)

### Phase 3 : Décommission (Sprint 11)
1. Supprimer le middleware RC auth
2. Arrêter MongoDB
3. Supprimer le fork RC du déploiement
4. **Gain estimé : -3GB RAM, -1 service, -1 base de données**

---

## 7. Dépendances Sprint 8 (Multi-Tenant)

| Dépendance | Impact | Mitigation |
|-----------|--------|------------|
| Multi-tenant DB schema | `users_auth` et `messages` doivent être tenant-aware | Ajouter `tenant_id` dès la création des tables |
| Tenant isolation | Chaque entreprise voit son propre bureau pixel | Filter par `tenant_id` dans toutes les queries |
| Auth tenant-aware | JWT doit inclure `tenant_id` | Inclure dans le payload JWT dès le MVP |
| Agent ownership | Agents appartiennent à un tenant | Déjà prévu dans Sprint 8 schema |

**Verdict :** Sprint 8 doit être terminé AVANT le MVP Pixel Chat. Les tables multi-tenant sont un prérequis.

---

## 8. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| Performance Canvas avec 50+ agents | Moyenne | UX dégradée | Viewport culling, sprites pré-rendus, requestAnimationFrame throttle |
| Migration MongoDB perd des données | Faible | Élevé | Script de migration + validation checksum + RC en read-only pendant migration |
| Auth JWT moins robuste que RC | Moyenne | Élevé | Utiliser des libs éprouvées (passport-jwt), rate limiting, refresh token rotation |
| Scope creep (group chat dans MVP) | Élevée | Retard | Discipline : DM only pour MVP, group chat = V2 non-négociable |
| Philip surchargé (Canvas + Chat UI) | Élevée | Retard | Mike aide sur le chat UI (composants simples), Philip focus sur le Canvas |
| Users attachés à RC UX | Faible | Moyen | Beta opt-in, période de coexistence, feedback loop |

---

## 9. Success Metrics

### MVP Launch (fin Sprint 10)

| Metric | Target | Mesure |
|--------|--------|--------|
| RC complètement remplacé | 100% users migrés | Aucun appel à RC API |
| RAM serveur | -50% (de ~4GB à ~2GB) | Monitoring Hetzner |
| Latence message | < 200ms | WebSocket round-trip |
| Time to first chat | < 5 secondes | Depuis le login |
| User satisfaction | NPS > 50 | Survey post-migration |
| Uptime chat | 99.5% | Monitoring |

### V2 (Sprint 12)

| Metric | Target |
|--------|--------|
| Group task completion rate | > 70% des tasks multi-agents |
| Engagement bureau pixel | > 3 min/session temps passé sur le bureau |
| Organic sharing | > 10 screenshots partagés/semaine |

---

## 10. Timeline

### Sprint 9 (2 semaines) — Foundation

| Qui | Quoi |
|-----|------|
| **Mike** | Auth JWT (register/login/refresh), tables PG, migration script users |
| **Philip** | Adapter pixel-office.html en composant React, intégrer dans le layout 3-panels |
| **Luna** | Specs détaillées chat UI, tests acceptance, coordination |
| **Jarvis** | CI/CD, review, monitoring setup |

**Livrable Sprint 9 :** Login propre + bureau pixel affiché + agents visibles avec status live

### Sprint 10 (2 semaines) — Chat & Migration

| Qui | Quoi |
|-----|------|
| **Mike** | WebSocket chat (send/receive/history), migration MongoDB → PG, agent sidebar API |
| **Philip** | Chat panel UI (messages, typing indicator, scroll), agent sidebar, interactions bureau↔chat |
| **Luna** | QA, migration validation, user acceptance testing |
| **Jarvis** | Migration script execution, RC décommission prep, perf testing |

**Livrable Sprint 10 :** Pixel Chat fonctionnel, RC décommissionné, users migrés

### Sprint 11-12 — V2

- Group chat / salle de conférence
- File uploads
- Admin panel
- Thèmes bureau
- Notifications push
- Bureau évolutif selon plan tarifaire

---

## 11. Pricing Impact

Le bureau pixel art crée un **levier de monétisation visuel** naturel :

### Nouveau modèle bureau par plan

| Plan | Bureau | Agents max | Prix existant |
|------|--------|-----------|---------------|
| **Free / Open Source** | Studio (1 pièce) | 3 agents | $0 |
| **Starter** ($99/mo) | Open Space | Illimité* | $99/mo |
| **Growth** ($199/mo) | Open Space + Salles de conf | Illimité | $199/mo |
| **Pro** ($349/mo) | Étage complet | Illimité | $349/mo |
| **Enterprise** | Campus multi-étages | Illimité | Custom |

*\* Le plan actuel est déjà "unlimited agents" en flat pricing — pas de changement.*

### Impact concret

1. **Upgrade visuel naturel** : L'user en Free voit un petit studio. Quand il ajoute un 4e agent → "Upgrade to Starter pour un Open Space". La métaphore spatiale rend l'upgrade désirable (vs. un message texte froid).

2. **Pas de changement de prix** : Les prix restent identiques. Le bureau pixel est une **amélioration UX**, pas un nouveau pricing tier. On ne fait pas payer plus — on rend l'expérience tellement meilleure que le churn baisse.

3. **Différenciateur compétitif** : Aucun concurrent (Slack, Teams, Discord) ne propose une visualisation IA comme ça. C'est du **marketing produit intégré** — chaque screenshot est une pub.

4. **Cosmétiques (V3+, optionnel)** : Thèmes de bureau, meubles, décorations = microtransactions potentielles. Non prioritaire mais possible revenue stream.

---

## 12. Résumé Exécutif

**Pixel Chat** remplace Rocket.Chat par une expérience native :
- 🎮 **Bureau pixel art** où les agents IA sont visibles et vivants
- 💬 **Chat intégré** en clic sur un agent (style iMessage)
- 🔐 **Auth propre** JWT (plus de dépendance RC)
- 📊 **PostgreSQL** pour tout (plus de MongoDB)
- ⚡ **-50% RAM**, -1 service, -1 BDD

**MVP en 2 sprints** (9-10) avec l'équipe existante (Mike backend, Philip frontend, Luna QA/product, Jarvis infra).

**Ce n'est pas un downgrade** — c'est un upgrade massif d'UX qui transforme un chat générique en une expérience unique sur le marché.

---

*"Les gens n'achètent pas du software. Ils achètent une vision de leur futur. Le bureau pixel, c'est le futur : voir ton équipe IA travailler pour toi."* — Luna 🧪
