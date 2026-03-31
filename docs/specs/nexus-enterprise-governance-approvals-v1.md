# Nexus Enterprise Governance + Approvals V1

> **Status:** Implemented V1 — 2026-03-31
> **Type:** Technical Spec
> **Owner:** Codex
> **Scope:** Runtime governance decisions, approval requests, process-scoped grants, audit trail, approval email

---

## 1. Purpose

Cette spec documente la couche de gouvernance enterprise maintenant implementee au-dessus du runtime Nexus.

Elle couvre:
- les modes de gouvernance supportes
- la creation de demandes d'approbation
- les validations reutilisables "une fois par process"
- le bypass explicite `full_access`
- le journal d'audit
- l'email de validation client via le mail Vutler cloud

---

## 2. Goals

V1 doit resoudre trois besoins metier:

1. ne pas demander une validation client a chaque evenement identique
2. garder la possibilite d'une validation humaine quand le risque l'exige
3. permettre un mode explicite de bypass pour un operateur qui choisit un mode "full access"

---

## 3. Governance Modes

### 3.1 `standard`

Mode par defaut.

Le runtime applique la policy enterprise:
- `deny`
- `dry_run`
- `approval_required`
- `allow`

### 3.2 `full_access`

Mode de bypass explicite, demande par l'utilisateur.

Regles V1:
- ne contourne que `approval_required`
- ne contourne pas `deny`
- laisse une trace d'audit explicite `approval_bypassed`

### 3.3 `process scope`

Mode de validation reutilisable.

Principe:
- l'utilisateur approuve une fois un process borne
- les executions suivantes portant le meme `approvalScopeKey` repassent sans nouvelle validation
- la grant reste journalisee, revocable, et peut expirer

Exemple:
- integration avec les interfaces AV d'une liste de salles
- un changement d'etat declenche une action a chaque fois
- le client approuve le process une seule fois

---

## 4. Approval Request Model

Table:
- `tenant_vutler.nexus_enterprise_approval_requests`

Champs importants:
- `request_type`
- `title`
- `summary`
- `governance`
- `request_payload`
- `scope_key`
- `scope_mode`
- `scope_expires_at`
- `status`

Statuts V1:
- `pending`
- `approved`
- `rejected`
- `executed`
- `failed`

---

## 5. Process-Scoped Approval Model

Payload V1:

```json
{
  "approvalScopeKey": "av-interface-sync-geneva",
  "approvalScopeMode": "process",
  "approvalScopeExpiresAt": "2026-04-30T23:59:59.000Z"
}
```

Semantics:
- `approvalScopeKey` identifie le processus approuve
- `approvalScopeMode = process` signifie "grant reusable"
- si une grant active existe deja pour le scope, l'execution passe directement
- un scope peut etre revoque
- un scope peut expirer

---

## 6. Approval Email

Lorsqu'une demande d'approbation est creee, le backend peut envoyer un email via Postal/Vutler cloud mail.

Implementation V1:
- service `services/postalMailer.js`
- resolution des destinataires depuis `workspace_settings`
- fallback possible sur le `workspace owner`

Clés workspace supportees:
- `nexus_approval_email`
- `approval_email`
- `nexus_approval_emails`

---

## 7. Audit Trail

Table:
- `tenant_vutler.nexus_enterprise_audit_log`

Events V1:
- `policy_denied`
- `policy_dry_run`
- `approval_requested`
- `approval_approved`
- `approval_rejected`
- `approval_bypassed`
- `approval_validated`
- `scope_validated`
- `scope_revoked`
- `execution_completed`
- `execution_failed`

---

## 8. API Surface

### Runtime-facing APIs

```text
POST /api/v1/nexus/:nodeId/governance/approvals
GET  /api/v1/nexus/:nodeId/governance/approvals/:approvalId
POST /api/v1/nexus/:nodeId/governance/approvals/:approvalId/runtime-status
POST /api/v1/nexus/:nodeId/governance/audit
GET  /api/v1/nexus/:nodeId/governance/scopes/resolve?scopeKey=...
```

### Client-facing APIs

```text
GET  /api/v1/nexus/nodes/:nodeId/governance/approvals
GET  /api/v1/nexus/nodes/:nodeId/governance/scopes
GET  /api/v1/nexus/nodes/:nodeId/governance/audit
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/approve
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/reject
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/revoke-scope
```

---

## 9. Frontend Contract

Le frontend a maintenant les types/payloads pour:
- dispatch enterprise action
- dispatch local integration
- dispatch helper
- lire approvals, scopes et audit
- approuver ou rejeter

Le modal futur doit permettre:
- `standard`
- `full_access`
- `single approval`
- `process approval`
- option d'expiration du scope

---

## 10. Current V1 Limits

- l'email contient un lien Vutler mais pas encore de bouton approve/reject "one click"
- le requeue automatique apres approve est best-effort
- si le backend n'a pas les droits SQL sur `nexus_commands`, l'approval reste valide mais la reprise doit etre relancee manuellement
- le UI complet approvals/scopes n'est pas encore branche dans la page node
