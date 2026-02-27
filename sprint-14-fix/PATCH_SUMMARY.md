# Sprint 14 Runtime - Schema Mismatch Patch Summary

## 🎯 Mission Accomplie

Tous les fichiers du runtime ont été patchés pour **matcher exactement le vrai schema PostgreSQL** (tenant_vutler).

---

## 📊 Changements par Fichier

### 1️⃣ agent-loop.js

**Problèmes:**
- `updateRuntimeStatus()` utilisait `last_heartbeat` et `error_message` → colonnes inexistantes
- `getAgentLLMConfig()` sélectionnait `metadata` → colonne inexistante

**Fixes:**
- ✅ `last_heartbeat` → `last_activity`
- ✅ `error_message` → `config` (JSON)
- ✅ Removed `metadata` from SELECT query
- ✅ Table: `tenant_vutler.agent_runtime_status`

**Schema utilisé:**
```sql
agent_runtime_status: id, agent_id, status, started_at, last_activity, config, created_at, workspace_id
agent_llm_configs: id, agent_id, provider, model, temperature, max_tokens, created_at, updated_at, workspace_id
```

---

### 2️⃣ system-prompt-builder.js

**Problèmes:**
- `getAgentConfig()` queryait 8 colonnes qui **N'EXISTENT PAS** dans `agent_llm_configs`:
  - `name, role, mbti_type, soul, capabilities, system_prompt_template, metadata`
- Le vrai schema a seulement: `provider, model, temperature, max_tokens`

**Fixes:**
- ✅ Split `getAgentConfig()` en deux:
  - `getAgentLLMConfig()` → query les 4 vraies colonnes
  - `getAgentRuntimeConfig()` → fetch identity data depuis `agent_runtime_status.config` (JSON)
- ✅ Fallback hardcodé si pas de config runtime trouvée
- ✅ `assigned_to` → `assignee` dans `getAssignedTasks()`

**Schema utilisé:**
```sql
agent_llm_configs: id, agent_id, provider, model, temperature, max_tokens, created_at, updated_at, workspace_id
agent_runtime_status: id, agent_id, status, started_at, last_activity, config, created_at, workspace_id
tasks: id, title, description, status, priority, assignee, due_date, created_at, updated_at, workspace_id
```

---

### 3️⃣ memory-manager.js

**Problèmes:**
- Utilisait des colonnes inexistantes: `memory_type`, `importance`, `last_accessed_at`, `decay_factor`
- Le vrai schema: `id, agent_id, type, content, metadata, created_at, updated_at, workspace_id`

**Fixes:**
- ✅ `memory_type` → `type`
- ✅ `importance`, `decay_factor`, `last_accessed` → stockés dans `metadata` (JSONB)
- ✅ UPDATE queries modifiées pour utiliser `jsonb_set()`
- ✅ Toutes les queries préfixées avec `tenant_vutler.`

**Schema utilisé:**
```sql
agent_memories: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id
```

**Metadata structure:**
```json
{
  "importance": 5,
  "decay_factor": 1.0,
  "last_accessed": "2026-02-27T10:32:00Z",
  "tags": ["conversation", "important"]
}
```

---

### 4️⃣ tools/tasks.js

**Problèmes:**
- Utilisait `assigned_to` partout → colonne réelle est `assignee`

**Fixes:**
- ✅ Tous les `assigned_to` → `assignee`
- ✅ Tool definitions mises à jour
- ✅ Table prefix ajouté: `tenant_vutler.tasks`
- ✅ Removed `metadata` from GET query (colonne n'existe pas)

**Schema utilisé:**
```sql
tasks: id, title, description, status, priority, assignee, due_date, created_at, updated_at, workspace_id
```

---

### 5️⃣ tools/memories.js

**Problèmes:**
- Utilisait `memory_type`, `importance`, `last_accessed_at`, `decay_factor`, `embedding`, `confidence`, `access_count`
- Aucune de ces colonnes n'existe!

**Fixes:**
- ✅ `memory_type` → `type`
- ✅ Removed toutes les colonnes fictives
- ✅ `importance` et `tags` stockés dans `metadata`
- ✅ Queries filtrées via `(metadata->>'importance')::int`
- ✅ Tool definitions simplifiées

**Schema utilisé:**
```sql
agent_memories: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id
```

---

### 6️⃣ tools/goals.js

**Problèmes:**
- Utilisait `target_date` → colonne réelle est `deadline`

**Fixes:**
- ✅ `target_date` → `deadline`
- ✅ Added `phases`, `checkins` au GET query
- ✅ Table prefix ajouté: `tenant_vutler.goals`

**Schema utilisé:**
```sql
goals: id, workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority, created_at, updated_at
```

---

### 7️⃣ tools/calendar.js

**Problèmes:**
- Utilisait plein de colonnes inexistantes: `location`, `status`, `metadata`, `updated_at`, `attendees`
- Le vrai schema est **beaucoup plus simple**

**Fixes:**
- ✅ Removed: `location`, `status`, `metadata`, `updated_at`
- ✅ Real columns: `id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at`
- ✅ Tool definitions simplifiées
- ✅ Table prefix ajouté

**Schema utilisé:**
```sql
events: id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
```

---

## 🚨 ANTHROPIC_API_KEY Issue

**Constat:** Container `vutler-api` n'a **AUCUNE** variable d'API key.

**Actions requises:**
1. Ajouter `ANTHROPIC_API_KEY=process.env.ANTHROPIC_API_KEY...` dans l'env du container
2. **OU** utiliser le LLM Router existant (`/app/api/llm-router.js`) si disponible

Voir `DEPLOYMENT.md` section "CRITICAL: ANTHROPIC_API_KEY Missing"

---

## 📁 Fichiers Créés

```
projects/vutler/sprint-14-fix/
├── agent-loop.js ✅
├── system-prompt-builder.js ✅
├── memory-manager.js ✅
├── tools/
│   ├── tasks.js ✅
│   ├── memories.js ✅
│   ├── goals.js ✅
│   └── calendar.js ✅
├── DEPLOYMENT.md 📖
└── PATCH_SUMMARY.md 📄 (ce fichier)
```

---

## 🎬 Next Steps

1. **Review** les fichiers patchés
2. **Test** localement si possible (avec une DB tenant_vutler)
3. **Upload** vers le VPS (voir DEPLOYMENT.md)
4. **Backup** le runtime actuel
5. **Replace** les fichiers
6. **Configure** ANTHROPIC_API_KEY
7. **Restart** le container
8. **Test** les endpoints agent

---

## ✅ Schema Compliance

Tous les fichiers sont maintenant **100% alignés** avec le vrai schema PostgreSQL (tenant_vutler).

**Workspace ID:** `00000000-0000-0000-0000-000000000001` (hardcodé partout)

---

**Status:** ✅ READY FOR DEPLOYMENT  
**Author:** Mike ⚙️  
**Date:** 2026-02-27  
**Sprint:** 14 Runtime Patch
