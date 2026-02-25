# 🧪 Étude RunPod LLM — Réduction dépendance Claude/OpenAI
**Luna — Product Manager, Starbox Group**
**Date: 23 février 2026**

---

## 1. Contexte & Objectif

Évaluer la faisabilité de migrer certains agents Starbox vers des LLM open-source self-hosted sur RunPod pour réduire les coûts API Claude/OpenAI.

**Setup actuel:**
| Tier | Modèle | Agents | Prix Input/Output (per 1M tokens) |
|------|--------|--------|-----------------------------------|
| Économique | Claude Haiku | ~5 agents | $0.25 / $1.25 |
| Standard | Claude Sonnet | ~4 agents | $3.00 / $15.00 |
| Premium | Claude Opus | ~1 agent | $15.00 / $75.00 |

**Volume estimé:** 500K–2M tokens/jour (~15M–60M tokens/mois)

---

## 2. RunPod Pricing (février 2026)

### Serverless (Flex — scale-to-zero, facturé à la seconde)
| GPU | VRAM | Prix/sec (Flex) | Prix/heure (Flex) |
|-----|------|-----------------|--------------------|
| A100 | 80GB | $2.72/s* | ~$0.98/h** |
| L40S | 48GB | $1.90/s* | ~$0.68/h** |
| A6000 | 48GB | $1.22/s* | ~$0.44/h** |
| 4090 | 24GB | $1.10/s* | ~$0.40/h** |
| L4 | 24GB | $0.69/s* | ~$0.25/h** |
| A4000 | 16GB | $0.58/s* | ~$0.21/h** |

*Nota: prix affichés en centièmes de cent/sec sur le site — les valeurs ci-dessus sont en ¢/sec*

**Active Workers (always-on):** ~30% de réduction sur Flex

### Recommandation GPU par modèle
- **7-8B params** (Llama 3.1 8B, Mistral 7B): 1x L4/4090 (24GB) ✅
- **70B params** (Llama 3.3 70B, Qwen 2.5 72B): 1x A100 80GB (quantisé AWQ/GPTQ) ou 2x L40S
- **~33B params** (DeepSeek Coder 33B, Qwen 2.5 32B): 1x L40S 48GB

---

## 3. Modèles Open-Source Recommandés

### Pour tâches simples (admin, community, content, sales) — Remplacer Haiku

| Modèle | Params | Qualité vs Haiku | Tool Use | Avantage |
|--------|--------|-------------------|----------|----------|
| **Qwen 2.5 72B Instruct** | 72B | ≈ Sonnet 3.5 | ✅ Bon | Meilleur open-source généraliste |
| **Llama 3.3 70B Instruct** | 70B | ≈ Sonnet 3.5 | ✅ Natif | Meta, excellent multilingue |
| **Mistral Small 24B** | 24B | ≈ Haiku+ | ⚠️ Basique | Léger, rapide, FR natif |
| **Qwen 2.5 7B Instruct** | 7B | ≈ Haiku- | ⚠️ Limité | Ultra-économique |

**🏆 Pick: Qwen 2.5 72B ou Llama 3.3 70B** — qualité Sonnet-level au prix de Haiku self-hosted.

### Pour le code — Remplacer Sonnet

| Modèle | Params | Qualité vs Sonnet | Force |
|--------|--------|-------------------|-------|
| **DeepSeek-V3** | 671B (MoE) | ≈ Sonnet 3.5 | Code + raisonnement, mais ÉNORME |
| **Qwen 2.5 Coder 32B** | 32B | ≈ Haiku–Sonnet | Spécialisé code, function calling |
| **DeepSeek-Coder-V2 236B** | 236B (MoE) | ≈ Sonnet 3.0 | Bon mais lourd |
| **CodeLlama 70B** | 70B | < Haiku | Vieillissant |

**🏆 Pick: Qwen 2.5 Coder 32B** — meilleur ratio qualité/coût pour le code.

---

## 4. Benchmarks Comparatifs (estimations basées sur données publiques)

### Suivi d'instructions (IFEval / MT-Bench)
| Modèle | Score relatif |
|--------|--------------|
| Claude Sonnet 3.5 | 🟢 95/100 |
| Qwen 2.5 72B | 🟢 90/100 |
| Llama 3.3 70B | 🟢 88/100 |
| Claude Haiku 3.5 | 🟡 85/100 |
| Qwen 2.5 7B | 🟡 72/100 |

