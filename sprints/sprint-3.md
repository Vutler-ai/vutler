# Sprint 3 — LLM Router, Token Metering & OpenClaw Integration
**Dates:** 2026-03-17 → 2026-03-30 (2 semaines)
**Objectif:** Agents Vutler peuvent utiliser un LLM (BYOKEY ou Managed), token tracking, templates connectés à OpenClaw
**Capacité:** ~24 SP

---

## Stories Sprint 3

### 🔴 P0 — Must Ship

#### S3.1 — LLM Router Service (5 SP) — Mike
- [ ] Service `llm-router` dans Vutler API
- [ ] Support BYOKEY : l'agent config contient `llm_provider` + `llm_api_key` + `llm_model`
- [ ] Route vers OpenAI, Anthropic, MiniMax (3 providers MVP)
- [ ] Endpoint OpenAI-compatible pour les providers custom (Ollama, Groq, etc.)
- [ ] Fallback configurable (si provider down → backup)
- [ ] API keys chiffrées en DB (AES-256)
- [ ] `POST /api/v1/agents/:id/chat` → envoie un message au LLM de l'agent, retourne la réponse
- [ ] Tests unitaires + intégration

#### S3.2 — Token Meter (3 SP) — Mike
- [ ] Collection MongoDB `token_usage` : agent_id, tokens_in, tokens_out, cost, provider, model, timestamp
- [ ] Middleware qui log chaque requête LLM automatiquement
- [ ] `GET /api/v1/agents/:id/usage` → usage tokens par jour/semaine/mois
- [ ] `GET /api/v1/usage/summary` → usage global du workspace

#### S3.3 — Managed LLM Tier Economy (3 SP) — Mike
- [ ] Config workspace : `managed_llm: true`, `managed_tier: "economy"`
- [ ] Backend : route vers MiniMax M2.5 avec la clé Vutler (pas celle du user)
- [ ] Fair use : 2M tokens/mois inclus, log si dépassement
- [ ] Seed config : tiers economy/standard/premium avec providers + limits

#### S3.4 — LLM Config UI (3 SP) — Philip
- [ ] Section "LLM Settings" dans la page agent detail
- [ ] Mode BYOKEY : champs provider (dropdown), API key (masqué), model (dropdown)
- [ ] Mode Managed : choix Starter/Pro/Ultra (cards simples, pas de jargon)
- [ ] Toggle entre BYOKEY et Managed
- [ ] Validation : test de connexion au provider quand on sauvegarde

#### S3.5 — OpenClaw Agent Runtime (5 SP) — Mike
- [ ] Quand un agent est créé depuis un template, Vutler lance un process OpenClaw
- [ ] Utilise le fork OpenClaw (`projects/vutler/openclaw/`)
- [ ] Config OpenClaw générée automatiquement : system prompt, tools, LLM provider
- [ ] Agent OpenClaw se connecte à Vutler via API (email, chat, drive)
- [ ] Start/Stop agent depuis l'API : `POST /api/v1/agents/:id/start`, `POST /api/v1/agents/:id/stop`
- [ ] Health check : agent alive/dead visible dans le dashboard

### 🟡 P1 — Should Ship

#### S3.6 — Usage Dashboard (3 SP) — Philip
- [ ] Page `/usage` : graphique tokens par agent par mois
- [ ] Barres de progression par agent (tokens utilisés vs limite)
- [ ] Coût estimé (managed) ou tokens consommés (BYOKEY)
- [ ] Responsive, Fuselage design

#### S3.7 — Drive Upload API (3 SP) — Mike
**Story 7 du PRD** : Agent uploads file to shared drive
- [ ] `POST /api/v1/drive/upload` avec file (multipart) + path
- [ ] Storage : filesystem local ou S3/MinIO configurable
- [ ] `GET /api/v1/drive/files` → liste des fichiers
- [ ] `GET /api/v1/drive/download/:id` → télécharger un fichier

---

## Total Sprint 3 : 25 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S3.1, S3.2, S3.3, S3.5, S3.7 | 19 SP |
| **Philip** 🎨 | S3.4, S3.6 | 6 SP |
| **Luna** 🧪 | Acceptance testing, LLM tier validation | — |
| **Jarvis** ⚡ | Coordination, Snipara context, code review | — |

---

## Stack & Tools

| Outil | Usage |
|-------|-------|
| **MiniMax M2.5** | Modèle par défaut pour Mike/Philip/Luna (configuré) |
| **Snipara CONTEXT** | Query docs via `rlm_context_query` (projet `vutler`, 36 docs indexés) |
| **Snipara API Key** | `rlm_b48e3a6c0076df162367f7310ed6a7439e031dd38d87560f0b20702e93fea889` |
| **Docker** | Dev + tests end-to-end |

---

## Critères de succès Sprint 3

✅ Créer un agent avec BYOKEY OpenAI → l'agent répond via LLM
✅ Créer un agent avec Managed LLM Economy → l'agent répond via MiniMax
✅ Token usage visible dans l'API et le dashboard
✅ Déployer un agent template → OpenClaw process démarre → agent fonctionne
✅ Start/Stop agent depuis l'API
✅ Upload un fichier via Drive API
