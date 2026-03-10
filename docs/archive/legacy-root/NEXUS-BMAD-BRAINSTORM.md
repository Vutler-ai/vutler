# NEXUS — BMAD Brainstorm
**Date**: 9 mars 2026  
**Auteur**: Jarvis (avec Alex)  
**Status**: Draft pour validation Alex

---

## 1. Vision

**Nexus** est le pont entre Vutler Cloud et l'infrastructure du client. Un client installe Nexus chez lui, ses agents Vutler peuvent alors accéder à ses fichiers, ses bases de données, ses API internes, ses clés — **sans que ces données ne quittent son réseau**.

> "Vos agents, votre infrastructure, vos données."

---

## 2. Parcours Client Final

### 2.1 Onboarding Nexus

```
1. Client crée un workspace sur app.vutler.ai
2. Va dans Settings > Nexus
3. Clique "Connect a Node"
4. Choisit sa méthode: NPM / Docker / Local / VPS / K8s / API
5. Copie la commande d'installation (contient sa NEXUS_KEY unique)
6. Exécute sur sa machine/serveur
7. Le node apparaît ONLINE dans son dashboard Nexus
8. Il assigne des agents à ce node
9. Les agents commencent à traiter les tâches localement
```

### 2.2 Page Nexus côté Client (app.vutler.ai/nexus)

**Ce que le client voit :**
- Liste de ses nodes (nom, type, status, uptime, agents assignés)
- Stats : messages traités, tâches exécutées, tokens consommés
- Pour chaque node : logs en temps réel, health, config
- Bouton "Assign Agent" : choisir quels agents de son workspace tournent sur quel node
- Settings par node : permissions filesystem, shell, réseau, LLM

### 2.3 Page Locale Nexus (localhost:3100)

Quand le client lance Nexus en local, il a une **mini UI web sur localhost:3100** :

```
┌─────────────────────────────────────────┐
│  🌐 Vutler Nexus — prod-server-01      │
│  Status: ONLINE | Connected to Cloud    │
├─────────────────────────────────────────┤
│                                         │
│  Workspace: Acme Corp                   │
│  Node ID: nx_a1b2c3d4                   │
│  Uptime: 14h 23m                        │
│  Agents: 3 active                       │
│                                         │
│  ┌─────────┬──────────┬──────────────┐  │
│  │ Agent   │ Status   │ Tasks Today  │  │
│  ├─────────┼──────────┼──────────────┤  │
│  │ Andrea  │ 🟢 Ready │ 47           │  │
│  │ Mike    │ 🟢 Ready │ 12           │  │
│  │ Rex     │ 🟡 Busy  │ 8            │  │
│  └─────────┴──────────┴──────────────┘  │
│                                         │
│  [Settings] [Logs] [Stop Node]          │
│                                         │
│  ── Recent Activity ──                  │
│  10:42 Andrea processed invoice.pdf     │
│  10:41 Mike ran npm audit               │
│  10:39 Rex checked DB health            │
└─────────────────────────────────────────┘
```

