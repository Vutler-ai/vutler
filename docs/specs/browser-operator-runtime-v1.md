# Browser Operator Runtime V1

> **Status:** Draft — 2026-04-01
> **Type:** Technical Spec
> **Owner:** Codex
> **Scope:** Cloud runtime, governed enterprise runtime, Nexus-local browser execution

---

## 1. Purpose

Cette spec transforme le `Browser Operator / Synthetic User Agent` en systeme implementable.

Elle decrit:
- les runtimes d'execution
- les contrats d'execution browser
- le modele de session et credentials
- la collecte de preuves
- la gouvernance
- les differences entre cloud et nexus-local

---

## 2. Product Model

Le produit logique est unique:
- `Browser Operator`

Mais il peut tourner sur plusieurs runtimes:
- `cloud-browser`
- `enterprise-browser`
- `nexus-browser`

Le catalogue d'actions doit rester commun.

---

## 3. Runtime Modes

### 3.1 `cloud-browser`

Usage:
- apps publiques
- signup/login classiques
- UX review
- QA

Execution:
- navigateur headless dans l'infra Vutler
- sessions isolees par run ou par app

### 3.2 `enterprise-browser`

Usage:
- apps sensibles
- workflows bornes
- controle plus strict

Execution:
- soit cloud durci
- soit runner dedie plus cloisonne

### 3.3 `nexus-browser`

Usage:
- apps internes
- intranet
- apps privees du client

Execution:
- navigateur lance localement via Nexus
- reseau du client
- accessibilite reseau locale

---

## 4. Core Runtime Components

V1 doit comporter:

1. **Planner**
- transforme une demande en etapes browser bornees

2. **Browser Session Manager**
- cree, isole, ferme et recycle les sessions

3. **Credential Resolver**
- injecte des credentials ou secrets sans les exposer au prompt

4. **Action Executor**
- execute les actions du catalogue

5. **Evidence Collector**
- screenshots
- DOM snapshots
- logs
- traces
- timings

6. **Governance Layer**
- domain allowlist
- action allowlist
- approvals / scopes
- audit

7. **Reporter**
- produit un rapport lisible humain + JSON structure

---

## 5. Execution Contract

Une execution browser V1 doit ressembler a ceci:

```json
{
  "run_id": "uuid",
  "runtime_mode": "cloud-browser",
  "profile": "synthetic_user_qa",
  "target": {
    "app_key": "client_portal",
    "base_url": "https://app.example.com"
  },
  "credentials_ref": "vault://workspace/client_portal/test_user",
  "flow": {
    "flow_key": "signup_onboarding_v1"
  },
  "governance": {
    "mode": "standard",
    "approval_scope_key": "client-portal-onboarding-nightly"
  }
}
```

---

## 6. Browser Session Model

Chaque run doit pouvoir choisir:

### `ephemeral_session`

- session jetable
- pas de persistance cookies/localStorage
- ideal pour la plupart des tests

### `named_session`

- session persistee par app / user / workspace
- utile pour certains tests repetes

### `isolated_profile`

- contexte navigateur strictement separe
- requis pour enterprise et nexus-local

V1 recommande:
- `ephemeral_session` par defaut
- `named_session` uniquement si explicite

---

## 7. Credential Model

Les credentials ne doivent jamais etre places dans:
- le prompt
- les logs
- les rapports bruts

Le runtime doit supporter:

### 7.1 `credentials_ref`

Reference logique vers un vault:

```json
{
  "credentials_ref": "vault://workspace/client_portal/test_user"
}
```

### 7.2 Supported Secret Types

- login/password
- magic link mailbox
- OTP seed ou fetcher borne
- session cookie pre-provisionne
- API token pour bootstrap secondaire si necessaire

### 7.3 Redaction Rules

Toujours masquer:
- mots de passe
- tokens
- cookies
- OTP
- liens magiques non consommes

---

## 8. Domain Governance

