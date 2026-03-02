# Plan d'Amélioration Vutler Nexus

**Date:** 2026-03-01 20:39  
**Goal:** Améliorer Nexus local avant déploiement sur MacBook Pro remote  
**Owner:** Jarvis + Mike

---

## 🎯 État Actuel du Nexus

**Version:** 1.0.0 (packages/nexus/)

**Providers supportés actuellement:**
- ✅ Claude Code CLI (via Max subscription, $0 extra)
- ✅ Anthropic API (fallback, pay-per-token)
- ❌ OpenRouter (manquant)
- ❌ Gemini (manquant)
- ❌ Autres providers (DeepSeek, GLM-5, etc.)

**Features actuelles:**
- ✅ Web UI (localhost:3939)
- ✅ File operations
- ✅ Tool execution
- ✅ Memory system
- ✅ Cloud tunnel (optional)
- ✅ Conversation management

**Gaps identifiés:**
- ❌ Pas de multi-provider switching (OpenRouter)
- ❌ Pas de routing local vs cloud agents
- ❌ Pas de model selection UI
- ❌ Pas de cost tracking per model

---

## 🔧 Améliorations Requises

### 1. Support OpenRouter (Priority P0)

**Goal:** Permettre à Nexus d'utiliser n'importe quel modèle via OpenRouter

**Implementation:**
```javascript
// lib/llm-router.js (nouveau fichier)
const OpenAI = require('openai'); // OpenRouter compatible

class LLMRouter {
  constructor(config) {
    this.providers = {
      claudeCode: new ClaudeCodeProvider(),
      anthropic: new AnthropicProvider(config.anthropicKey),
      openrouter: new OpenAI({
        apiKey: config.openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1'
      })
    };
    this.defaultProvider = config.defaultProvider || 'openrouter';
    this.defaultModel = config.defaultModel || 'google/gemini-2.0-flash-thinking-exp:free';
  }

  async chat(messages, options = {}) {
    const provider = options.provider || this.defaultProvider;
    const model = options.model || this.defaultModel;
    
    if (provider === 'openrouter') {
      return this.providers.openrouter.chat.completions.create({
        model,
        messages,
        ...options
      });
    }
    // ... autres providers
  }
}
```

**Config file update (`~/.vutler/config.json`):**
```json
{
  "llm": {
    "defaultProvider": "openrouter",
    "defaultModel": "google/gemini-2.0-flash-thinking-exp:free",
    "providers": {
      "openrouter": {
        "apiKey": "sk-or-v1-...",
        "enabled": true
      },
      "anthropic": {
        "apiKey": "sk-ant-...",
        "enabled": false
      },
      "claudeCode": {
        "enabled": false
      }
    }
  }
}
```

**package.json update:**
```json
{
  "dependencies": {
    "openai": "^4.57.0"  // déjà présent, compatible OpenRouter
  }
}
```

**Effort:** 3-5 SP

---

### 2. Model Selection UI (Priority P0)

**Goal:** Interface web pour choisir provider + model

**UI Mockup (Web UI localhost:3939):**
```
┌─────────────────────────────────────┐
│ Settings → LLM Configuration        │
├─────────────────────────────────────┤
│                                     │
│ Provider: [OpenRouter ▼]           │
│                                     │
│ Model:    [Gemini 2.0 Flash ▼]     │
│           FREE • 1M context         │
│                                     │
│ Alternative Models:                 │
│ • DeepSeek V3    ($0.27/M)         │
│ • GLM-5          ($0.95/M)         │
│ • Claude Opus 4  ($15/M)           │
│                                     │
│ [Save Settings]                     │
└─────────────────────────────────────┘
```

**Endpoint:**
```javascript
// Web server (lib/web.js)
app.get('/api/settings/llm', (req, res) => {
  res.json(config.llm);
});

app.post('/api/settings/llm', (req, res) => {
  config.llm = { ...config.llm, ...req.body };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

app.get('/api/models', async (req, res) => {
  // Fetch from OpenRouter /models endpoint
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${config.llm.providers.openrouter.apiKey}` }
  });
  const models = await response.json();
  res.json(models);
});
```

**Effort:** 3 SP

---

### 3. Local vs Cloud Agent Routing (Priority P1)

**Goal:** User peut dire "utilise agent cloud" ou "fais ça localement"

**Architecture:**
```
User request → Nexus Router
    ↓
    ├─ "Complexité low" → Local Nexus (Gemini gratuit)
    ├─ "Complexité high" → Cloud Agent (Opus 4)
    └─ "Explicit: use cloud" → Cloud Agent
