# Plan de Bascule Modèle - Jarvis

**Date décision:** 2026-03-01 20:25
**Décision:** Basculer de Claude Sonnet 4.5 → Gemini 2.0 Flash à 92% utilisation Claude Max

---

## 📊 Seuil de Bascule

| Métrique | Valeur |
|----------|--------|
| **Trigger:** | 92% Claude Max utilisé (8% restant) |
| **Status actuel:** | 84% utilisé (16% restant) |
| **Marge restante:** | ~8% avant bascule |

---

## 🎯 Configuration Cible

**Nouveau modèle Jarvis (main agent):**
- **Provider:** google
- **Model:** `google/gemini-2.0-flash-thinking-exp:free`
- **Pricing:** GRATUIT (quota limité, puis fallback)
- **Context:** 1M tokens
- **Fallback 1:** `deepseek/deepseek-chat` ($0.27/M)
- **Fallback 2:** `z-ai/glm-5` ($0.95/M)

**Workflow 4-tiers final:**
```
TIER 1: Stratégie critique → Claude Opus 4 (<5% usage)
    ↓
TIER 2: Coordination → Gemini 2.0 Flash gratuit (70%)
    ↓
TIER 3: Backup → DeepSeek V3 si quota épuisé (10%)
    ↓
TIER 4: Implementation → Mike/Kimi K2.5 (15%)
```

---

## 🔧 Actions à Exécuter (à 92%)

### 1. Mise à jour OpenClaw config
```bash
openclaw config.patch
```

Ajouter provider Google + update agent Jarvis:
```json
{
  "providers": {
    "google": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-590f4fec..."
    }
  },
  "agents": {
    "main": {
      "model": "google/gemini-2.0-flash-thinking-exp:free"
    }
  }
}
```

### 2. Test
Vérifier que Gemini répond correctement

### 3. Monitor
Suivre performance vs Claude sur tâches identiques

---

## 📈 Économies Estimées

**Avec Claude Sonnet 4.5:**
- 100k tokens input/jour = $1.50/jour = $45/mois

**Avec Gemini 2.0 Flash:**
- 100k tokens input/jour = $0/jour = $0/mois (dans quota gratuit)
- Si quota épuisé → DeepSeek V3 = $0.03/100k = $0.90/mois

**Économie:** $44-45/mois (98% réduction)

---

## ⚠️ Monitoring Auto

Jarvis vérifie automatiquement le % Claude Max restant via:
- `/status` command
- `session_status` tool
- Alertera Alex à 10% restant (avant seuil 8%)
- Basculera à 8% restant

---

**Note:** Décision réversible — si Gemini performance < Claude, retour arrière possible
