# TOOLS.md - Local Notes

## Snipara MCP (all agents)
- **Project**: vutler (active), moltbot (legacy)
- **Team**: alopez-nevicom-1769121450132
- **Team API URL**: https://api.snipara.com/mcp/team/alopez-nevicom-1769121450132
- **Team API Key (moltbot)**: rlm_e4fe04c335330563e03bbb9e15f2a8aeb49443c7a53995d20626afb8c7017708
- **Vutler API Key**: REDACTED_SNIPARA_KEY_3
- 54 fichiers indexés, 708 sections
- **12 projets**: dubgrr, zorai, vaultbrix, snipara, moltbot, snipara-fastapi, snipara-demo, rlm-runtime, my-api, superdb, swaploom, vibe-coding

### Key Tools
| Tool | Usage |
|------|-------|
| `rlm_context_query` | Query optimisé — utilise ça par défaut pour chercher dans les docs |
| `rlm_ask` | Question simple sur la doc |
| `rlm_search` | Regex search dans les docs |
| `rlm_decompose` | Décomposer une question complexe en sous-queries |
| `rlm_multi_query` | Plusieurs queries en un call (économise les tokens) |
| `rlm_remember` | Stocker un souvenir (fact, decision, learning, preference) |
| `rlm_recall` | Rappeler des souvenirs sémantiquement |
| `rlm_load_document` | Charger un doc complet (pour gros fichiers) |
| `rlm_load_project` | Charger tout le contexte projet |
| `rlm_orchestrate` | Orchestration multi-étapes pour des ops complexes |
| `rlm_repl_context` | Bridge MCP ↔ REPL pour exécution |
| `rlm_upload_document` | Uploader/mettre à jour un doc |
| `rlm_shared_context` | Contexte partagé entre collections |

### Swarm Tools (coordination multi-agent)
| Tool | Usage |
|------|-------|
| `rlm_swarm_create` | Créer un swarm |
| `rlm_swarm_join` | Rejoindre un swarm |
| `rlm_claim` / `rlm_release` | Réserver/libérer une ressource |
| `rlm_state_get` / `rlm_state_set` | État partagé du swarm |
| `rlm_broadcast` | Envoyer un event à tout le swarm |
| `rlm_task_create` / `rlm_task_claim` / `rlm_task_complete` | File de tâches distribuée |

### Memory Tools
- `rlm_remember` — types: fact, decision, learning, preference, todo
- `rlm_recall` — recherche sémantique dans les souvenirs
- `rlm_memories` — lister avec filtres
- `rlm_forget` — supprimer

### API Format
- **Header:** `X-API-Key: <key>` (NOT `Authorization: Bearer`)
- **Body format:** JSON-RPC 2.0: `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}`

### Best Practices
1. **Toujours utiliser `rlm_context_query`** avant de répondre à une question sur les projets
2. **`rlm_remember`** les décisions importantes, les préférences utilisateur, les learnings
3. Pour les gros documents : `rlm_load_document` ou `rlm_orchestrate`
4. En mode swarm : `rlm_claim` avant de modifier un fichier partagé

## Cameras
(none configured)

## SSH
(none configured)

## TTS
- Preferred voice: default
