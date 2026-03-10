# Snipara Dogfood Report — Jarvis (Coordinator)
**Date:** 2026-02-16
**Role:** Coordination, sprint planning, doc management
**Project:** Vutler (35 docs, 522K chars, 807 sections)

---

## Tools Testés

### ✅ rlm_context_query — ⭐⭐⭐⭐⭐
- **Vitesse:** 3.3s pour 8 sections pertinentes — excellent
- **Pertinence:** Query "Docker setup instructions" → retourne exactement les bonnes sections (sprint-1, quickstart, docker-compose, infra)
- **Token savings:** 1000 tokens demandés vs 522K chars de docs = ~99.8% de réduction
- **Usage réel:** C'est THE tool. Si un agent ne devait en avoir qu'un, c'est celui-là.

### ✅ rlm_stats — ⭐⭐⭐⭐
- Utile pour valider que l'upload a marché (35 files, 16122 lines, 807 sections)
- Manque : un breakdown par fichier (taille, nb sections) serait top

### ✅ rlm_decompose — ⭐⭐⭐
- Décompose bien les queries complexes
- **Problème :** Sub-query #3 "each one" est vide de sens. La décomposition est trop littérale — elle split la phrase au lieu de comprendre l'intention
- **Suggestion :** Décomposer par CONCEPT pas par mots. "Risks + mitigations" devrait donner : 1) "technical risks MVP", 2) "operational risks", 3) "mitigation strategies"

### ✅ rlm_orchestrate — ⭐⭐⭐⭐⭐
- **Vitesse:** 2s pour une question multi-docs — impressionnant
- Fait tout en un call : scan sections → rank → load le doc le plus pertinent
- Retourne le pricing strategy complet (3245 tokens) en un seul appel
- **C'est le meilleur tool pour les questions complexes.** Mieux que decompose + multi_query manuellement.

### ✅ rlm_remember / rlm_recall — ⭐⭐⭐
- Fonctionne bien une fois qu'on connaît le bon param (`content` pas `text`)
- **Friction :** Le param s'appelle `content` mais la description dit "Store a memory". On s'attend à `text` ou `memory`. Naming inconsistant avec le reste de l'API.
- Recall avec relevance 0.54 pour une query directement liée — le score semble bas ?
- **Manque :** Pas de bulk remember. Si je veux stocker 10 décisions d'un sprint, je dois faire 10 calls.

### ✅ rlm_sync_documents — ⭐⭐⭐⭐⭐
- Upload 35 docs en un seul call — parfait
- Réponse claire : "35 created, 0 updated"
- `delete_missing: false` est le bon default

### ✅ rlm_sections — ⭐⭐⭐⭐
- Pagination OK, filtering par fichier OK
- Utile pour explorer la structure d'un doc avant de query

### ⚠️ rlm_upload_document — Non testé directement
- Utilisé via sync_documents (bulk) — pas eu besoin du single upload

---

## Ce qui m'a plu

1. **rlm_context_query est un game-changer.** Au lieu de lire 46K chars de PRD, je query "MVP scope" et j'ai les 3 sections pertinentes en 3s. Pour un coordinateur qui doit jongler entre 35 docs, c'est indispensable.

2. **rlm_orchestrate = magie.** Un seul call pour "pricing vs compétition" et il me sort tout le doc pricing + les sections compétitives. Pas besoin de chaîner decompose → multi_query → load.

3. **rlm_sync_documents = DX parfaite.** Un script Python, un call, 35 docs indexées. Zéro friction.

4. **Vitesse générale.** 2-3s par query, c'est acceptable même en boucle. Pas de timeout, pas de rate limit touché.

5. **MCP natif.** JSON-RPC standard, fonctionne avec curl, pas besoin de SDK. Simple.

---

## Ce qui ne m'a pas plu

1. **rlm_decompose trop littéral.** Split "each one" comme sub-query = inutile. Devrait comprendre l'intention sémantique.

2. **Naming inconsistant.** `rlm_remember` utilise `content`, d'autres tools utilisent `query`, `text`, `question`. Un agent qui découvre les tools va se tromper (j'ai fait l'erreur).

3. **Pas de feedback sur le chunking.** Après sync, je ne sais pas comment mes docs ont été chunkées. Combien de chunks par doc ? Quelle taille ? Un `rlm_chunks_info` serait utile.

4. **rlm_recall score bas.** Relevance 0.54 pour une query qui match quasi exactement le contenu stocké. Soit le scoring est trop conservateur, soit l'embedding n'est pas optimal pour des phrases courtes.

5. **Pas de rlm_remember bulk.** En fin de sprint, je veux stocker 10 décisions d'un coup. 10 calls séquentiels = lent.

6. **43 tools = overwhelming.** Un dev qui arrive ne sait pas par où commencer. Il manque un "start here" : utilise `rlm_context_query` pour 80% des cas, `rlm_orchestrate` pour les questions complexes, le reste est advanced.

---

## Suggestions d'amélioration

### Quick wins
- [ ] **Renommer** `content` → `text` dans rlm_remember (ou accepter les deux)
- [ ] **Ajouter `rlm_remember_bulk`** — array de memories en un call
- [ ] **Améliorer rlm_decompose** — décomposer par concept, pas par mots
- [ ] **Tool tiers** dans la doc : Essential (3 tools) → Power (10 tools) → Advanced (30+ tools)

### Medium effort
- [ ] **`rlm_chunks_info`** — voir le chunking d'un doc (nb chunks, tailles, overlap)
- [ ] **Improve recall scoring** — relevance 0.54 pour un match quasi-exact semble bas
- [ ] **rlm_context_query + return_references** — j'ai vu l'option mais pas testé. La doc devrait pousser ce pattern (query refs → get_chunk) pour réduire hallucinations.

### Bigger items
- [ ] **Guided onboarding tool** — `rlm_help` qui recommande le bon tool selon la question
- [ ] **Usage analytics** — combien de queries/jour, quels tools, token consumption. Pour le dashboard admin.

---

## Comparaison : Snipara vs Charger les fichiers

| Méthode | Tokens | Temps | Pertinence |
|---------|--------|-------|-----------|
| Charger 06-prd-full.md | ~12K tokens | instant (mais pollue le contexte) | 100% mais bruit++ |
| rlm_context_query "MVP scope" | ~1K tokens | 3s | 95% — sections ciblées |
| rlm_orchestrate question complexe | ~3K tokens | 2s | 90% — charge le bon doc |
| Charger tous les docs (35) | ~130K tokens | impossible (dépasse contexte) | N/A |

**Verdict :** Pour un projet de 35 docs, Snipara est **indispensable**. Sans ça, impossible de donner le contexte complet aux agents workers. Avec, chaque query coûte 1-3K tokens au lieu de 130K.

**ROI estimé pour Vutler Sprint 1-2 :** ~50 queries × 3K tokens = 150K tokens. Sans Snipara : 50 × 130K = 6.5M tokens. **Économie : ~97.7%.**

---

## Note globale

**4/5 ⭐** — Excellent produit core (context_query + orchestrate + sync). Les frictions sont mineures (naming, decompose, onboarding). Le value prop est réel et mesurable. Je l'utiliserais sur tous les projets Starbox.