V1 doit imposer:

- `allowed_domains`
- `blocked_domains`
- `allowed_origins`
- `max_redirect_depth`

Regle:
- tout domaine non allowliste est bloque par defaut dans les modes gouvernes

Cloud V1 peut etre plus permissif si le user travaille sur une app publique explicite.

Enterprise / Nexus V1 doit etre plus strict.

---

## 9. Evidence Pack

Chaque run doit produire un `evidence pack`.

Contenu minimal:
- `summary.json`
- `steps.json`
- `screenshots/`
- `dom_snapshots/`
- `console_logs.json`
- `network_summary.json`
- `final_report.md`

Champs minimaux:

```json
{
  "run_id": "uuid",
  "status": "passed | failed | partial",
  "steps_total": 12,
  "assertions_passed": 10,
  "assertions_failed": 2,
  "screenshots_count": 8,
  "started_at": "iso",
  "completed_at": "iso"
}
```

---

## 10. Browser Flow Model

Un flow V1 est une suite d'etapes bornees:

```json
{
  "flow_key": "signup_onboarding_v1",
  "steps": [
    { "action": "browser.open", "args": { "url": "https://app.example.com/signup" } },
    { "action": "browser.fill", "args": { "selector": "[name=email]", "value_ref": "generated_email" } },
    { "action": "browser.fill", "args": { "selector": "[name=password]", "secret_ref": "credentials.password" } },
    { "action": "browser.click", "args": { "selector": "button[type=submit]" } },
    { "action": "browser.assert_text", "args": { "text": "Welcome" } }
  ]
}
```

Le planner LLM peut:
- choisir un flow
- adapter certains parametres

Mais il ne doit pas produire des primitives arbitraires hors catalogue.

---

## 11. Governance Modes

Le Browser Operator reutilise les memes modes que Nexus enterprise:

- `allow`
- `dry_run`
- `approval_required`
- `deny`

Et ajoute:
- `process-scoped approval`
- `full_access`

### `full_access`

Peut contourner une demande `approval_required`.

Ne peut pas contourner:
- un `deny`
- un domaine non allowliste
- une action hors catalogue

---

## 12. Cloud vs Nexus Differences

### Cloud Runtime

Doit gerer:
- browser pool
- session isolation
- mailbox test si necessaire
- stockage preuves

### Nexus Runtime

Doit gerer:
- executable navigateur local
- sandbox locale
- restrictions domaine/reseau
- egress controls
- stockage preuves local ou upload Vutler

### Shared Layer

Commun aux deux:
- action catalog
- evidence pack schema
- audit schema
- flow schema
- governance schema

---

## 13. Suggested Implementation Shape

### Backend / Services

- `services/browserOperator/flowPlanner.js`
- `services/browserOperator/sessionManager.js`
- `services/browserOperator/credentialResolver.js`
- `services/browserOperator/evidenceCollector.js`
- `services/browserOperator/reportBuilder.js`

### API

- `api/browser-operator.js`

### Nexus Runtime

- `packages/nexus/lib/browser-runtime.js`
- `packages/nexus/lib/browser-governance.js`

### Seeds

- `seeds/browser-operator/flows/`
- `seeds/browser-operator/profiles/`
- `seeds/browser-operator/policies/`

---

## 14. MVP Scope

V1 devrait supporter:

- open page
- login
- signup
- fill form
- click
- assert text / element
- capture screenshot
- generate report

Pas encore:
- payments
- destructive admin actions
- broad multi-tab orchestration
- arbitrary extension marketplaces

---

## 15. Definition of Done

V1 est bonne si:

- un run cloud peut ouvrir une app, login et produire un report
- un run cloud peut simuler un onboarding simple
- un run enterprise peut etre gouverne par domain allowlist + approval
- un run nexus-local peut faire la meme chose sur une app interne
- les preuves sont exportables
- les credentials restent hors prompt et hors logs
