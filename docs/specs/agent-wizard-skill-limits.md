# Tech Spec: Agent Creation Wizard + Skill Limits

## Objectif

Transformer le flow de création d'agent en un wizard en 2 étapes :
1. Choisir le **type d'agent** (sales, marketing, ops, etc.)
2. Voir les **skills filtrés et recommandés** pour ce type, avec une **limite de 8 skills max**

En parallèle : nettoyer la marketplace pour en faire une galerie de templates curatés.

---

## Scope

### In Scope
- Wizard type → skills filtrés dans `/agents/new/page.tsx`
- Limite 8 skills max avec UX progressive (barre, messages)
- Skills recommandés par type d'agent (pré-cochés)
- Nettoyage marketplace : supprimer pricing paid, publish user, reviews
- Appliquer la limite de skills aussi dans `/agents/[id]/config/page.tsx`

### Out of Scope
- Refonte complète de la marketplace
- Nouveaux skills
- Modifications du backend agent execution

---

## Design

### Étape 1 — Type Selector (nouveau dans `/agents/new/page.tsx`)

Après Identity (name, role, avatar), ajouter une section **"Agent Type"** :

```
┌─────────────────────────────────────────────┐
│  What type of agent?                         │
│                                              │
│  🎯 Sales         📣 Marketing              │
│  ⚙️ Operations     💻 Technical              │
│  🤝 Support       📊 Analytics              │
│  💰 Finance       📝 Content                │
│  🔒 Security      🔧 DevOps                 │
│  🌐 Networking    📡 IoT                    │
│  💾 Data          🧪 QA                     │
│  ⚖️ Legal         🏠 Real Estate            │
│  🏥 Healthcare    🎨 Design                 │
│  🔄 Integration   📦 Other                  │
└─────────────────────────────────────────────┘
```

Catégories dérivées directement de `agent-skills.json` (champ `category`).

### Étape 2 — Skills filtrés + recommandés

Quand un type est sélectionné :
1. **Filtrer** les skills par catégorie correspondante
2. **Recommander** 3-5 skills en les pré-cochant (basé sur les templates existants)
3. Afficher les skills des **autres catégories** en section "Other skills"
4. Bouton "Show all skills" pour les power users

### Limite de Skills

```
Skills (3/5 recommandés · max 8)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■■■□□□□□  3/8                     ← vert
■■■■■■□□  6/8                     ← orange
■■■■■■■■  8/8 Limit reached       ← rouge, checkboxes disabled
```

Messages contextuels :
- 0-3 : rien
- 4-5 : "Good focus"
- 6-7 : "Consider keeping your agent focused for best performance"
- 8 : "Maximum reached — remove a skill to add another"

### Mapping type → skills recommandés

Dérivé de `seeds/agent-templates.json` :

```json
{
  "sales": ["lead_scoring", "crm_sync", "email_outreach", "pipeline_management"],
  "marketing": ["content_scheduling", "social_analytics", "campaign_planning", "keyword_research"],
  "operations": ["task_management", "timeline_tracking", "resource_allocation", "status_reporting"],
  "finance": ["invoice_processing", "expense_tracking", "financial_reporting", "bookkeeping"],
  "technical": ["data_analysis", "report_generation", "equipment_diagnostics"],
  "support": ["ticket_triage", "ticket_resolution", "satisfaction_tracking"],
  "content": ["article_creation", "faq_management", "search_optimization"],
  "analytics": ["sentiment_analysis", "theme_extraction", "insight_reporting"],
  "security": ["vulnerability_scanning", "incident_response", "security_audit"],
  "devops": ["cicd_automation", "infrastructure_as_code", "monitoring_alerting"],
  "legal": ["contract_review", "compliance_assessment", "policy_drafting"],
  "data": ["etl_pipelines", "data_quality", "schema_management"],
  "qa": ["test_automation", "bug_tracking", "regression_testing"],
  "integration": ["crm_sync"]
}
```

---

## Fichiers à modifier

### Frontend

| Fichier | Changement |
|---------|------------|
| `frontend/src/app/(app)/agents/new/page.tsx` | Ajouter type selector + skills section avec limite |
| `frontend/src/app/(app)/agents/[id]/config/page.tsx` | Appliquer limite 8 skills dans `SkillsSection` |
| `frontend/src/lib/api/types.ts` | Ajouter `AgentType` type |

### Seeds / Data

| Fichier | Changement |
|---------|------------|
| `seeds/agent-skills.json` | Aucun changement (les catégories existent déjà) |
| Nouveau: `frontend/src/lib/agent-types.ts` | Mapping type → recommended skills + metadata |

### Marketplace cleanup (séparé)

| Fichier | Changement |
|---------|------------|
| `frontend/src/app/(app)/agents/[id]/publish/page.tsx` | Supprimé |
| `api/marketplace.js` | Supprimé |
| `frontend/src/app/(app)/agents/[id]/layout.tsx` | Retirer tab "Publish" |

---

## Chunks d'implémentation

### Chunk 1 — Agent type data + recommended skills mapping
- Créer `frontend/src/lib/agent-types.ts` avec les types, icônes, et skills recommandés
- Extraire les catégories uniques de `agent-skills.json`

### Chunk 2 — Skills limit dans config page (existante)
- Modifier `SkillsSection` dans `config/page.tsx` pour :
  - Hard limit 8 skills
  - Barre de progression visuelle
  - Messages contextuels
  - Désactiver les checkboxes quand limite atteinte

### Chunk 3 — Agent type selector dans creation page
- Ajouter la section type selector dans `new/page.tsx`
- Stocker le type sélectionné dans le form state
- Passer le type au payload de création

### Chunk 4 — Skills section dans creation page
- Ajouter la skills section filtrée dans `new/page.tsx`
- Pré-cocher les skills recommandés quand un type est sélectionné
- Réutiliser la logique de limite du chunk 2

### Chunk 5 — Marketplace cleanup
- Masquer le tab "Publish" dans le layout agent
- Supprimer `pricing: 'paid'` du flow
- Garder les templates curatés (seeds) en lecture seule

---

## Validation

- [ ] Un nouveau user peut créer un agent en choisissant d'abord un type
- [ ] Les skills sont filtrés par type sélectionné
- [ ] Les skills recommandés sont pré-cochés
- [ ] Impossible de sélectionner plus de 8 skills
- [ ] La barre de progression change de couleur
- [ ] La page config existante respecte aussi la limite de 8
- [ ] Le tab "Publish" n'est plus visible
- [ ] Les templates marketplace restent accessibles en lecture
