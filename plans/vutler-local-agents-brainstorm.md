# 🧠 Brainstorm — Agents Locaux Vutler
> **Date :** 2026-02-28 | **Facilitateur :** AI | **Participants :** Luna 🧪 (PM), Mike ⚙️ (Lead Eng), Philip 🎨 (UI/UX)
> **Sponsor :** Alex (CEO) — principes fondamentaux validés

---

## 🎯 Résumé Exécutif

Vutler introduit un **agent coordinateur obligatoire** avec double local/cloud, des agents remote en cloud, et la capacité de déployer des agents chez des clients tiers. Le Pixel Office reflète cette architecture en temps réel.

---

## 🧪 Luna — Product & Strategy

### 1. Naming du Coordinateur

| Candidat | Pour | Contre |
|----------|------|--------|
| **Nexus** ✅ | Évoque la connexion, le hub central. Unique. | Peut sembler abstrait |
| Director | Clair hiérarchiquement | Trop corporate, rigide |
| Hub | Simple, compréhensible | Générique, pas brandable |
| Captain | Fun, personnalité | Trop gaming/casual |
| Cortex | Cerveau, intelligence | Connotation médicale |

**🏆 Recommandation : "Nexus"** — brandable, évoque le point de connexion entre local et cloud, entre l'entreprise et ses clients. "Your Nexus is syncing..." sonne bien.

### 2. User Journey

```
1. SIGNUP
   └→ Compte créé → Nexus (coordinateur) auto-provisionné en cloud
   └→ Welcome screen : "Votre Nexus est prêt. Il orchestre vos agents."

2. FIRST STEPS (cloud-only)
   └→ Nexus disponible immédiatement en cloud
   └→ L'utilisateur peut déjà créer des agents cloud (depuis templates)
   └→ Chat avec le Nexus pour configurer l'équipe

3. GO LOCAL (optionnel, unlock de puissance)
   └→ CTA : "Installez votre Nexus en local pour un accès à vos fichiers, APIs internes, et une latence réduite"
   └→ `npx vutler init` ou `docker run vutler/nexus`
   └→ Auth via token one-time affiché dans le dashboard
   └→ Sync automatique : le cloud-Nexus et le local-Nexus fusionnent
   └→ Badge "Local + Cloud" apparaît dans le Pixel Office

4. ADD AGENTS
   └→ Depuis le Pixel Office ou CLI : créer des agents cloud
   └→ Templates : Dev, Marketing, Support, Data Analyst, QA, Writer...
   └→ Custom : définir rôle, outils, personnalité
   └→ Chaque agent apparaît dans le bureau du Pixel Office

5. DEPLOY CHEZ UN CLIENT
   └→ Action : "Déployer chez un client" sur un agent
   └→ Formulaire : nom entreprise, contact, description mission
   └→ Génère un package d'installation (NPM/Docker) + token unique
   └→ Le client installe → connexion WSS sortante → agent apparaît dans le Pixel Office avec badge entreprise
   └→ L'agent reste sous le contrôle du propriétaire mais les données restent chez le client
```

### 3. Pricing

| Plan | Nexus | Agents Cloud | Agents Client-Deploy | Prix |
|------|-------|-------------|---------------------|------|
| **Free** | 1 (cloud only) | 1 | 0 | 0€ |
| **Starter** | 1 (cloud+local) | 3 | 1 | 29€/mo |
| **Pro** | 1 (cloud+local) | 10 | 5 | 79€/mo |
| **Business** | 1 (cloud+local) | 25 | 15 | 199€/mo |
| **Enterprise** | Custom | Illimité | Illimité | Sur devis |

**Notes :**
- Le Nexus compte dans le quota total (Free = 1 Nexus + 1 agent = 2 slots, mais 1 est réservé au Nexus)
- L'installation locale du Nexus est un feature gate à partir de Starter (incentive à upgrader)
- Les agents déployés chez des clients sont un add-on premium → différenciateur fort
- **Overage billing** : 5€/agent supplémentaire/mois

### 4. Différenciation Concurrentielle

