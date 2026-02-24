# LLM Strategy — Vutler
**Date:** 2026-02-16
**Author:** Jarvis (Coordinator) + Alex (CEO)
**Status:** Validated — Ready for Implementation
**Sprint:** Sprint 3

---

## Executive Summary

Vutler propose deux modes pour alimenter les agents IA en LLM :

1. **BYOKEY (par défaut)** — L'utilisateur fournit sa propre clé API
2. **Managed LLM (option premium)** — Vutler fournit les tokens, facturés par tier

**Philosophie :** Comme pour l'hosting (self-hosted gratuit / managed payant), le LLM suit la même logique — gratuit si tu gères toi-même, payant si on gère pour toi.

---

## Mode 1 : BYOKEY (Bring Your Own Key)

### Comment ça marche
1. L'utilisateur crée un agent (via API ou template)
2. Dans la config agent, il saisit : `provider` (openai/anthropic/etc.) + `api_key`
3. Vutler route les requêtes LLM directement vers le provider
4. Vutler ne stocke PAS les réponses LLM (pass-through)

### Providers supportés (MVP)
| Provider | Modèles | Notes |
|----------|---------|-------|
| **OpenAI** | GPT-4o, GPT-4o-mini, o3-mini | Standard |
| **Anthropic** | Claude Sonnet 4, Haiku 4.5, Opus 4 | Premium |
| **MiniMax** | M2.5 | Budget-friendly |
| **Groq** | Llama 3.3 70B | Ultra-rapide |
| **Mistral** | Small, Medium | EU-hosted |
| **OpenRouter** | Tous modèles | Agrégateur |
| **Custom** | Tout endpoint OpenAI-compatible | Ollama, vLLM, etc. |

### Configuration UI
```
┌─ Agent Settings ─────────────────────────┐
│                                           │
│  LLM Provider: [OpenAI        ▼]         │
│  API Key:      [sk-...         ] 🔑      │
│  Model:        [gpt-4o-mini   ▼]         │
│                                           │
│  ☐ Use Managed LLM instead               │
│                                           │
└───────────────────────────────────────────┘
```

### Coût pour Vutler : $0
Marge : 100% sur l'hosting

### Cibles : Alex (technique), Maya (builder), Stefan (BYOKEY entreprise)

---

## Mode 2 : Managed LLM (Premium Add-on)

### Comment ça marche
1. L'utilisateur choisit un tier (Economy / Standard / Premium)
2. Vutler route via son propre pool de clés API (MiniMax, OpenAI, Anthropic)
3. Token metering : chaque requête est comptée par agent
4. Facturation mensuelle agrégée sur la facture hosting

### Pricing Tiers

| Tier | Nom UI | Backend réel | Coût/1M input | Coût/1M output | Prix facturé/agent/mois* | Marge |
|------|--------|-------------|---------------|-----------------|--------------------------|-------|
| **Economy** | 🟢 Starter | MiniMax M2.5 / Mistral Small | $0.15 | $0.30-0.60 | $5 | ~96% |
| **Standard** | 🔵 Pro | GPT-4o-mini / Haiku 4.5 | $0.15-0.80 | $0.60-4.00 | $10 | ~90-95% |
| **Premium** | 🟣 Ultra | Claude Sonnet 4 / GPT-4o | $2.50-3.00 | $10-15 | $20 | ~78% |

*\*Basé sur un usage moyen de ~500K tokens input + 200K tokens output par agent par mois*

### Estimation d'usage par type d'agent

| Type d'agent | Tokens input/mois | Tokens output/mois | Tier recommandé |
|-------------|-------------------|-------------------|-----------------|
| **Support email** | ~300K | ~150K | Economy ($5) |
| **Content writer** | ~800K | ~400K | Standard ($10) |
| **Research agent** | ~1.5M | ~500K | Standard ($10) |
| **Coding assistant** | ~2M | ~1M | Premium ($20) |
| **Simple FAQ bot** | ~100K | ~50K | Economy ($5) |

### Fair Use Policy
- **Economy** : 2M tokens/mois inclus, $2/1M au-delà
- **Standard** : 5M tokens/mois inclus, $3/1M au-delà
- **Premium** : 10M tokens/mois inclus, $5/1M au-delà

### Configuration UI (Elena-friendly)
```
┌─ Agent Settings ─────────────────────────┐
│                                           │
│  ☑ Use Managed LLM                        │
│                                           │
│  Choose your plan:                        │
│                                           │
│  🟢 Starter — $5/mo                      │
│     Fast & affordable. Perfect for        │
│     simple tasks (FAQ, email replies)     │
│                                           │
│  🔵 Pro — $10/mo              ← POPULAR  │
│     Smarter responses. Great for          │
│     content, research, analysis           │
│                                           │
│  🟣 Ultra — $20/mo                       │
│     Most powerful. For complex tasks      │
│     (coding, deep research, strategy)     │
│                                           │
└───────────────────────────────────────────┘
```