**Settings page locale (localhost:3100/settings) :**
- Permissions filesystem (quels dossiers l'agent peut lire/écrire)
- Permissions shell (whitelist commandes)
- LLM config (Ollama local / Cloud / Custom endpoint)
- Clés API locales (.env du client)
- Réseau (accès services internes autorisés)
- Logs verbosity
- Auto-update toggle

---

## 3. Module Client — Identification des Nodes

### 3.1 NEXUS_KEY

Chaque workspace a une **clé Nexus unique** (générée à la création du workspace) :

```
NEXUS_KEY=nxk_<workspace_id>_<random_secret>
```

Cette clé :
- Identifie le workspace
- Authentifie le node auprès du cloud
- Détermine les permissions (plan free/starter/pro/enterprise)
- Est DIFFÉRENTE du JWT user (c'est une clé machine-to-machine)

### 3.2 Identification des Nodes

```javascript
// Chaque node s'enregistre avec :
{
  "nexus_key": "nxk_acme_abc123",        // workspace
  "node_id": "nx_<auto_generated_uuid>",   // unique per node
  "node_name": "prod-server-01",           // human-friendly
  "type": "docker",                         // npm|docker|vps|local|kubernetes|api
  "hostname": "ip-172-31-45-67",           // OS hostname
  "ip": "172.31.45.67",                    // local IP
  "public_ip": "203.0.113.42",            // public IP (detected)
  "os": "linux",                           // darwin|linux|windows
  "arch": "x64",                           // x64|arm64
  "node_version": "20.11.0",              // Node.js version
  "capabilities": {                        // what this node can do
    "filesystem": true,
    "shell": true,
    "ollama": true,                        // local LLM available
    "gpu": false,
    "docker": true
  }
}
```

### 3.3 Quel Nexus est chez qui ?

**Table `nexus_nodes` :**

| Champ | Usage |
|-------|-------|
| `id` | UUID du node |
| `workspace_id` | → quel client |
| `nexus_key_hash` | Vérification auth |
| `name` | Nom donné par le client |
| `type` | npm/docker/vps/local/kubernetes/api |
| `hostname` | Machine hostname |
| `public_ip` | IP publique détectée |
| `capabilities` | Ce que le node peut faire |
| `agents_assigned` | Quels agents tournent dessus |
| `status` | online/offline/degraded |
| `last_heartbeat` | Dernier ping |
| `config` | Permissions, LLM config, etc. |
| `metrics` | Tasks processed, tokens used, uptime |

**Dashboard Admin (côté Vutler) :**
```
Workspace "Acme Corp" → 2 nodes:
  ├── nx_a1b2 "prod-server-01" (Docker, Paris, ONLINE, 3 agents)
  └── nx_c3d4 "dev-laptop" (Local, Geneva, OFFLINE)

Workspace "Beta Inc" → 1 node:
  └── nx_e5f6 "k8s-cluster" (Kubernetes, Frankfurt, ONLINE, 8 agents)
```

---

## 4. Packages de Déploiement

### 4.1 NPM (`@vutler/nexus`)

```bash
npm install -g @vutler/nexus
vutler-nexus init --key nxk_acme_abc123
vutler-nexus start
```

**Contenu du package :**
```
@vutler/nexus/
├── bin/cli.js              # CLI (init, start, dev, stop, status, logs)
├── index.js                # NexusNode class (export pour usage programmatique)
├── lib/
│   ├── connection.js       # WebSocket + REST API client vers Vutler Cloud
│   ├── agent-runner.js     # Exécute les tâches des agents
│   ├── providers/
│   │   ├── filesystem.js   # Read/write fichiers locaux
│   │   ├── shell.js        # Execute commandes
│   │   ├── env.js          # Lecture .env / variables locales
│   │   ├── network.js      # HTTP client pour APIs internes
│   │   └── llm.js          # Ollama / OpenAI / Anthropic local
│   ├── security.js         # Sandboxing, permission checks
│   ├── metrics.js          # Usage tracking
│   └── ui/                 # Mini dashboard web (localhost:3100)
│       ├── index.html
│       ├── settings.html
│       └── logs.html
├── Dockerfile              # Pour mode Docker
├── helm/                   # Helm chart pour K8s
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
└── package.json
```

### 4.2 Docker (`vutler/nexus`)

```bash
docker run -d \
  --name vutler-nexus \
  -e NEXUS_KEY=nxk_acme_abc123 \
  -e NODE_NAME=prod-01 \
  -v /data/workspace:/app/workspace \
  -v /data/.env:/app/.env:ro \
  -p 3100:3100 \
  vutler/nexus:latest
```

### 4.3 Kubernetes (Helm)

```bash
helm repo add vutler https://charts.vutler.ai
helm install nexus vutler/nexus \
  --set nexusKey=nxk_acme_abc123 \
  --set agents.count=5 \
  --set ollama.enabled=true \
  --set persistence.size=10Gi
```

### 4.4 VPS Managed (Infomaniak)

```
Client clique "Deploy Managed VPS" dans l'UI
→ Vutler appelle API Infomaniak (OpenStack)
→ Provisionne un VPS Ubuntu 22.04
→ Installe Docker + vutler/nexus automatiquement
→ Configure avec la NEXUS_KEY du client
→ Node apparaît ONLINE dans le dashboard
→ Facturé via Stripe (CHF 9.90/mois starter)
```

### 4.5 Local (Dev Mode)

```bash
npx @vutler/nexus dev --key nxk_acme_abc123
```

Mode spécial :
- Verbose logging
- Auto-reload on config change
- Pas de heartbeat timeout (ne déconnecte pas si laptop en veille)
- Dashboard local activé par défaut

### 4.6 API Only

Pour les clients qui veulent intégrer dans leur propre runtime :

```javascript
// WebSocket
const ws = new WebSocket('wss://app.vutler.ai/api/v1/nexus/ws');
ws.send(JSON.stringify({ type: 'auth', nexus_key: 'nxk_...' }));
ws.on('message', (msg) => {
  const task = JSON.parse(msg);
  // Execute task locally
  // Send result back
  ws.send(JSON.stringify({ type: 'result', task_id: task.id, output: '...' }));
});

// REST
POST /api/v1/nexus/register    → { node_id }
POST /api/v1/nexus/:id/heartbeat
GET  /api/v1/nexus/:id/tasks
POST /api/v1/nexus/:id/result
```

---

## 5. Communication Cloud ↔ Node

### 5.1 Protocole

```
[Vutler Cloud]  ←── WebSocket (persistent) ──→  [Nexus Node]
                ←── REST API (fallback)     ──→
```

**Messages WebSocket :**

| Direction | Type | Payload |
|-----------|------|---------|
| Cloud → Node | `task.assign` | { task_id, agent_slug, input, tools_allowed } |
| Cloud → Node | `task.cancel` | { task_id } |
| Cloud → Node | `config.update` | { permissions, agents } |
| Cloud → Node | `agent.deploy` | { agent_slug, system_prompt, tools } |
| Cloud → Node | `agent.remove` | { agent_slug } |
| Node → Cloud | `task.result` | { task_id, output, tokens_used, duration } |
| Node → Cloud | `task.progress` | { task_id, status, partial_output } |
| Node → Cloud | `heartbeat` | { status, agents, metrics, capabilities } |
| Node → Cloud | `log` | { level, message, agent_slug } |
| Node → Cloud | `error` | { code, message, task_id? } |

### 5.2 Task Execution Flow

```
1. User envoie message à agent Andrea dans le chat Vutler
2. Vutler Cloud vérifie: Andrea est assignée au node "prod-01"
3. Cloud envoie task.assign via WebSocket au node prod-01
4. Node reçoit la tâche:
   a. Charge le system_prompt de Andrea (depuis Snipara cache local)
   b. Enrichit le contexte (fichiers locaux, env vars)
   c. Appelle le LLM (Ollama local ou cloud selon config)
   d. Exécute les tools demandés (filesystem, shell, etc.)
   e. Envoie task.result au cloud
5. Cloud poste la réponse dans le chat
```

### 5.3 Reconnexion

- Heartbeat toutes les 30 secondes
- Si 3 heartbeats manqués → status "degraded"
- Si 10 heartbeats manqués → status "offline"
- Reconnexion automatique avec backoff exponentiel
- Les tâches assignées à un node offline sont re-routées au cloud

---

## 6. Settings & Config

### 6.1 Config Node (`.vutler-nexus.json`)

```json
{
  "nexus_key": "nxk_acme_abc123",
  "node_name": "prod-server-01",
  "server": "https://app.vutler.ai",
  "port": 3100,
  "dashboard": true,
  
  "permissions": {
    "filesystem": {
      "enabled": true,
      "root": "./workspace",
      "read": ["**/*"],
      "write": ["**/*"],
      "blocked": ["../**", "/etc/**", "/root/**"]
    },
    "shell": {
      "enabled": true,
      "whitelist": ["node", "npm", "python3", "git", "curl", "ls", "cat", "grep"],
      "timeout_ms": 30000,
      "max_concurrent": 3
    },
    "network": {
      "local": true,
      "external": false,
      "allowed_hosts": ["localhost", "127.0.0.1", "*.internal.company.com"],
      "blocked_ports": [22, 3306]
    }
  },
  
  "llm": {
    "provider": "ollama",
    "endpoint": "http://localhost:11434",
    "model": "llama3.3:70b",
    "fallback": {
      "provider": "cloud",
      "model": "gpt-4o"
    }
  },
  
  "agents": {
    "max_concurrent": 5,
    "auto_accept": ["andrea", "rex"],
    "require_approval": ["mike"]
  },
  
  "storage": {
    "cache_dir": "./.nexus-cache",
    "max_cache_mb": 500,
    "snipara_sync": true
  },
  
  "logging": {
    "level": "info",
    "file": "./logs/nexus.log",
    "send_to_cloud": true
  }
}
```

### 6.2 Settings depuis l'UI Cloud (app.vutler.ai/nexus/:id/settings)

Le client peut aussi modifier les settings de son node depuis le cloud :
- Les changements sont poussés via WebSocket `config.update`
- Le node applique les changements à chaud (sans restart)
- Certains settings sont "local-only" (nexus_key, server) et ne peuvent être modifiés que localement

### 6.3 Variables d'Environnement

```bash
# Required
NEXUS_KEY=nxk_acme_abc123

# Optional overrides
NODE_NAME=prod-01
VUTLER_SERVER=https://app.vutler.ai
NEXUS_PORT=3100
NEXUS_DASHBOARD=true
LLM_PROVIDER=ollama
LLM_ENDPOINT=http://localhost:11434
LLM_MODEL=llama3.3:70b
LOG_LEVEL=info
```

---

## 7. Facturation Nexus (Stripe — déjà configuré)

**Modèle : SEATS** — Le client achète un nombre de seats (agents).

| Plan | Nodes | Seats | LLM | Filesystem | Shell | Prix |
|------|-------|-------|-----|-----------|-------|------|
| **Starter** | 1 | 5 | Cloud + Ollama | ✅ Full | ✅ | CHF 29/mois |
| **Pro** | 5 | 20 | Cloud + Ollama + Custom | ✅ Full | ✅ | CHF 99/mois |
| **Enterprise** | Illimité | Illimité | Tout | ✅ Full | ✅ | Sur devis |
| **VPS Managed** | +1 node | selon plan | Cloud | ✅ Full | ✅ | +CHF 9.90/mois |

### Logique des Seats

```
Client achète 10 seats Pro
├── 2-3 agents FIXES (toujours actifs sur le node)
│   ex: AV Engineer (cron 7h), Andrea (office)
│
└── 7-8 seats DYNAMIQUES (available pool)
    → Jarvis (coordinateur) assigne dynamiquement
    → Un ticket helpdesk arrive → Jarvis fetch Mike (engineer)
    → Tâche terminée → Mike libère le seat
    → Un besoin compta → Jarvis fetch l'Accounting Assistant
    → etc.
```

**Seat = slot actif sur le node.** Un agent fixe occupe 1 seat en permanence. Un agent dynamique occupe 1 seat pendant sa tâche puis le libère.

---

## 8. Sécurité

### 8.1 Principes
- **NEXUS_KEY** hashée en DB, jamais stockée en clair côté cloud
- **TLS** obligatoire pour WebSocket et REST
- **Permissions par défaut** : restrictives (filesystem read-only workspace, pas de shell)
- **Audit trail** : toutes les actions filesystem/shell loguées et visibles dans le dashboard
- **Rotation de clé** : le client peut régénérer sa NEXUS_KEY depuis l'UI

### 8.2 Sandboxing
- Shell execution dans un subprocess avec timeout
- Filesystem limité au `root` configuré (pas d'escape possible via `../`)
- Network requests loguées et filtrables
- Pas d'accès aux secrets du node (NEXUS_KEY) depuis les agents

---

## 9. Implémentation — Chunks

### Chunk 1 : Core Runtime (~2h)
- `index.js` NexusNode class
- `lib/connection.js` WebSocket + REST
- `bin/cli.js` init/start/dev/stop
- Backend: WebSocket endpoint `/api/v1/nexus/ws`

### Chunk 2 : Providers (~2h)
- `providers/filesystem.js`
- `providers/shell.js`
- `providers/env.js`
- `providers/llm.js` (Ollama + cloud fallback)

### Chunk 3 : Dashboard Local (~1h)
- `ui/index.html` (status, agents, activity)
- `ui/settings.html` (permissions, LLM config)
- Servi par le health server sur port 3100

### Chunk 4 : Cloud Integration (~2h)
- Task routing: si agent assigné à un node → envoyer via WS
- Heartbeat monitoring + status updates
- Agent deploy/remove via WS
- Re-routing si node offline

### Chunk 5 : Docker + Helm (~1h)
- Dockerfile
- Helm chart (Chart.yaml, values.yaml, templates)
- docker-compose.yml exemple

### Chunk 6 : VPS Managed (~2h)
- Intégration API Infomaniak OpenStack
- Provisioning script (cloud-init)
- Auto-install Nexus + config
- Billing hook

---

## 10. Use Case Concret — AV Engineer Agent

### Contexte
Un client (hôtel, bureau, salle de conférence) déploie l'agent **AV Engineer** via Nexus sur son réseau local.

### Routine quotidienne (cron 7h00)
```
1. Ping tous les équipements AV du réseau (TVs, projecteurs, visio)
   → providers/network.js : scan réseau local 192.168.1.0/24
   → protocols: SNMP, HTTP API, Telnet, RS-232 over IP

2. Test chaque équipement:
   - TV Samsung/LG : Wake-on-LAN, vérifier input HDMI, volume
   - Système visio (Poly, Zoom Rooms, Teams Room) : test micro, caméra, réseau
   - Projecteur : lampe heures, température, résolution
   - Switch AV (Crestron, Extron) : status matrice, routing

3. Remettre les settings corrects si dérivés:
   - TV → input HDMI 1, volume 30, mode présentiel
   - Visio → caméra preset "salle", micro unmuted
   - Projecteur → mode eco ON

4. Générer rapport quotidien:
   → providers/filesystem.js : écrire dans /workspace/reports/2026-03-10.md
   → Envoyer au cloud via task.result → notification mail au client

5. Helpdesk:
   - Répondre aux tickets via chat Vutler
   - Diagnostiquer à distance (ping, reboot, reset config)
   - Escalader si hardware défaillant
```

### Pourquoi ça DOIT être local (Nexus)
| Action | Cloud possible ? | Local (Nexus) |
|--------|-----------------|---------------|
| Ping équipement réseau local | ❌ | ✅ |
| Envoyer commande SNMP/RS-232 | ❌ | ✅ |
| Wake-on-LAN | ❌ | ✅ |
| Accéder à l'API du switch Crestron | ❌ | ✅ |
| Lire les logs du système visio | ❌ | ✅ |
| Remettre les settings TV | ❌ | ✅ |
| Écrire un rapport | ✅ | ✅ |
| Envoyer une notif | ✅ | ✅ |

→ **80% des actions de l'AV Engineer sont impossibles depuis le cloud.** Nexus est obligatoire.

### Config type pour AV Engineer
```json
{
  "nexus_key": "nxk_hotel_geneva_abc123",
  "node_name": "av-controller-lobby",
  "permissions": {
    "network": {
      "local": true,
      "allowed_hosts": ["192.168.1.*", "10.0.0.*"],
      "allowed_ports": [80, 443, 161, 23, 8080, 8443],
      "protocols": ["http", "https", "snmp", "telnet"]
    },
    "shell": {
      "enabled": true,
      "whitelist": ["ping", "curl", "snmpget", "snmpset", "wakeonlan", "nmap"]
    },
    "filesystem": {
      "root": "./workspace",
      "write": ["reports/**", "configs/**", "logs/**"]
    }
  },
  "llm": {
    "provider": "cloud",
    "model": "claude-sonnet-4-20250514"
  },
  "schedule": {
    "morning_check": "0 7 * * *",
    "evening_reset": "0 22 * * *"
  }
}
```

### Providers spéciaux pour AV
```javascript
// providers/av-control.js — à créer
class AVControlProvider {
  async scanDevices(subnet)        // nmap/ping scan
  async snmpGet(host, oid)         // SNMP query
  async snmpSet(host, oid, value)  // SNMP set
  async httpControl(host, cmd)     // REST API (Crestron, Extron)
  async wakeOnLan(mac)             // WOL magic packet
  async telnetCommand(host, cmd)   // Telnet (legacy AV)
  async checkZoomRoom(host)        // Zoom Rooms API
  async checkTeamsRoom(host)       // Teams Room API
}
```

---

## 11. Compétition

| Feature | Vutler Nexus | OpenClaw | LangChain Deploy | CrewAI |
|---------|-------------|----------|-----------------|--------|
| Local filesystem | ✅ | ✅ | ❌ | ❌ |
| Shell access | ✅ | ✅ | ❌ | ❌ |
| Local LLM (Ollama) | ✅ | ✅ | ❌ | ❌ |
| Multi-agent | ✅ | ❌ | ✅ | ✅ |
| Cloud sync | ✅ | ✅ | ✅ | ❌ |
| Dashboard local | ✅ | ❌ | ❌ | ❌ |
| Managed VPS | ✅ | ❌ | ✅ | ❌ |
| Swiss hosting | ✅ | ❌ | ❌ | ❌ |
| Memory (Snipara) | ✅ | ❌ | ❌ | ❌ |

**Avantage compétitif** : Nexus est le SEUL qui combine multi-agent + filesystem local + LLM local + cloud sync + mémoire partagée + Swiss hosting.

---

*Ce document est le plan de référence pour l'implémentation Nexus. Toute question → Alex.*