| Feature | Vutler | OpenClaw | CrewAI | AutoGen |
|---------|--------|----------|--------|---------|
| Coordinateur auto avec double local/cloud | ✅ | ❌ | ❌ | ❌ |
| Pixel Office (bureau visuel temps réel) | ✅ | ❌ | ❌ | ❌ |
| Déploiement chez clients tiers | ✅ | ❌ | ❌ | ❌ |
| Sync bidirectionnelle mémoire | ✅ | Partiel | ❌ | ❌ |
| Templates d'agents métier | ✅ | ❌ | ✅ | Partiel |
| No-code agent creation | ✅ | ❌ | ❌ | ❌ |

**Killer feature : "Deploy-to-Client"** — Aucun concurrent ne propose de déployer un agent intelligent chez un client tiers avec données locales et contrôle centralisé. C'est le positionnement ESN/agence : "Envoyez vos agents IA travailler chez vos clients."

### 5. Use Cases Clés

1. **Agence digitale** → Déploie un agent support chez chaque client, monitore depuis le Pixel Office
2. **Freelance dev** → Nexus local sur sa machine, 2 agents cloud (QA + doc), le tout orchestré
3. **Startup SaaS** → Nexus local connecté à leur codebase, agents cloud pour marketing et support
4. **ESN/SSII** → Déploie des agents consultants chez 15 clients, dashboard centralisé
5. **E-commerce** → Agent déployé sur leur infra pour gérer le support client avec données locales (RGPD)
6. **Partenaire IT/AV** → Agent on-site chez un client pour vérifier chaque matin que les systèmes de visioconférence sont opérationnels, lancer des tests automatisés (réseau, audio, vidéo), et remonter les incidents
7. **MSP (Managed Service Provider)** → Déployer des agents de monitoring chez chaque client : checks systèmes, santé réseau, alertes proactives, rapports hebdomadaires automatisés

---

## ⚙️ Mike — Architecture & Engineering

### 1. Architecture Globale

```
┌─────────────────────────────────────────────────────────┐
│                    VUTLER CLOUD                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Nexus    │  │ Agent A  │  │ Agent B  │  (cloud)     │
│  │ (shadow) │  │ (cloud)  │  │ (cloud)  │             │
│  └────┬─────┘  └──────────┘  └──────────┘             │
│       │ WebSocket bidirectionnel                        │
│       │ + CRDT sync layer                               │
└───────┼─────────────────────────────────────────────────┘
        │
   ┌────┴─────┐          ┌──────────────────────┐
   │ Nexus    │          │  CLIENT COMPANY X     │
   │ (local)  │          │  ┌──────────┐         │
   │ user PC  │          │  │ Agent C  │ ←WSS──→ Cloud
   └──────────┘          │  │ deployed │         │
                         │  └──────────┘         │
                         │  (data stays here)    │
                         └──────────────────────┘
```

### 2. Sync Protocol (Nexus Local ↔ Cloud)

**Choix : CRDT (Conflict-free Replicated Data Types) + WebSocket**

```typescript
// Sync architecture
interface SyncLayer {
  transport: 'WebSocket';        // wss://sync.vutler.com
  dataModel: 'CRDT';             // Yjs ou Automerge
  channels: {
    memory: 'Y.Doc';             // Mémoire partagée (CRDT merge)
    state: 'Y.Map';              // État agent (statut, config)
    context: 'Y.Array';          // Historique de contexte
    execQueue: 'Y.Array';        // File d'exécution (ordonnée)
  };
  reconnect: 'exponential-backoff'; // 1s, 2s, 4s, 8s... max 30s
  offline: 'queue-and-replay';      // Opérations mises en file si déco
}
```

**Pourquoi CRDT :**
- Pas de conflit à résoudre manuellement → les modifications convergent automatiquement
- Fonctionne offline → le local continue, sync au reconnect
- Bibliothèque mature : **Yjs** (léger, WebSocket natif, 15KB gzipped)
- Pas besoin de "master" → les deux sont égaux, le merge est déterministe

**Gestion des conflits :**
- Mémoire (faits, notes) : merge additif, les deux versions coexistent avec timestamp
- État (statut agent) : Last-Writer-Wins avec vector clock
- Exécutions : queue ordonnée, le local a priorité si les deux lancent la même tâche (dédup par idempotency key)

