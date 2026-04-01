# Nexus Enterprise Self-Provisioning Policy V1

> **Status:** Draft - 2026-04-01
> **Type:** Product + Security + Runtime Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, deployable agents, helper agents, local integrations, webhooks, browser flows

---

## 1. Purpose

Cette spec fixe la frontiere entre:
- l'autonomie utile d'un agent enterprise
- et la derive "tool libre" type `openclaw`

Le principe V1 est simple:

- **self-provisioning de configuration bornee**: oui
- **self-provisioning d'execution arbitraire**: non

Un agent peut donc proposer, enregistrer ou activer certaines briques si:
- elles appartiennent a un catalogue connu
- elles passent par policy
- elles sont auditees
- elles respectent la gouvernance client

---

## 2. Goals

### In Scope

- definir ce qu'un agent peut auto-provisionner
- definir les niveaux de self-provisioning
- definir les garde-fous de policy
- definir les liens avec approvals, seats et audit

### Out of Scope

- installation libre de binaires
- package manager arbitraire
- shell libre auto-ouvert par l'agent
- creation libre de secrets non approuves

---

## 3. Core Decision

Un agent enterprise ne peut jamais:
- installer un outil arbitraire
- brancher une API inconnue hors allowlist
- creer un helper hors catalogue
- ouvrir une permission systeme hors policy

Un agent enterprise peut, selon son niveau et sa policy:
- demander un nouveau webhook
- enregistrer une integration locale bornee
- creer un browser flow borne
- demander un helper agent catalogue
- activer une configuration approuvee une fois pour un process donne

---

## 4. Self-Provisioning Levels

## 4.1 Level 0 - Disabled

L'agent ne peut rien auto-provisionner.

Il peut seulement:
- utiliser les tools deja autorises
- demander a un operateur humain d'ajouter quelque chose

Usage:
- agents privilegies
- clients ultra-regules

## 4.2 Level 1 - Suggested

L'agent peut proposer:
- webhook
- integration locale
- helper
- browser flow

Mais ne peut rien creer lui-meme.

Chaque demande passe par:
- validation utilisateur
- ou admin client

## 4.3 Level 2 - Guided

Mode recommande par defaut.

L'agent peut auto-provisionner seulement dans des families autorisees et bornees, par exemple:
- enregistrer un webhook entrant sur une source allowlistee
- creer une integration locale HTTP vers un host allowliste
- creer un browser flow sur un domaine allowliste
- demander un helper profile deja catalogue si un seat est libre

Chaque creation passe par:
- policy engine
- approvals si necessaire
- audit

## 4.4 Level 3 - Full Self-Provisioning

Mode exceptionnel.

Reserve a:
- environnements cloud sandboxes
- clients tres matures
- bacs a sable internes

Jamais par defaut en `nexus-enterprise`.

---

## 5. Provisionable Object Types

V1 autorise uniquement des objets de configuration connus.

### 5.1 Webhook Source

Objet:
- `source_key`
- `provider_family`
- `auth_mode`
- `secret_ref`
- `event_mapping_profile`

Exemples:
- AV monitoring webhook
- ITSM incident webhook
- internal app status webhook

### 5.2 Local Integration Registration

Objet:
- `integration_key`
- `transport`
- `base_url`
- `allowed_operations`
- `allowed_hosts`
- `credential_ref`

V1:
- seulement integrations bornees
- pas d'API inconnue libre

### 5.3 Helper Agent Request

Objet:
- `helper_profile_key`
- `reason`
- `seat_mode`
- `scope`

Contrainte:
- helper profile doit exister dans le registry
- helper rule doit l'autoriser
- un seat doit etre disponible

### 5.4 Browser Flow Registration

Objet:
- `flow_key`
- `profile_key`
- `allowed_domains`
- `steps`
- `credential_ref`
- `mailbox_mode`

Contrainte:
- action catalog browser borne
- domaines allowlistes
- credentials vaultes

### 5.5 Process Grant Request

Objet:
- `approvalScopeKey`
- `approvalScopeMode`
- `expires_at`

Usage:
- "autoriser ce process une fois"
- eviter de revalider chaque evenement identique

---

## 6. Forbidden Self-Provisioning

V1 interdit explicitement:

- installation de binaire arbitraire
- `npm install`, `brew install`, `apt install` libres
- ouverture de shell libre
- creation d'un secret brut dans le prompt
- ajout d'un host hors allowlist
- ajout d'un domaine browser hors allowlist
- creation d'un helper profile hors catalogue
- elevation implicite de permissions
- bypass des decisions `deny`