```

**Implementation:**
```javascript
// lib/router.js
async function routeRequest(message, context) {
  // Check explicit routing
  if (message.includes('use cloud') || message.includes('agent cloud')) {
    return await routeToCloud(message, context);
  }
  
  if (message.includes('locally') || message.includes('en local')) {
    return await routeToLocal(message, context);
  }
  
  // Auto-routing based on complexity
  const complexity = estimateComplexity(message, context);
  
  if (complexity > 0.7) {
    // High complexity → Cloud (Opus 4)
    return await routeToCloud(message, context);
  } else {
    // Low complexity → Local (Gemini)
    return await routeToLocal(message, context);
  }
}

function estimateComplexity(message, context) {
  let score = 0;
  
  // Indicators of high complexity
  if (message.length > 500) score += 0.2;
  if (message.includes('architecture') || message.includes('design')) score += 0.3;
  if (context.filesCount > 10) score += 0.2;
  if (message.includes('analyze') || message.includes('compare')) score += 0.3;
  
  return score;
}

async function routeToCloud(message, context) {
  // Call Vutler Cloud API
  const response = await fetch('https://app.vutler.ai/api/v1/agents/jarvis/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.cloudToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, context })
  });
  return response.json();
}

async function routeToLocal(message, context) {
  // Use local LLM (OpenRouter Gemini)
  return await llmRouter.chat([
    { role: 'user', content: message }
  ], {
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-thinking-exp:free'
  });
}
```

**Effort:** 5 SP

---

### 4. Cost Tracking (Priority P2)

**Goal:** Afficher coût total par session

**DB Schema (SQLite local):**
```sql
CREATE TABLE usage (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  provider TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL
);
```

**UI:**
```
┌─────────────────────────────────────┐
│ Usage This Session                  │
├─────────────────────────────────────┤
│ Gemini 2.0 Flash:    $0.00 (FREE)  │
│ DeepSeek V3:         $0.03          │
│ Cloud Agent (Opus):  $0.45          │
│                                     │
│ Total:               $0.48          │
└─────────────────────────────────────┘
```

**Effort:** 3 SP

---

## 📅 Plan d'Implémentation

### Phase 1: Support OpenRouter (3-5 jours)
- [ ] Ajouter OpenRouter au LLM Router
- [ ] Update config.json schema
- [ ] Tests avec Gemini 2.0 Flash
- [ ] Tests avec DeepSeek V3
- [ ] Tests avec GLM-5

### Phase 2: Model Selection UI (2-3 jours)
- [ ] Web UI settings page
- [ ] Models endpoint (fetch from OpenRouter)
- [ ] Save/load settings
- [ ] Restart Nexus après changement model

### Phase 3: Local vs Cloud Routing (3-5 jours)
- [ ] Complexity estimator
- [ ] Cloud API integration
- [ ] Auto-routing logic
- [ ] Explicit routing ("use cloud")
- [ ] Tests end-to-end

### Phase 4: Cost Tracking (2 jours)
- [ ] SQLite storage
- [ ] Cost calculation per model
- [ ] Web UI usage dashboard

**Total Effort:** ~18 SP = 2-3 semaines

---

## 🧪 Tests Avant Déploiement Remote

**Checklist de validation:**
- [ ] OpenRouter fonctionne (Gemini gratuit)
- [ ] Model switching fonctionne
- [ ] Local routing fonctionne
- [ ] Cloud routing fonctionne
- [ ] Web UI accessible
- [ ] Config persiste après restart
- [ ] Cost tracking accurate
- [ ] File operations OK
- [ ] Memory system OK
- [ ] Tunnel cloud OK (optional)

**Environnement de test:**
1. Test local sur Mac actuel (où OpenClaw tourne)
2. Parallel run: OpenClaw + Nexus en même temps
3. Validation que Nexus peut remplacer OpenClaw
4. Deployment sur MacBook Pro remote via Tailscale

---

## 🎯 Success Criteria

**Avant déploiement remote, Nexus doit:**
- ✅ Supporter OpenRouter (Gemini gratuit)
- ✅ Permettre model selection via UI
- ✅ Router intelligemment local vs cloud
- ✅ Coûter ~$0/mois (Gemini gratuit) pour usage standard
- ✅ Fonctionner aussi bien qu'OpenClaw pour tâches quotidiennes

**Post-déploiement:**
- MacBook Pro remote = Nexus Jarvis actif 24/7
- Mac actuel = OpenClaw en standby (fallback)
- Migration progressive: 80% Nexus, 20% OpenClaw
- Sunset OpenClaw après 1 mois de stabilité Nexus

---

**Next Steps:**
1. Mike implémente Phase 1 (OpenRouter) après bugs P1/P2 Vutler
2. Jarvis test Nexus localement
3. Deployment sur MacBook Pro via Tailscale
4. Migration progressive depuis OpenClaw