### 3. Tunnel WSS pour Agents Déployés chez Clients

```
Client Network                          Vutler Cloud
┌─────────────┐                    ┌──────────────────┐
│  Agent      │──WSS outbound────→│  Tunnel Gateway   │
│  Container  │  (port 443)       │  (wss://tunnel.   │
│             │←─commands/sync────│   vutler.com)     │
│  [no inbound│                   │                    │
│   ports]    │                   │  Auth: JWT + mTLS  │
└─────────────┘                   └──────────────────┘
```

**Protocole :**
1. L'agent client initie une connexion WSS sortante (port 443, passe tous les firewalls)
2. Authentification : JWT signé + optionnel mTLS pour enterprise
3. Le tunnel est un multiplexeur : commandes, sync mémoire, heartbeat, logs
4. **Heartbeat** toutes les 30s → si 3 missed → statut "offline" dans Pixel Office
5. **Kill switch** : le propriétaire peut révoquer le token → l'agent s'arrête immédiatement

```typescript
// Tunnel message format
interface TunnelMessage {
  type: 'command' | 'sync' | 'heartbeat' | 'log' | 'kill';
  agentId: string;
  deploymentId: string;
  payload: any;
  timestamp: number;
  signature: string; // HMAC-SHA256
}
```

### 4. Sécurité

| Aspect | Solution |
|--------|----------|
| **Auth agent local** | Token one-time + refresh token (rotation 24h) |
| **Auth agent client** | JWT scoped (agentId + deploymentId) + IP allowlist optionnel |
| **Isolation multi-tenant** | Namespace par compte, DB row-level security (Supabase RLS) |
| **Kill switch** | Token revocation instantanée + message kill via tunnel |
| **Data chez client** | Chiffrement at-rest (AES-256), clé détenue par le client |
| **Audit trail** | Tous les accès loggés, exportable, retention 90j |
| **Secrets** | Vault séparé, jamais sync vers le cloud (local-only secrets) |

**Local-only secrets :** Le Nexus local peut avoir des secrets (API keys, credentials) qui ne sont JAMAIS sync vers le cloud. Marqués `local-only` dans la config.

### 5. DB Schema

```sql
-- Organisations / Comptes
-- (existant, étendu)

-- Table : nexus_instances
CREATE TABLE nexus_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  cloud_instance_id TEXT NOT NULL,        -- ID du Nexus cloud
  local_instance_id TEXT,                  -- NULL si pas installé en local
  local_installed_at TIMESTAMPTZ,
  local_version TEXT,
  sync_state JSONB DEFAULT '{}',           -- CRDT version vectors
  last_sync_at TIMESTAMPTZ,
  status TEXT DEFAULT 'cloud_only',        -- cloud_only | local_synced | local_offline
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table : agent_deployments (agents chez clients)
CREATE TABLE agent_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  org_id UUID REFERENCES organizations(id),
  client_company_name TEXT NOT NULL,
  client_company_logo_url TEXT,
  deployment_type TEXT DEFAULT 'docker',   -- docker | npm | binary
  tunnel_token TEXT NOT NULL,              -- JWT pour le tunnel WSS
  tunnel_token_expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',           -- pending | online | offline | revoked
  last_heartbeat_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table : sync_events (audit trail de la sync)
CREATE TABLE sync_events (
  id BIGSERIAL PRIMARY KEY,
  nexus_id UUID REFERENCES nexus_instances(id),
  direction TEXT NOT NULL,                 -- local_to_cloud | cloud_to_local
  event_type TEXT NOT NULL,                -- memory | state | context | exec
  payload_hash TEXT,                       -- SHA256 du payload (pas le contenu)
  conflict_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table : client_companies (annuaire des clients)
CREATE TABLE client_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX idx_deployments_status ON agent_deployments(status);
CREATE INDEX idx_deployments_org ON agent_deployments(org_id);
CREATE INDEX idx_sync_events_nexus ON sync_events(nexus_id, created_at DESC);
```

### 6. Stack Technique du Package Local

