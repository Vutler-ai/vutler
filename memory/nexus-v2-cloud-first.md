# Nexus v2.0 - Cloud-First Architecture ☁️

**Date:** 2026-03-01 22:20  
**Status:** Code ready, API backend needed  
**GitHub:** https://github.com/alopez3006/nexus-prototype

---

## 🎯 Vision Finale

**Nexus = Coordinateur local léger**
- Analyse les requêtes
- Route vers le bon agent cloud
- Gère le contexte/mémoire locale
- **PAS** d'exécution locale (plus de spawn OpenRouter)

**Agents = Cloud Vutler**
- Mike, Philip, Luna, Andrea, Max, Oscar, Nora, Victor, Rex, Stephen
- Tournent sur VPS (app.vutler.ai)
- API centralisée
- Scalable et maintenu

---

## ✅ Ce qui est fait (22:20)

### 1. Code Nexus v2.0

**Fichiers créés:**
- `lib/vutler-client.js` (3.2KB) - Client API Vutler
- `lib/orchestrator-cloud.js` (5.6KB) - Orchestrateur cloud
- `.vutler-agents-cloud.json` (4.2KB) - Config 10 agents cloud
- `CLOUD-SETUP.md` (4.6KB) - Documentation complète

**Changements:**
- ❌ Plus de `spawn()` de process locaux
- ✅ Appels API vers Vutler Cloud
- ✅ Smart routing préservé
- ✅ 10 agents configurés

**Commit:** `760e692` - Nexus v2.0: Cloud-First Architecture

**Pushed:** https://github.com/alopez3006/nexus-prototype

---

## ⏳ Ce qui manque (à faire)

### 1. API Vutler Backend

**Endpoint requis:**

```
POST /api/v1/agents/:id/execute
```

**Request:**
```json
{
  "task": "Fix this bug in my code...",
  "context": { "project": "vutler", "file": "app.js" },
  "timeout": 300000,
  "streaming": false
}
```

**Response:**
```json
{
  "success": true,
  "agent": {
    "id": "mike",
    "name": "Mike (Code Expert)"
  },
  "output": "The bug is caused by...",
  "cost": 0.012,
  "usage": {
    "inputTokens": 450,
    "outputTokens": 850
  },
  "duration": 3420
}
```

**Implémentation:**
- Location: `vutler-api/custom/api/agents.js`
- Auth: Bearer token (VUTLER_API_KEY)
- Méthode: Appeler l'agent RC via API interne
- Timeout: Configurable (default 5 min)

**Owner:** Mike (à implémenter après bugs P0)

---

## 📋 Setup Alex (MacBook Max)

### Étape 1: Pull Nexus v2.0

```bash
cd ~/nexus-prototype
git pull origin main
```

### Étape 2: Copie config cloud

```bash
cp .vutler-agents-cloud.json ~/.vutler/agents.json
```

### Étape 3: Set API key

```bash
# Créer une API key Vutler (via app.vutler.ai)
export VUTLER_API_KEY='vutler_abc123...'

# Permanent
echo "export VUTLER_API_KEY='vutler_abc123...'" >> ~/.zshrc
```

### Étape 4: Test (quand API prête)

```bash
nexus test                          # Test connexion cloud
nexus agents                        # Liste agents disponibles
nexus task "What is 2+2?"           # Test simple
nexus task "Fix bug X" --agent mike # Test routing
```

---

## 🔧 Workflow Complet

### Current State (Avant v2.0)

```
User → Nexus (local)
  ↓
  Spawn OpenRouter process
  ↓
  Kimi K2.5 local execution
  ↓
  Résultat
```

**Problèmes:**
- Setup complexe (OpenRouter API key)
- Limité à 2-3 agents
- Coût utilisateur
- Pas scalable

### New State (v2.0)

