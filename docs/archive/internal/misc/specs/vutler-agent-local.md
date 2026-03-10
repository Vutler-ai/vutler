# Spec: Vutler Agent Local (CLI/Daemon)

**Status:** Draft
**Target:** Sprint 12+
**Priority:** High (differentiator)

## Vision

Un agent local léger qui s'installe sur la machine de l'utilisateur et connecte son environnement local au workspace Vutler cloud. Modèle identique à OpenClaw : l'agent IA dans le cloud peut demander des actions locales via ce bridge.

## Installation

```bash
npm install -g @vutler/agent
# ou
brew install vutler-agent
# ou binaire standalone (pkg)
```

## Architecture

```
┌─────────────────────┐     WebSocket      ┌──────────────────┐
│  Machine locale     │ ◄──────────────────► │  app.vutler.ai   │
│                     │                      │                  │
│  vutler-agent       │                      │  Agent Runtime   │
│  ├── File access    │                      │  ├── LLM Router  │
│  ├── Shell exec     │                      │  ├── Chat UI     │
│  ├── App control    │                      │  └── Snipara     │
│  ├── Clipboard      │                      │                  │
│  └── Notifications  │                      └──────────────────┘
└─────────────────────┘
```

## Fonctionnalités (MVP)

### Phase 1 — Bridge de base
- [ ] **Auth** — Login via token workspace (généré depuis app.vutler.ai/settings)
- [ ] **WebSocket** — Connexion persistante au workspace, reconnect auto
- [ ] **File read/write** — L'agent peut lire/écrire des fichiers dans un répertoire autorisé (sandbox)
- [ ] **Shell exec** — Exécution de commandes shell (avec whitelist configurable)
- [ ] **Heartbeat** — Ping régulier pour confirmer que le bridge est actif

### Phase 2 — Identité & Mémoire
- [ ] **SOUL.md** — Fichier local de personnalité de l'agent
- [ ] **MEMORY.md** — Mémoire long-terme persistée localement
- [ ] **memory/YYYY-MM-DD.md** — Notes quotidiennes
- [ ] **USER.md** — Contexte utilisateur (rempli auto au fil des conversations)
- [ ] **AGENTS.md** — Règles de comportement
- [ ] **Sync Snipara** — Mémoire locale ↔ Snipara cloud (bidirectionnel)

### Phase 3 — Capacités avancées
- [ ] **Browser control** — Pilotage navigateur (Playwright/Puppeteer)
- [ ] **App integration** — Accès aux apps locales (calendrier, mail, etc.)
- [ ] **Clipboard** — Lecture/écriture presse-papier
- [ ] **Screenshots** — Capture d'écran à la demande
- [ ] **Notifications OS** — Alertes natives
- [ ] **Ollama bridge** — Modèles locaux comme fallback ou pour tâches privées

## Sécurité

- **Sandbox par défaut** — Accès fichiers limité à `~/.vutler/workspace/`
- **Whitelist commandes** — Seules les commandes autorisées s'exécutent
- **Confirmation utilisateur** — Actions destructives demandent confirmation (configurable)
- **Token révocable** — Depuis le dashboard web
- **Logs** — Toutes les actions locales sont loggées
- **Pas d'exfiltration** — Les données locales ne partent pas sans autorisation explicite

## Configuration

```yaml
# ~/.vutler/config.yml
workspace: https://app.vutler.ai
token: vut_xxxxx
sandbox: ~/Projects  # répertoire accessible
shell:
  enabled: true
  whitelist:
    - git
    - npm
    - node
    - python
    - ls
    - cat
    - grep
  confirm_destructive: true  # rm, mv demandent confirmation
notifications: true
ollama:
  enabled: false
  endpoint: http://localhost:11434
```

## CLI

```bash
vutler-agent login          # Auth interactive
vutler-agent start          # Démarre le daemon
vutler-agent stop           # Arrête le daemon
vutler-agent status         # État de la connexion
vutler-agent logs           # Logs récents
vutler-agent config         # Éditer la config
vutler-agent workspace      # Ouvrir le workspace local
```

## Stack technique

- **Runtime:** Node.js (ou Bun pour la perf)
- **WebSocket:** ws (client) ↔ RC/Vutler API (serveur)
- **Packaging:** pkg (binaire standalone) + npm
- **Config:** YAML (cosmiconfig)
- **Process management:** Daemon mode natif (ou systemd/launchd)

## User Stories

### S12.X — Vutler Agent Local MVP
| ID | Story | SP | Assignee |
|----|-------|----|----------|
| S12.1 | En tant qu'utilisateur, je peux installer vutler-agent via npm et me connecter à mon workspace | 5 | Mike |
| S12.2 | En tant qu'agent IA, je peux lire/écrire des fichiers sur la machine locale de l'utilisateur (dans le sandbox) | 5 | Mike |
| S12.3 | En tant qu'agent IA, je peux exécuter des commandes shell whitelistées sur la machine locale | 5 | Mike |
| S12.4 | En tant qu'utilisateur, je vois dans le chat quand mon agent local est connecté/déconnecté | 3 | Philip |
| S12.5 | En tant qu'agent IA, j'ai mes fichiers SOUL.md/MEMORY.md/USER.md persistés localement et synchronisés | 5 | Mike |
| S12.6 | En tant qu'utilisateur, je peux configurer les permissions et la whitelist depuis un fichier YAML | 3 | Mike |

**Total: 26 SP**

## Différenciateurs vs concurrence

| Feature | Vutler | ChatGPT Desktop | Claude Desktop | Cursor |
|---------|--------|-----------------|----------------|--------|
| Multi-agent workspace | ✅ | ❌ | ❌ | ❌ |
| Identité persistante (SOUL.md) | ✅ | ❌ | ❌ | ❌ |
| Mémoire évolutive | ✅ (Snipara) | Limité | Limité | ❌ |
| Shell access | ✅ | ❌ | ✅ (MCP) | ✅ |
| File access | ✅ | ❌ | ✅ (MCP) | ✅ |
| Cloud + Local hybrid | ✅ | ❌ | Partiel | ❌ |
| Custom LLM (Ollama) | ✅ | ❌ | ❌ | ✅ |
| Team collaboration | ✅ | ❌ | ❌ | ❌ |

## Notes

- S'inspirer fortement d'OpenClaw pour l'architecture (c'est prouvé que ça marche)
- Le protocole WebSocket doit être documenté pour permettre des clients tiers
- Penser au MCP (Model Context Protocol) comme standard d'interop
- Le client lourd (Electron/Tauri) viendra après, en wrappant ce daemon + une UI