```
vutler-nexus/
├── Dockerfile              # Image Docker (~150MB)
├── package.json            # Package NPM (@vutler/nexus)
├── src/
│   ├── index.ts            # Entry point
│   ├── sync/
│   │   ├── crdt.ts         # Yjs document management
│   │   ├── ws-client.ts    # WebSocket connection to cloud
│   │   └── conflict.ts     # Conflict resolution strategies
│   ├── agent/
│   │   ├── runtime.ts      # Agent execution runtime
│   │   ├── tools.ts        # Local tool access (filesystem, etc.)
│   │   └── memory.ts       # Local memory store (SQLite)
│   ├── tunnel/
│   │   └── server.ts       # Pour agents déployés chez clients
│   └── api/
│       └── local-api.ts    # API locale (localhost:7700)
├── config/
│   └── default.yaml        # Config par défaut
└── README.md
```

**Installation :**
```bash
# NPM (recommandé pour devs)
npx @vutler/nexus init
# → crée ~/.vutler/ avec config + SQLite local
# → demande le token one-time
# → lance le sync

# Docker (recommandé pour production/serveurs)
docker run -d \
  -e VUTLER_TOKEN=vt_xxxxx \
  -v vutler-data:/data \
  --name vutler-nexus \
  vutler/nexus:latest
```

---

## 🎨 Philip — UX & Pixel Office

### 1. Pixel Office — Layout Architectural

```
┌──────────────────────────────────────────────────────────┐
│  PIXEL OFFICE                                    [⚙️ 👤] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ┌─────────────────────────────────────────┐            │
│   │         🏢 BUREAU PRINCIPAL              │            │
│   │                                         │            │
│   │    ┌─────────┐                          │            │
│   │    │ ★ NEXUS │  ← Bureau plus grand,    │            │
│   │    │  🟢 sync │    étoile dorée,         │            │
│   │    │ ☁️+💻    │    position centrale     │            │
│   │    └─────────┘                          │            │
│   │                                         │            │
│   │  ┌──────┐  ┌──────┐  ┌──────┐          │            │
│   │  │DevBot│  │MktBot│  │QABot │  ← Agents │            │
│   │  │ 🟢   │  │ 🟡   │  │ 🔴   │    cloud  │            │
│   │  └──────┘  └──────┘  └──────┘          │            │
│   └─────────────────────────────────────────┘            │
│                                                          │
│   ┌─────────────────────────────────────────┐            │
│   │  🌐 MISSIONS EXTERNES                   │            │
│   │  ┌────────────────┐ ┌────────────────┐  │            │
│   │  │ 🏷️ Acme Corp   │ │ 🏷️ TechStart  │  │            │
│   │  │ SupportBot     │ │ DataBot        │  │            │
│   │  │ 🟢 online      │ │ ⚫ offline     │  │            │
│   │  │ ↗️ deployed     │ │ ↗️ deployed    │  │            │
│   │  └────────────────┘ └────────────────┘  │            │
│   └─────────────────────────────────────────┘            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 2. Design System — Agents

| Élément | Nexus (Coordinateur) | Agent Cloud | Agent Client-Deploy |
|---------|---------------------|-------------|-------------------|
| **Taille** | 1.5x | 1x | 1x |
| **Bordure** | Dorée, glow effect | Standard | Pointillée + badge entreprise |
| **Icône** | ★ étoile | Selon rôle (🛠️💬📊) | Selon rôle + 🏷️ |
| **Position** | Centre, toujours visible | Grille libre | Zone "Missions Externes" |
| **Badge sync** | ☁️+💻 si local installé | ☁️ | ↗️ + nom entreprise |
| **Animation idle** | Pulse lent doré | Respiration subtile | Respiration + onde vers l'extérieur |

### 3. Statuts Visuels

```
🟢 Online      — Cercle vert plein, léger pulse
🟡 Busy        — Cercle jaune, rotation d'un indicateur d'activité
🔴 Error       — Cercle rouge, ! exclamation
⚫ Offline     — Cercle gris, opacité réduite (60%)
🔄 Syncing     — Cercle bleu, animation de deux flèches circulaires
⚡ Executing   — Éclair jaune clignotant
```

**Sync spécifique au Nexus :**
- Quand le local ET le cloud sont sync : icône ☁️↔💻 avec un check vert
- Quand désync : icône ☁️⚡💻 avec animation de flèches + compteur de changements en attente
- Quand local offline : ☁️ seul avec un ⚠️ petit

### 4. Onboarding Flow

```
STEP 1: Welcome
┌──────────────────────────────────┐
│  🎉 Bienvenue sur Vutler !       │
│                                  │
│  Votre Nexus est prêt.          │
│  C'est le cerveau de votre      │
│  équipe d'agents IA.            │
│                                  │
│  [Voir mon Pixel Office →]      │
└──────────────────────────────────┘