**Note pour Elena :** Pas de jargon technique. Pas de "GPT-4o-mini" ou "Haiku 4.5". Juste Starter/Pro/Ultra avec des descriptions simples.

### Cibles : Elena (non-technique), petites entreprises, essai rapide

---

## Architecture Technique

### LLM Router

```
┌──────────────┐
│ Agent Request │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  LLM Router  │──── Config: BYOKEY ou Managed?
└──────┬───────┘
       │
  ┌────┴────┐
  │         │
  ▼         ▼
BYOKEY    Managed
  │         │
  │    ┌────┴────┐
  │    │ Tier?   │
  │    └────┬────┘
  │    ┌────┼────┐
  │    ▼    ▼    ▼
  │   Eco  Std  Prm
  │    │    │    │
  ▼    ▼    ▼    ▼
┌──────────────────┐
│   Provider API   │
│ (OpenAI/Anthro/  │
│  MiniMax/etc.)   │
└──────────────────┘
       │
       ▼
┌──────────────┐
│ Token Meter  │──── Log: agent_id, tokens_in, tokens_out, cost, timestamp
└──────────────┘
       │
       ▼
┌──────────────┐
│  Response    │
└──────────────┘
```

### Token Meter (MongoDB collection)

```javascript
{
  _id: ObjectId,
  agent_id: "agent-123",
  workspace_id: "ws-456",
  timestamp: ISODate("2026-02-16T18:00:00Z"),
  provider: "minimax",
  model: "MiniMax-M2.5",
  tier: "economy",
  tokens_input: 1250,
  tokens_output: 380,
  cost_input: 0.000188,   // coût réel
  cost_output: 0.000228,  // coût réel
  cost_total: 0.000416,   // coût réel
  price_total: 0.008125,  // prix facturé (markup)
  request_type: "chat",   // chat, email, tool
  latency_ms: 1200
}
```

### Dashboard Usage

```
┌─ LLM Usage — February 2026 ──────────────┐
│                                            │
│  Support Bot    ████████░░  1.2M tokens    │
│  Content Agent  ██████████  2.1M tokens    │
│  FAQ Bot        ███░░░░░░░  0.4M tokens    │
│                                            │
│  Total: 3.7M tokens                        │
│  Cost: $18.50 (included in your plan)      │
│  Overage: $0                               │
│                                            │
│  [View Details]  [Change Plan]             │
└────────────────────────────────────────────┘
```

---

## Revenue Impact

### Sans Managed LLM (hosting only)
- 80 hosted customers × $180/mo avg = $14,400/mo

### Avec Managed LLM (Year 1)
- 80 hosted customers × $180/mo = $14,400/mo
- 40% utilisent Managed LLM (surtout Elena) = 32 customers
- 32 × 3 agents avg × $8/agent avg = $768/mo additional
- **Total : $15,168/mo (+5.3%)**

### Avec Managed LLM (Year 2, scale)
- 250 hosted customers × $200/mo = $50,000/mo
- 50% utilisent Managed LLM = 125 customers
- 125 × 5 agents avg × $10/agent avg = $6,250/mo additional
- **Total : $56,250/mo (+12.5%)**

**Le Managed LLM n'est pas le cash cow principal** — c'est un enabler pour Elena (réduit la friction d'adoption) et un revenue stream additionnel. Le vrai revenu reste l'hosting.

---

## MVP Scope (Sprint 3)

### P0 — Must Have
- [ ] LLM Router avec support BYOKEY (OpenAI, Anthropic) — 3 SP
- [ ] Config UI : champ provider + API key dans les settings agent — 2 SP
- [ ] Token Meter basique (log en DB) — 2 SP

### P1 — Should Have
- [ ] Managed LLM tier Economy (MiniMax backend) — 3 SP
- [ ] Dashboard usage basique (tokens par agent, par mois) — 3 SP
- [ ] 2 providers supplémentaires (Groq, Mistral) — 2 SP

### P2 — Nice to Have (Sprint 4+)
- [ ] Tier Standard + Premium
- [ ] Fair use + overage billing
- [ ] Provider auto-failover
- [ ] Cost alerts
- [ ] Model comparison A/B testing

**Total Sprint 3 LLM : 7-15 SP**

---

## Risques

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Provider rate limits | Agents throttled | Multi-provider failover |
| Managed LLM abuse (spam) | Coûts explosent | Fair use limits + monitoring |
| API key security (BYOKEY) | Leak = breach | Encryption at rest, never log keys |
| Provider outage | Agents down | Auto-failover to backup provider |
| Elena confusion | Churn | Simple UI (Starter/Pro/Ultra, pas de jargon) |
