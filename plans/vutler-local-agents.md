# Vutler Local Agents — Architecture Plan

## Vision
Permettre le déploiement d'agents IA Vutler **en local** (on-premise), connectés au cloud Vutler via une connexion **sortante uniquement** (pas de port ouvert côté client).

## Deux modes

### Mode 1: Agent Local Interne (Dev/Starbox)
- Tourne sur le Mac d'Alex ou un serveur interne
- Accès direct aux fichiers locaux, outils CLI, bases de données internes
- Connecté à app.vutler.ai pour coordination et monitoring

### Mode 2: Agent Local Client (On-Premise)
- Déployé chez un client (serveur, VM, Raspberry Pi, Docker)
- **Zéro configuration réseau côté client** — pas de port entrant, pas de firewall à ouvrir
- Le client installe, lance, et l'agent se connecte tout seul au cloud

---

## Architecture

```
┌─────────────────────────────────────┐
│         Vutler Cloud (VPS)          │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Vutler API│  │ Agent Registry │  │
│  │  (3001)   │  │ + Task Queue   │  │
│  └─────┬─────┘  └───────┬────────┘  │
│        │                │            │
│  ┌─────┴────────────────┴─────────┐ │
│  │   WebSocket Gateway (wss://)   │ │
│  │   /ws/agent-tunnel             │ │
│  └────────────────────────────────┘ │
└──────────────────┬──────────────────┘
                   │ WSS (outbound only, port 443)
                   │
    ┌──────────────┴──────────────┐
    │                             │
┌───┴────────┐          ┌────────┴───────┐
│ Local Agent│          │ Local Agent    │
│ (Starbox)  │          │ (Client Site)  │
│            │          │                │
│ - CLI tools│          │ - Sandboxed    │
│ - File I/O │          │ - Limited perms│
│ - DB access│          │ - Client data  │
│ - SSH/Git  │          │ - Audit logged │
└────────────┘          └────────────────┘
```

## Tunnel Protocol (Connexion Sortante Uniquement)