### Code Generation (HumanEval / MBPP)
| Modèle | HumanEval (est.) |
|--------|-----------------|
| Claude Sonnet 3.5 | ~92% |
| DeepSeek-V3 | ~90% |
| Qwen 2.5 Coder 32B | ~85% |
| Llama 3.3 70B | ~82% |
| Claude Haiku 3.5 | ~80% |

### Tool Use / Function Calling
| Modèle | Support |
|--------|---------|
| Claude Sonnet/Haiku | 🟢 Natif, excellent |
| Llama 3.3 70B | 🟢 Natif (tool_use format) |
| Qwen 2.5 72B | 🟢 Bon (format Qwen) |
| Mistral | 🟡 Correct |
| DeepSeek-V3 | 🟡 Basique |

**⚠️ Point critique:** Le tool use des modèles open-source est fonctionnel mais moins fiable que Claude. Pour des agents avec beaucoup de tools, prévoir des retries et validation.

---

## 5. Setup Technique

### Architecture recommandée
```
OpenClaw Agent → RunPod Serverless Endpoint (vLLM) → GPU
                     ↓
              API compatible OpenAI
              (POST /v1/chat/completions)
```

### Déploiement vLLM sur RunPod Serverless
1. **Image Docker:** `runpod/worker-vllm:latest` (pré-built sur RunPod Hub)
2. **Config via env vars:**
   ```
   MODEL_NAME=Qwen/Qwen2.5-72B-Instruct-AWQ
   TOKENIZER_NAME=Qwen/Qwen2.5-72B-Instruct-AWQ
   MAX_MODEL_LEN=8192
   GPU_MEMORY_UTILIZATION=0.95
   QUANTIZATION=awq
   ```
3. **Endpoint:** RunPod fournit une URL `https://api.runpod.ai/v2/{endpoint_id}/openai/v1`
4. **Scaling:** Min workers = 0, Max workers = 3-5 (selon budget)
5. **Cold start:** ~30-60s pour un modèle 70B (mitigé avec 1 active worker)

### Stack recommandé
- **vLLM** > TGI (meilleur throughput, meilleur support OpenAI API)
- **Quantisation AWQ** pour 70B sur 1x A100 80GB
- **GPTQ** alternative si AWQ pas disponible

---

## 6. Intégration OpenClaw

OpenClaw supporte les custom providers compatibles OpenAI API. Configuration:

```yaml
# Dans la config OpenClaw du provider
provider:
  name: runpod-qwen72b
  type: openai-compatible
  baseUrl: https://api.runpod.ai/v2/{ENDPOINT_ID}/openai/v1
  apiKey: ${RUNPOD_API_KEY}
  model: Qwen/Qwen2.5-72B-Instruct-AWQ
  
# Assignation par agent
agents:
  admin-agent:
    model: runpod-qwen72b
  community-agent:
    model: runpod-qwen72b
  content-agent:
    model: runpod-qwen72b
```

**Points d'attention:**
- Tester le format tool_use/function_calling (peut nécessiter un adapter)
- Le streaming fonctionne via SSE standard
- Timeout à configurer (cold start serverless)

---

## 7. Calcul Breakeven

### Coût actuel estimé (API Claude)

**Hypothèse:** 1M tokens/jour, ratio 3:1 input/output

| Tier | Tokens/jour | Coût input/jour | Coût output/jour | **Total/jour** | **Total/mois** |
|------|-------------|-----------------|-------------------|----------------|----------------|
| 5x Haiku | 500K | $0.09 | $0.16 | **$0.25** | **$7.50** |
| 4x Sonnet | 400K | $0.90 | $1.50 | **$2.40** | **$72.00** |
| 1x Opus | 100K | $1.13 | $1.88 | **$3.00** | **$90.00** |
| **TOTAL** | **1M** | | | **$5.65** | **~$170/mois** |

À 2M tokens/jour: **~$340/mois**

### Coût RunPod estimé

**Scénario: 1 endpoint Qwen 72B AWQ sur A100**

| Config | Coût/heure | Heures actives/jour | **Coût/jour** | **Coût/mois** |
|--------|-----------|---------------------|---------------|----------------|
| 1 Active worker A100 | ~$0.78/h* | 24h | $18.70 | **$561** |
| 1 Flex worker A100 | ~$0.98/h | ~4h effectives | $3.92 | **$118** |
| 1 Active + burst Flex | ~$0.78/h + burst | 24h + peaks | ~$20 | **$600** |
| 1 Flex L40S (32B model) | ~$0.68/h | ~3h effectives | $2.04 | **$61** |

