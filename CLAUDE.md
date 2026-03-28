# Vutler — Claude Code Instructions

## Project Overview

Vutler is an AI-powered business automation platform. Users create specialized AI agents with skills to automate tasks (sales, marketing, ops, finance, etc.). Built with Next.js frontend + Express.js API + Supabase (PostgreSQL).

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Express.js, Node.js
- **Database:** Supabase (PostgreSQL), schema `tenant_vutler`
- **Auth:** Supabase Auth
- **Deployment:** VPS (Ubuntu), PM2
- **LLM Providers:** Anthropic, OpenAI, OpenRouter, Mistral, Groq, Google

## Key Directories

```
frontend/src/app/(app)/     → App pages (agents, dashboard, settings)
frontend/src/lib/api/       → API client & types
api/                        → Express route handlers
app/custom/api/             → Custom API extensions
seeds/                      → Agent templates & skills seed data
tests/                      → E2E tests
```

## Development Commands

```bash
cd frontend && pnpm dev     # Frontend dev server (port 3000)
cd api && pnpm dev          # API dev server
pnpm test                   # Run tests
```

## Coding Conventions

- Use TypeScript strict mode in frontend
- API responses follow `{ success: boolean, data?: T, error?: string }`
- Database queries use raw SQL via Supabase client (no ORM)
- Components use shadcn/ui primitives
- Communication language: French (with user), English (in code)

---

## Snipara Workflow (OBLIGATOIRE pour toute session de dev)

### Quand utiliser Snipara

Snipara MCP est configuré sur ce projet (`snipara-vutler`). Utilise-le systématiquement :

| Besoin | Outil Snipara | Pourquoi |
|--------|---------------|----------|
| Comprendre le contexte d'une feature | `rlm_context_query` | Récupère les docs pertinentes indexées |
| Chercher un pattern dans les docs | `rlm_search` | Regex sur docs indexées |
| Récupérer les standards de l'équipe | `rlm_shared_context` | Conventions, best practices |
| Reprendre le travail d'une session précédente | `rlm_recall` | Mémoire sémantique |
| Sauvegarder une décision/apprentissage | `rlm_remember` | Persiste entre sessions |

### Mode LITE vs FULL

**LITE (90% des tâches)** — bug fixes, petites features, modifications < 5 fichiers :
```
rlm_context_query(task, 4000) → Read → Edit → test
```

**FULL (features complexes)** — multi-session, 5+ fichiers, décisions d'architecture :
```
Phase 1: rlm_shared_context() → rlm_recall() → rlm_context_query(8000)
Phase 2: rlm_plan() → rlm_decompose() → rlm_remember(decision)
Phase 3: Per-chunk: Query → Code → Test
Phase 4: rlm_remember(learning) → rlm_remember(context)
```

### Continuité de session

```python
# Début de session
rlm_recall("feature en cours")
rlm_context_query("feature context")

# Fin de session (TOUJOURS faire avant de quitter)
rlm_remember(type="context", content="Fait: X, Prochain: Y, Bloquant: Z")
```

### Règle d'or

- **Snipara pour lire/comprendre** (context, recall, search) → jamais d'écriture
- **Claude Code pour écrire** (Edit, Write, Bash) → toujours local
- Ne jamais dupliquer : si Snipara a la réponse, ne pas re-chercher avec Grep/Glob