### Pourquoi WebSocket et pas SSH ?
- **SSH** = le client doit ouvrir un port entrant OU configurer un reverse tunnel → complexe
- **WebSocket (wss://)** = connexion sortante sur port 443 → passe tous les firewalls/proxies corporate
- Même principe que Cloudflare Tunnel, Tailscale, ngrok

### Flow de connexion
1. Client installe l'agent: `npx vutler-agent install` ou Docker
2. L'agent reçoit un **agent token** (JWT longue durée, lié au workspace)
3. Au démarrage: connexion WSS sortante vers `wss://app.vutler.ai/ws/agent-tunnel`
4. Authentification par token
5. Le cloud envoie des **tasks** via le tunnel, l'agent exécute et renvoie les résultats
6. Heartbeat toutes les 30s pour maintenir la connexion
7. Auto-reconnect avec backoff exponentiel

### Sécurité
- **TLS obligatoire** (wss://) — chiffrement bout-en-bout
- **Token rotation** — tokens expirent, refresh automatique
- **Sandboxing** — l'agent client tourne dans un container Docker isolé
- **Permissions granulaires** — le workspace admin définit ce que l'agent peut faire
- **Audit trail** — chaque commande exécutée est loggée côté cloud ET local
- **Kill switch** — le cloud peut révoquer un agent instantanément

## Composants à développer

### 1. `vutler-agent` (Package NPM / Docker Image)
- **Runtime Node.js** léger (~50MB)
- Connexion WSS au cloud
- Exécution de tasks (LLM calls, file ops, shell commands, API calls)
- Config locale: `~/.vutler/config.json` (token, server URL, permissions)
- Logs locaux: `~/.vutler/logs/`
- CLI: `vutler-agent start|stop|status|logs|config`

### 2. Agent Tunnel Gateway (Côté Cloud)
- Endpoint WSS: `/ws/agent-tunnel`
- Gestion des connexions persistantes
- Routing des tasks vers le bon agent
- File d'attente si l'agent est temporairement déconnecté
- Dashboard de monitoring (agents connectés, latence, dernière activité)

### 3. Agent Registry (Extension API existante)
- `POST /api/v1/agents/register-local` — enregistrer un agent local
- `GET /api/v1/agents/local` — lister les agents locaux connectés
- `POST /api/v1/agents/:id/revoke` — révoquer un token
- `GET /api/v1/agents/:id/tunnel-status` — statut de connexion

### 4. Admin UI (Extension Dashboard)
- Page "Local Agents" dans le dashboard admin
- Statut en temps réel (connected/disconnected/last seen)
- Logs d'exécution
- Gestion des permissions
- Bouton "Generate Install Command" (copie la commande d'installation)

## Installation côté client

### Option A: NPM (pour devs)
```bash
npm install -g @vutler/agent
vutler-agent init --token=<TOKEN>
vutler-agent start
```

### Option B: Docker (pour production)
```bash
docker run -d \
  --name vutler-agent \
  -e VUTLER_TOKEN=<TOKEN> \
  -e VUTLER_SERVER=wss://app.vutler.ai \
  -v /data:/agent/data \
  vutler/agent:latest
```

### Option C: One-liner (pour démo)
```bash
curl -fsSL https://install.vutler.ai | sh -s -- --token=<TOKEN>
```

## Permissions Model

| Permission | Description | Default (interne) | Default (client) |
|-----------|-------------|-------------------|-------------------|
| `shell.execute` | Exécuter des commandes shell | ✅ | ❌ |
| `file.read` | Lire des fichiers | ✅ | ✅ (sandboxed) |
| `file.write` | Écrire des fichiers | ✅ | ✅ (sandboxed) |
| `network.outbound` | Requêtes HTTP sortantes | ✅ | ⚠️ (allowlist) |
| `db.query` | Requêtes DB | ✅ | ❌ |
| `llm.execute` | Appels LLM | ✅ | ✅ (via cloud) |
| `ssh.tunnel` | Tunnel SSH | ✅ | ❌ |

## Différences Interne vs Client

| Aspect | Agent Interne | Agent Client |
|--------|--------------|--------------|
| Confiance | Haute (notre infra) | Limitée (infra tierce) |
| Sandboxing | Optionnel | Docker obligatoire |
| Permissions | Larges | Restreintes par défaut |
| Données | Accès complet | Données client uniquement |
| Shell | Autorisé | Désactivé par défaut |
| Monitoring | Dashboard interne | Dashboard + alertes client |
| Updates | Manuelles | Auto-update opt-in |

## Roadmap

### Phase 1 — MVP (2 semaines)
- [ ] `vutler-agent` package NPM avec WSS tunnel
- [ ] Agent Tunnel Gateway sur le VPS
- [ ] Registration + token management API
- [ ] CLI: init, start, stop, status
- [ ] Test avec agent local sur Mac d'Alex

### Phase 2 — Production (2 semaines)
- [ ] Docker image multi-arch (amd64, arm64)
- [ ] Sandboxing complet
- [ ] Permissions granulaires
- [ ] Admin UI (page Local Agents)
- [ ] Auto-reconnect + heartbeat
- [ ] Audit logging complet

### Phase 3 — Client-Ready (2 semaines)
- [ ] One-liner install script
- [ ] Auto-update mechanism
- [ ] Client-facing dashboard (lecture seule)
- [ ] Documentation + guide déploiement
- [ ] Rate limiting + quotas par agent
- [ ] Multi-agent par site client

## Décisions (28 fév 2026)
1. **Facturation** — Exécutions incluses dans le plan workspace + exécutions supplémentaires payantes au-delà du quota
2. **Data residency** — Données restent **locales** chez le client. Seuls métadonnées, logs et statuts transitent par le cloud
3. **Offline mode** — Sur la roadmap (Phase 4), pas dans le MVP
4. **LLM routing** — Au choix du client : via cloud (centralisé, clé API Vutler) OU direct depuis l'agent local (clé API client, pour data sensitivity)