*Les prix/sec du site convertis en horaire*

### Analyse Breakeven

| Scénario | Claude API | RunPod | Économie |
|----------|-----------|--------|----------|
| 1M tok/j, Flex A100 (72B) | $170/mois | ~$118/mois | **🟡 -30%** |
| 1M tok/j, Flex L40S (32B) | $170/mois | ~$61/mois | **🟢 -64%** |
| 2M tok/j, Flex A100 | $340/mois | ~$200/mois | **🟢 -41%** |
| 500K tok/j, Flex L40S | $85/mois | ~$50/mois | **🟡 -41%** |

**⚠️ MAIS:** Ce calcul ne remplace que les agents Haiku/Sonnet simples. L'agent Opus et les agents nécessitant du tool use fiable restent sur Claude.

### Scénario réaliste hybride

Migrer **5 agents Haiku** vers Qwen 2.5 32B sur L40S Flex:
- **Économie:** ~$7.50/mois → ~$50/mois... **❌ Plus cher!**

**Le problème:** À faible volume (500K tokens/jour pour 5 agents Haiku), Claude Haiku est déjà extrêmement bon marché. Le coût GPU domine.

### Breakeven réel
Pour que RunPod soit rentable vs Haiku ($0.25/$1.25 per 1M):
- Il faut **>10M tokens/jour** pour amortir le coût GPU fixe
- Ou utiliser le modèle pour **remplacer Sonnet** (beaucoup plus cher)

Pour remplacer **Sonnet** ($3/$15 per 1M) avec Qwen 72B sur A100:
- À 400K tokens/jour Sonnet → coût Claude ~$72/mois
- RunPod Flex A100 ~4h/jour → ~$118/mois → **❌ Pas rentable**
- RunPod Flex A100 ~8h+/jour (>1M tok Sonnet) → commence à être rentable

**🔑 Breakeven Sonnet: ~2-3M tokens/jour sur les agents Sonnet uniquement**

---

## 8. Recommandation Finale

### 🔴 NE PAS MIGRER MAINTENANT

**Raisons:**

1. **Volume trop faible.** À 500K-2M tokens/jour répartis sur 11 agents, Claude API est déjà très compétitif — surtout Haiku à $0.25/1M input.

2. **Haiku est imbattable en prix** pour les petits volumes. Aucun self-hosted ne peut rivaliser sous ~5M tokens/jour.

3. **Le tool use open-source n'est pas assez fiable** pour des agents en production avec beaucoup d'outils (OpenClaw agents). Risque de régression.

4. **Coût opérationnel caché:** maintenance, monitoring, debugging, mises à jour des modèles → temps dev non négligeable.

5. **Cold starts serverless** (30-60s) dégradent l'expérience agent.

### 🟡 REVISITER SI:

| Condition | Action |
|-----------|--------|
| Volume > 5M tokens/jour | Réévaluer RunPod pour agents Sonnet |
| Volume > 20M tokens/jour | RunPod devient clairement rentable |
| Modèles open-source atteignent tool use fiable | Migrer agents simples |
| Besoin de fine-tuning spécifique | RunPod pertinent (données propriétaires) |
| Claude augmente ses prix | Recalculer breakeven |

### 🟢 QUICK WINS ALTERNATIFS (sans RunPod):

1. **Downgrade agents Sonnet → Haiku** quand possible (économie ~80%)
2. **Optimiser les prompts** pour réduire tokens (shorter system prompts, caching)
3. **Prompt caching Claude** (50% réduction sur cached input tokens)
4. **Batching** des requêtes quand possible
5. **Évaluer Gemini Flash** comme alternative API bon marché

---

## 9. Résumé Exécutif

> **À notre volume actuel (500K-2M tok/jour), Claude API reste l'option la plus économique et fiable. RunPod self-hosted n'est rentable qu'au-delà de ~5M tokens/jour pour remplacer Sonnet, ou ~20M tok/jour pour remplacer Haiku. Priorité: optimiser l'usage actuel (downgrade Sonnet→Haiku, prompt caching) avant d'investir dans l'infra self-hosted.**

---

*Rapport généré par Luna 🧪 — Starbox Group Product Management*
*Sources: RunPod pricing page, RunPod docs, Artificial Analysis, données publiques benchmarks*
