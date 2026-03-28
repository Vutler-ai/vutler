# Vutler — Shared Context (Snipara)

> Ce document est le shared context Snipara pour toutes les sessions de dev sur Vutler.
> Il est chargé automatiquement via `rlm_shared_context()`.

---

## Architecture

### Frontend (Next.js 14 App Router)
- Pages dans `frontend/src/app/(app)/`
- API client dans `frontend/src/lib/api/endpoints/`
- Types partagés dans `frontend/src/lib/api/types.ts`
- Composants UI : shadcn/ui + Tailwind CSS
- State : React hooks, pas de Redux/Zustand

### Backend (Express.js)
- Routes dans `api/` (standard) et `app/custom/api/` (extensions)
- Auth via middleware Supabase (`requireAuth`)
- Réponses : `{ success: boolean, data?, error? }`
- Pas d'ORM — SQL brut via Supabase client

### Database (Supabase PostgreSQL)
- Schema : `tenant_vutler`
- Tables clés : `agents`, `agent_configs`, `workspaces`, `marketplace_templates`
- RLS activé sur les tables publiques

---

## Conventions de Code

### TypeScript (Frontend)
- Strict mode obligatoire
- Interfaces > types pour les objets
- Pas de `any` — utiliser `unknown` si nécessaire
- Nommer les composants en PascalCase, les hooks en camelCase avec `use` prefix

### API (Backend)
- Routes RESTful : `GET /api/v1/{resource}`, `POST /api/v1/{resource}`
- Validation des inputs côté serveur (jamais faire confiance au client)
- Toujours vérifier `workspace_id` dans les queries (isolation multi-tenant)
- Audit log pour les actions sensibles

### SQL
- Toujours qualifier les colonnes avec le nom de table en cas de JOIN
- Utiliser des paramètres préparés ($1, $2) — jamais de string interpolation
- Indexes sur les colonnes de filtre fréquent

---

## Patterns Importants

### Multi-tenant
Chaque requête est scopée au `workspace_id` du user connecté. Ne jamais exposer les données d'un workspace à un autre.

### Agent System
- Un agent a : name, role, model, provider, system_prompt, skills, capabilities
- Le `coordinator` est un agent système protégé (ne pas modifier/supprimer)
- Skills max par agent : 8 (recommandé : 3-5 pour performance optimale)
- Types d'agent : coordinator (système), bot (standard)

### Marketplace → Agent Gallery
- Pas de pricing payant — les templates sont gratuits uniquement
- Pas de publication user-to-user — templates curatés par Vutler seulement
- Seeds dans `seeds/agent-templates.json` et `seeds/agent-skills.json`

---

## Règles de Dev

1. **Ne pas sur-engineer** — faire le minimum nécessaire
2. **Tester avant de commit** — `pnpm test` doit passer
3. **Pas de secrets en dur** — utiliser les variables d'environnement
4. **Français avec le user, anglais dans le code**
5. **Limiter les skills par agent** — 3-5 recommandé, 8 max
6. **Pas de mocks DB dans les tests** — tester contre la vraie base