```
User → Nexus (local)
  ↓
  Analyse + Route
  ↓
  POST /api/v1/agents/:id/execute
  ↓
  Vutler Cloud (VPS)
  ↓
  Agent Mike/Philip/Luna/etc.
  ↓
  Résultat → Nexus → User
```

**Avantages:**
- Setup simple (1 API key)
- 10+ agents disponibles
- Coût Vutler (pas utilisateur)
- Scalable infiniment
- Maintenance centralisée

---

## 🎯 Prochaines Étapes

### 1. Mike implémente API endpoint (1-2h)

**Priority:** P1 (après bugs P0 Vutler fixés)

**Task:**
```
Créer endpoint POST /api/v1/agents/:id/execute
- Auth via Bearer token
- Execute agent task via RC API
- Return output + cost + usage
- Handle timeouts + errors
```

**DoD:**
- [ ] Endpoint créé et testé
- [ ] Auth fonctionne
- [ ] Mike agent répond correctement
- [ ] Erreurs gérées (404, 500, timeout)
- [ ] Déployé sur VPS

### 2. Alex teste Nexus v2.0

**Après API ready:**
- [ ] Pull repo
- [ ] Setup config
- [ ] Test connexion
- [ ] Test routing (keywords)
- [ ] Test tous les agents (10)

### 3. Dogfooding

**Utiliser Nexus v2.0 pour:**
- Tasks quotidiennes
- Bug fixes (Mike)
- Design reviews (Philip)
- Product planning (Luna)
- Content creation (Oscar)

---

## 📊 Impact

### Avant (Local)

| Aspect | Value |
|--------|-------|
| Setup time | 15 min |
| Agents | 2-3 |
| API keys | 2 (OpenRouter + Vutler) |
| Cost per task | $0.01-0.05 |
| Maintenance | User |

### Après (Cloud)

| Aspect | Value |
|--------|-------|
| Setup time | 5 min |
| Agents | 10+ |
| API keys | 1 (Vutler) |
| Cost per task | $0 (Vutler) |
| Maintenance | Centralisé |

---

## 🚀 Vision Long-Terme

**Nexus devient:**
1. **CLI léger** (coordinateur)
2. **Desktop app** (Electron, UI)
3. **Mobile app** (iOS/Android)
4. **Web interface** (app.vutler.ai/nexus)

**Tous connectés aux mêmes agents cloud Vutler.**

**Agents Vutler deviennent:**
- Marketplace (hire agents from others)
- Custom agents (train your own)
- Agent teams (multi-agent workflows)
- Enterprise features (SSO, audit, etc.)

---

## 📝 Notes Techniques

**API Contract:**

Endpoint: `POST /api/v1/agents/:id/execute`

Headers:
```
Authorization: Bearer vutler_abc123...
Content-Type: application/json
```

Body:
```json
{
  "task": "string (required)",
  "context": "object (optional)",
  "timeout": "number (optional, ms)",
  "streaming": "boolean (optional)"
}
```

Response (200):
```json
{
  "success": true,
  "agent": { "id": "...", "name": "..." },
  "output": "string",
  "cost": 0.012,
  "usage": { "inputTokens": 450, "outputTokens": 850 },
  "duration": 3420
}
```

Response (40x/50x):
```json
{
  "success": false,
  "error": "Agent not found",
  "message": "Agent 'unknown' does not exist"
}
```

---

## ✅ Ready to Deploy

**Code:** ✅ Prêt (pushed to GitHub)  
**Docs:** ✅ Complètes (CLOUD-SETUP.md)  
**Config:** ✅ Exemple fourni (.vutler-agents-cloud.json)  
**API:** ⏳ Manquante (Mike à implémenter)

**Bloqueur:** API endpoint `/api/v1/agents/:id/execute` doit être créé sur Vutler backend

---

**Créé:** 2026-03-01 22:20  
**Status:** Code ready, waiting for API  
**Owner:** Jarvis (code) + Mike (API)  
**Next:** Mike implémente API après bugs P0