---

## 7. Governance Model

Tout self-provisioning est evalue comme une demande governable.

Decision V1:
- `deny`
- `log_only`
- `dry_run`
- `approval_required`
- `allow`

Le mode `full_access`:
- peut bypass `approval_required`
- ne bypass jamais `deny`

---

## 8. Policy Dimensions

La policy peut matcher sur:

- `agent_level`
- `profile_key`
- `request_type`
- `object_type`
- `tool_class`
- `provider_family`
- `host`
- `domain`
- `seat_impact`
- `credential_scope`

---

## 9. Seat Rules

### Does not consume a seat

- creation d'un webhook
- enregistrement d'une integration locale
- creation d'un browser flow
- creation d'un process grant

### Consumes a seat

- creation / activation d'un helper agent
- auto-spawn d'un helper agent

Rappel:
- `local integration` = extension technique de l'agent courant
- `helper agent` = nouvelle capacite facturable

---

## 10. Approval Rules

### Approval recommended

- nouveau webhook entrant
- nouvelle integration locale
- nouveau browser flow authentifie
- helper agent demande pour la premiere fois

### Process approval recommended

- meme workflow rejoue souvent
- meme salle, meme parc, meme app, meme integration

Exemples:
- monitorer une liste de salles AV
- rejouer un workflow browser nightly
- recreer le meme ticket/runbook sur meme source

---

## 11. Audit Requirements

Chaque self-provisioning doit produire un audit event.

Events V1:
- `self_provision_requested`
- `self_provision_denied`
- `self_provision_dry_run`
- `self_provision_approved`
- `self_provision_bypassed`
- `self_provision_applied`
- `self_provision_failed`
- `self_provision_revoked`

Payload minimal:
- `profile_key`
- `request_type`
- `object_type`
- `object_key`
- `governance_mode`
- `approval_id`
- `scope_key`
- `seat_impact`

---

## 12. Recommended Defaults By Agent Level

### Level 1 Administrative

- webhooks: `approval_required`
- local integrations: `approval_required`
- helper agents: `approval_required`
- browser flows: `allow` ou `approval_required` selon domaine

### Level 2 Operational

- webhooks: `approval_required` puis `process grant`
- local integrations: `dry_run` ou `approval_required`
- helper agents: `approval_required`
- browser flows: `approval_required`

### Level 3 Technical Privileged

- webhooks: `approval_required`
- local integrations: `approval_required`
- helper agents: `approval_required`
- privileged additions: `deny` ou `approval_required` strict

Le niveau n'accorde pas de droit automatique.
Il ne fait que fixer le cadre par defaut.

---

## 13. API Shape

V1 peut etre modele avec des routes du type:

```text
POST /api/v1/nexus/:nodeId/self-provision/webhooks
POST /api/v1/nexus/:nodeId/self-provision/local-integrations
POST /api/v1/nexus/:nodeId/self-provision/helpers
POST /api/v1/nexus/:nodeId/self-provision/browser-flows
POST /api/v1/nexus/:nodeId/self-provision/process-grants
GET  /api/v1/nexus/nodes/:nodeId/self-provision/events
POST /api/v1/nexus/nodes/:nodeId/self-provision/:eventId/revoke
```

Chaque route cree:
- une evaluation policy
- un audit event
- si besoin une approval request

---

## 14. Product Positioning Rule

Le produit ne doit jamais presenter cela comme:
- "l'agent s'installe librement des tools"

Le bon framing est:
- "l'agent peut configurer des integrations bornees dans un cadre gouverne"

Donc:
- pas `tool self-install`
- oui `guided self-provisioning`

---

## 15. Recommended MVP

V1 devrait supporter seulement:

1. `webhook source registration`
2. `bounded local integration registration`
3. `helper agent request`
4. `browser flow registration`
5. `process grant reuse`

Et rien de plus.

---

## 16. Recommended Next Chunk

### Chunk I - Self-Provisioning Registry + Policy Hooks

Contenu:
- registry des objets provisionnes
- policy evaluation par object type
- audit trail
- approval wiring

### Chunk J - Webhooks + Local Integrations

Contenu:
- auto-registration gouvernee de webhook sources
- auto-registration gouvernee de local integrations

### Chunk K - Helper + Browser Provisioning

Contenu:
- request helper profile via seat accounting
- browser flow registration sous allowlist

