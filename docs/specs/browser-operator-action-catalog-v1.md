# Browser Operator Action Catalog V1

> **Status:** Draft — 2026-04-01
> **Type:** Technical Spec
> **Owner:** Codex
> **Scope:** Bounded browser actions for cloud, enterprise, and Nexus-local execution

---

## 1. Purpose

Cette spec definit le premier catalogue d'actions pour le `Browser Operator`.

Objectif:
- eviter un navigateur libre pilote par prompt
- imposer un set d'actions bornees
- pouvoir gouverner, auditer et rejouer les runs

---

## 2. Principles

- toutes les actions appartiennent au catalogue
- chaque action a un `risk_level`
- chaque action a un `default_mode`
- chaque action produit des preuves
- certaines actions exigent credentials ou approvals

---

## 3. Risk Levels

| Level | Meaning | Typical default |
|------|---------|-----------------|
| `low` | lecture ou interaction sans effet fort | `allow` |
| `medium` | mutation bornee ou session auth | `allow` ou `dry_run` |
| `high` | creation, submit, onboarding, actions a effet metier | `dry_run` ou `approval_required` |
| `critical` | admin, security, destructive | `approval_required` ou `deny` |

---

## 4. Core Read Actions

### `browser.open`

- risk: `low`
- default_mode: `allow`

Usage:
- ouvrir une page
- attendre le chargement initial

### `browser.wait_for`

- risk: `low`
- default_mode: `allow`

Usage:
- attendre un element, un texte, un etat

### `browser.assert_text`

- risk: `low`
- default_mode: `allow`

Usage:
- verifier qu'un texte apparait ou non

### `browser.assert_element`

- risk: `low`
- default_mode: `allow`

Usage:
- verifier presence/absence/etat d'un selecteur

### `browser.capture_screenshot`

- risk: `low`
- default_mode: `allow`

Usage:
- preuve visuelle

### `browser.capture_dom_snapshot`

- risk: `low`
- default_mode: `allow`

Usage:
- preuve structurelle

---

## 5. Navigation Actions

### `browser.click`

- risk: `medium`
- default_mode: `allow`

Usage:
- cliquer un bouton, lien ou element interactif

Guardrails:
- selecteur cible obligatoire
- max click retries borne

### `browser.type`

- risk: `medium`
- default_mode: `allow`

Usage:
- saisir du texte libre non secret

### `browser.fill`

- risk: `medium`
- default_mode: `allow`

Usage:
- remplir un champ formulaire

Guardrails:
- support de `value_ref` et `secret_ref`
- valeurs sensibles masquees

### `browser.select`

- risk: `medium`
- default_mode: `allow`

Usage:
- selection dans dropdown / radio / checkbox

---

## 6. Auth Actions

### `browser.signup`

- risk: `high`
- default_mode: `approval_required` en mode enterprise, `allow` possible en cloud selon contexte

Usage:
- creer un compte de test ou synthetic user

Guardrails:
- domaine allowliste
- identité de test / mailbox de test
- aucune creation massive

### `browser.login`

- risk: `medium`
- default_mode: `allow`

Usage:
- authentifier une session

Guardrails:
- credentials via vault uniquement
- aucune emission du secret dans logs/rapport

### `browser.logout`

- risk: `low`
- default_mode: `allow`

### `browser.consume_magic_link`

- risk: `high`
- default_mode: `approval_required` en mode gouverne si domaine/mail sensible

### `browser.consume_reset_password`

- risk: `high`
- default_mode: `approval_required`

---

## 7. Workflow Actions

### `browser.submit_form`

- risk: `high`
- default_mode: `approval_required`

Usage:
- soumettre un formulaire avec effet metier

### `browser.complete_onboarding`

- risk: `high`
- default_mode: `approval_required` ou `allow` si process scope approuve

Usage:
- executer un onboarding borne

### `browser.run_flow`

- risk: inherited
- default_mode: inherited

Usage:
- executer une suite d'etapes seedee

Guardrails:
- flow connu uniquement
- pas de flow arbitraire

### `browser.execute_synthetic_journey`

- risk: inherited
- default_mode: inherited

Usage:
- rejouer un parcours utilisateur predefini

---

## 8. Extraction and Reporting Actions

### `browser.extract_structured_data`

- risk: `low`
- default_mode: `allow`

Usage:
- extraire tableaux, labels, messages, KPI

### `browser.generate_report`

- risk: `low`
- default_mode: `allow`

Usage:
- produire un rapport markdown / JSON

### `browser.export_evidence_pack`

- risk: `low`
- default_mode: `allow`

Usage:
- exporter screenshots, assertions, logs

---

## 9. Governed Enterprise Actions

### `browser.run_governed_internal_flow`

- risk: `high`
- default_mode: `approval_required`

Usage:
- flow borne sur app interne

### `browser.run_process_scoped_flow`

- risk: `high`
- default_mode: `approval_required`

Usage:
- flow repetitif valide une fois

Contract:

```json
{
  "approvalScopeKey": "hr-portal-login-healthcheck",
  "approvalScopeMode": "process"
}
```

### `browser.run_privileged_console_check`

- risk: `critical`
- default_mode: `deny` ou `approval_required`

Usage:
- controles admin tres bornes

---

## 10. Forbidden by Default

V1 doit bloquer par defaut:

- checkout / paiement reel
- deletion destructive
- changement MFA / security
- modification broad admin
- upload de secrets arbitraires
- navigation vers domaines non allowlistes en mode gouverne

---

## 11. Action Schema Shape

Chaque action doit definir:

```json
{
  "action_key": "browser.login",
  "category": "authentication",
  "risk_level": "medium",
  "default_mode": "allow",
  "requires_auth_context": true,
  "allowed_runtimes": ["cloud-browser", "enterprise-browser", "nexus-browser"],
  "evidence": ["screenshot", "dom_snapshot", "timing"],
  "guardrails": {
    "allowed_domains_only": true,
    "redact_secrets": true
  }
}
```

---

## 12. MVP Catalog Recommendation

Le premier catalogue utile est:

- `browser.open`
- `browser.wait_for`
- `browser.click`
- `browser.fill`
- `browser.assert_text`
- `browser.capture_screenshot`
- `browser.login`
- `browser.signup`
- `browser.submit_form`
- `browser.run_flow`
- `browser.generate_report`
- `browser.export_evidence_pack`

Cela suffit pour:
- app review
- signup/login
- onboarding
- rapport UX/bugs
- synthetic user de base