STEP 2: Pixel Office (Nexus seul)
┌──────────────────────────────────┐
│  Voici votre bureau.             │
│  Votre Nexus est au centre.      │
│                                  │
│       ┌─────────┐               │
│       │ ★ NEXUS │               │
│       │  🟢 ☁️   │               │
│       └─────────┘               │
│                                  │
│  💡 "Ajoutez votre premier       │
│      agent pour commencer"       │
│                                  │
│  [+ Ajouter un Agent]           │
└──────────────────────────────────┘

STEP 3: Premier Agent
┌──────────────────────────────────┐
│  Quel type d'agent ?             │
│                                  │
│  🛠️ Dev Assistant                │
│  💬 Support Client               │
│  📊 Data Analyst                 │
│  ✍️ Content Writer               │
│  🎨 Custom...                    │
│                                  │
│  [Créer]                         │
└──────────────────────────────────┘

STEP 4: Go Local (proposé après 1er usage)
┌──────────────────────────────────┐
│  ⚡ Boostez votre Nexus          │
│                                  │
│  Installez-le sur votre machine  │
│  pour :                          │
│  ✅ Accès à vos fichiers locaux  │
│  ✅ Latence réduite              │
│  ✅ Fonctionne même offline      │
│                                  │
│  npx @vutler/nexus init          │
│  [Copier la commande]           │
│                                  │
│  Token : vt_abc123... [📋]       │
└──────────────────────────────────┘

STEP 5: Deploy chez un client (Plan Starter+)
┌──────────────────────────────────┐
│  📤 Déployer un agent            │
│                                  │
│  Entreprise : [Acme Corp    ]    │
│  Agent :      [SupportBot ▼]     │
│  Mission :    [Support L1   ]    │
│                                  │
│  📋 Instructions d'installation  │
│  envoyées par email au client    │
│                                  │
│  [Déployer →]                    │
└──────────────────────────────────┘
```

### 5. Dashboard de Gestion

```
┌─────────────────────────────────────────────────────┐
│  📊 AGENTS DASHBOARD                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  OVERVIEW          3/5 agents  │  1 local  │ 1 ext  │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ★ Nexus          ☁️+💻  🟢 Synced    [Manage]      │
│    Last sync: 2s ago │ Memory: 245 entries           │
│                                                     │
│  🛠️ DevBot         ☁️   🟢 Online     [Manage]      │
│    Tasks today: 12 │ Uptime: 99.9%                  │
│                                                     │
│  💬 SupportBot     ↗️   🟢 Online     [Manage]      │
│    @ Acme Corp │ Tickets: 34 today                  │
│                                                     │
│  📊 DataBot        ↗️   ⚫ Offline    [Wake up]     │
│    @ TechStart │ Last seen: 2h ago                  │
│                                                     │
│  ──────────────────────────────────────────────     │
│  [+ Add Agent]  [+ Deploy to Client]                │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Décisions Proposées

| # | Décision | Statut | Owner |
|---|----------|--------|-------|
| D1 | Nommer le coordinateur **"Nexus"** | ✅ Validé (Alex 28/02) | Luna |
| D2 | Utiliser **Yjs (CRDT)** pour la sync local/cloud | ✅ Validé | Mike |
| D3 | **WSS outbound-only** pour les agents chez clients | ✅ Validé | Mike |
| D4 | Installation locale = **feature gate Starter+** | ✅ Validé (Alex 28/02) | Luna |
| D5 | Pixel Office : zone séparée "Missions Externes" | ✅ Validé | Philip |
| D6 | Le Nexus a un **bureau 1.5x plus grand** au centre | ✅ Validé | Philip |
| D7 | **Local-only secrets** jamais sync vers le cloud | ✅ Validé | Mike |
| D8 | Package local dispo en **NPM + Docker** | ✅ Validé | Mike |
| D9 | Kill switch instantané pour agents déployés | ✅ Validé | Mike |
| D10 | Pricing : agents client-deploy = feature premium | ✅ Validé (Alex 28/02) | Luna |

---

## ❓ Questions Ouvertes

### Product — DÉCIDÉ par Alex (28/02)
1. **Le Nexus peut-il être renommé ?** → ✅ OUI
2. **Multi-Nexus pour Enterprise ?** → ✅ OUI (un par département)
3. **Marketplace d'agents ?** → ✅ OUI (agents vendables/déployables via marketplace)
4. **Métriques de facturation** → ✅ PAR AGENT, usage illimité inclus. Prix unitaire plus élevé mais zéro surprise, zéro compteur. Simple à vendre et à comprendre.

### Engineering
5. **Limite de taille mémoire CRDT** — Yjs avec 100K+ entrées : faut-il un compactage périodique ? (Mike : oui, snapshot toutes les 1000 ops)
6. **Multi-device local** — Un Nexus peut-il tourner sur 2 machines locales en même temps ? (Mike : non, un seul local actif, mais switch possible)
7. **Versioning du package local** — Auto-update ou update manuelle ? (Mike : auto-update par défaut, opt-out possible)
8. **Edge case : le client supprime l'agent déployé** — Que se passe-t-il côté Pixel Office ? (Mike : statut "lost contact", alerte au propriétaire)

### Design
9. **Mobile responsive du Pixel Office** — Comment afficher les zones sur petit écran ? (Philip : vue liste sur mobile, Pixel Office sur desktop)
10. **Personnalisation des avatars agents** — Upload custom ou set prédéfini ? (Philip : set prédéfini + upload custom pour Pro+)
11. **Notifications** — Comment alerter quand un agent deployed passe offline ? (Philip : notification in-app + optionnel email/webhook)

---

## 🚀 Next Steps

| Action | Responsable | Deadline |
|--------|------------|----------|
| Valider le nom "Nexus" avec Alex | Luna | 2026-03-02 |
| POC sync CRDT (Yjs) local↔cloud | Mike | 2026-03-07 |
| Maquette Figma du Pixel Office v2 | Philip | 2026-03-07 |
| Spec détaillée du tunnel WSS | Mike | 2026-03-05 |
| User story mapping complet | Luna | 2026-03-04 |
| Prototype onboarding flow | Philip | 2026-03-10 |
| RFC pricing v2 avec agents locaux | Luna | 2026-03-06 |
| Schema DB migration plan | Mike | 2026-03-07 |

---

## 💡 Idées Bonus (Parking Lot)

- **🎮 Pixel Office interactif** — Drag & drop des agents entre zones, clic pour voir les logs en temps réel
- **📱 Mobile app** — Notifications push quand un agent deployed a un problème
- **🤝 Agent handoff** — Un agent chez un client peut "appeler" un agent cloud pour escalade
- **📊 Client reporting** — Dashboard read-only pour le client chez qui l'agent est déployé
- **🔌 Webhook on deploy** — Notifier un système externe quand un agent est déployé/rappelé
- **🏷️ White-label** — L'agent déployé chez un client peut avoir le branding du client
- **⏰ Scheduled deployment** — Déployer un agent chez un client pour une durée définie (mission temporaire)
- **🧬 Agent cloning** — Cloner un agent avec sa mémoire pour le déployer chez plusieurs clients
- **📈 ROI tracker** — Mesurer la valeur générée par chaque agent déployé (tickets résolus, code produit, etc.)

---

*Document généré le 2026-02-28 — Brainstorm facilité par AI*
*Prochaine session : review avec Alex (CEO) pour validation des décisions*
