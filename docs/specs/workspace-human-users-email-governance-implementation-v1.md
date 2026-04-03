# Workspace Human Users + Email Governance Implementation V1

> **Status:** Planned
> **Type:** Technical Spec
> **Owner:** Codex
> **Scope:** Multi-human workspace model, human email provisioning, mailbox permissions, approval workflow, smart approval rollout

---

## 1. Purpose

Cette spec rassemble dans un seul document le plan d'implementation pour faire evoluer Vutler depuis:

- un mode essentiellement mono-utilisateur humain par workspace
- une couche email pilotee surtout par le plan du workspace
- une approbation humaine presente mais encore partielle

vers un modele complet avec:

- plusieurs humains par workspace
- une vraie notion de membre workspace
- des identites email humaines et partagees
- des droits mailbox separes des entitlements de plan
- un workflow d'approbation e-mail gouverne et evolutif
- des regles de smart approval explicites

Ce document doit permettre de reprendre le chantier plus tard sans repartir d'un audit oral ou d'un contexte de conversation.

Note:

- le bug de securite "cross-workspace email assignment accepts foreign agents" a deja ete corrige dans le code actuel
- il ne fait pas partie du plan restant documente ici

---

## 2. Current State Snapshot

### 2.1 Auth and workspace membership

Etat actuel observe:

- `tenant_vutler.users_auth` porte encore l'authentification et une partie des informations de rattachement workspace
- `users_auth` contient `role` et `workspace_id`
- `tenant_vutler.workspace_members` existe, mais est surtout amorce a la creation du workspace
- il n'existe pas aujourd'hui de gestion complete des membres humains dans l'UI

Implication:

- l'identite humaine active est encore resolue principalement depuis `users_auth`
- la notion de "member of workspace" n'est pas encore la source de verite metier

### 2.2 Email system

Etat actuel observe:

- les routes email, groupes email et domaines custom existent
- la queue `Pending` et les actions `approve`, `reject`, `regenerate` existent
- `approval_required` et `auto_reply` existent au backend pour les routes et groupes
- les droits mailbox sont surtout gates par le plan workspace, pas par un RBAC humain fin
- les groupes acceptent des `human_email` libres, pas des membres internes de premiere classe

Implication:

- la couche email fonctionne pour un usage simple
- elle n'est pas encore structuree pour un vrai workspace avec plusieurs humains

### 2.3 UI and admin surfaces

Etat actuel observe:

- les settings ne proposent pas d'onglet "Team" ou "Members"
- il n'existe pas de flux natif d'invitation ou de gestion des roles workspace
- les reglages email affichent certains etats, mais ne pilotent pas encore tout le workflow

Implication:

- la dette principale n'est pas seulement email
- elle commence par le modele humain du workspace

---

## 3. Goals

V1 doit resoudre les besoins suivants:

1. permettre plusieurs humains par workspace avec un modele propre de membre, role, statut et permissions
2. separer clairement:
   - authentification globale
   - appartenance workspace
   - entitlements de plan
   - permissions metier
3. permettre le provisionning d'identites email humaines sans melanger login email et sender identity
4. rendre les droits mailbox explicites et auditables
5. rendre la review queue fiable pour un usage quotidien
6. permettre plus tard une reduction de la charge manuelle grace a des regles de smart approval deterministes

---

## 4. Non-Goals

Ce document ne couvre pas:

- le multi-workspace complet par utilisateur en V1 si cela bloque trop la compatibilite
- une marketplace ou federation d'identites externe complexe
- un moteur ML de scoring de risque email
- un support complet multi-tenant cross-workspace pour un meme humain des la premiere tranche

Le focus est:

- un workspace bien gere
- plusieurs humains internes
- une gouvernance email exploitable

---

## 5. Core Decisions

### 5.1 `users_auth` devient la couche d'auth globale

Decision:

- `users_auth` doit etre traite comme table d'authentification et de profil global
- elle ne doit plus etre la source de verite metier pour les droits workspace

Consequence:

- le code d'autorisation metier doit progressivement se baser sur `workspace_members`

### 5.2 `workspace_members` devient la source de verite workspace

Decision:

- toute permission metier liee au workspace doit partir de `workspace_members`

Consequence:

- roles workspace
- statuts d'invitation
- permissions mailbox
- acces aux boites partagees
- scopes d'approbation

doivent etre resolus depuis cette couche

### 5.3 Plan entitlements and human permissions stay separate

Decision:

- un plan dit si la surface existe
- un role humain dit qui peut faire quoi dans cette surface

Consequence:

- `email available on plan` ne veut pas dire `every authenticated human can approve/send/manage`

### 5.4 Human email identities are separate from login email

Decision:

- un humain peut avoir un login email
- et zero, une, ou plusieurs identites email de travail

Consequence:

- il faut une couche de provisionning d'identites email, pas seulement reutiliser `users_auth.email`

### 5.5 Internal humans and external contacts must not be conflated

Decision:

- un membre interne doit etre reference par une entite workspace
- un contact externe peut rester une simple adresse email

Consequence:

- les groupes email doivent distinguer `internal member` et `external recipient`

---

## 6. Target Model

## 6.1 Human actor types

### Workspace owner

- controle total du workspace
- peut gerer billing, membres, providers, agents, email

### Workspace admin

- gere l'operatoire du workspace
- peut gerer membres et permissions selon policy

### Mailbox approver

- peut voir et traiter une queue d'approbation
- ne gere pas forcement domaines ou billing

### Mailbox contributor

- peut contribuer a certaines boites partagees
- peut eventuellement envoyer/repondre sans administrer la configuration globale

### Viewer

- acces lecture seulement sur certains espaces si policy le permet

## 6.2 Suggested role split

Role workspace global:

- `owner`
- `admin`
- `member`
- `viewer`

Permissions metier additives:

- `mailbox_admin`
- `mailbox_approver`
- `mailbox_contributor`
- `mailbox_viewer`
- `agents_admin`
- `providers_admin`
- `billing_admin`
- `workspace_settings_admin`

Recommendation:

- garder les roles workspace simples
- mettre les permissions fines dans une couche separable et extensible

## 6.3 Suggested data model

### A. `users_auth`

Conserve:

- auth
- email de connexion
- mot de passe / oauth
- nom global
- avatar global
- statut global

Peut garder temporairement:

- `workspace_id` comme "primary workspace" de compatibilite

Mais ne doit plus etre la source de verite des autorisations metier.

### B. `workspace_members`

Doit devenir la source de verite membership.

Champs recommandes:

```text
id
workspace_id
user_id
role
status
permissions jsonb
title
department
locale
timezone
phone
invited_by
invited_at
accepted_at
suspended_at
removed_at
last_seen_at
created_at
updated_at
```

`status` recommande:

- `pending`
- `active`
- `suspended`
- `removed`

### C. `workspace_invitations`

Nouvelle table recommandee.

Objectif:

- invitation avant creation de compte ou avant acceptation

Champs recommandes:

```text
id
workspace_id
email
proposed_role
proposed_permissions jsonb
invited_by
token_hash
status
expires_at
accepted_by_user_id
accepted_at
created_at
updated_at
```

### D. `workspace_member_email_identities`

Nouvelle table recommandee.

Objectif:

- separer l'identite email de travail du login

Champs recommandes:

```text
id
workspace_id
workspace_member_id
email_address
identity_type
from_name
signature_text
signature_html
is_default
can_send
can_receive
status
provisioning_source
metadata jsonb
created_at
updated_at
```

`identity_type` recommande:

- `managed_alias`
- `custom_domain_alias`
- `external_connected_mailbox`
- `shared_inbox_only`

### E. `workspace_member_mailbox_scopes`

Nouvelle table recommandee si on veut un modele explicite.

Objectif:

- definir les boites/routes/groupes accessibles a un humain

Champs recommandes:

```text
id
workspace_id
workspace_member_id
scope_type
scope_ref
can_view
can_approve
can_send
can_manage
created_at
updated_at
```

`scope_type` peut etre:

- `workspace`
- `email_group`
- `email_route`
- `agent`
- `identity`

### F. Email groups membership split

Evolution recommandee:

- garder une notion d'external contact
- ajouter une vraie notion de membre workspace interne

Approche possible:

- soit enrichir `email_group_members`
- soit separer `workspace_member_id` et `human_email`

Regle:

- interne = `workspace_member_id`
- externe = `human_email`

---

## 7. Auth and Authorization Contract

## 7.1 Authentication

Reste:

- JWT
- API keys
- OAuth providers existants

## 7.2 Authorization resolution

Le backend doit resoudre les autorisations dans cet ordre:

1. identite authentifiee
2. workspace actif
3. membership actif dans ce workspace
4. role workspace
5. permissions metier
6. scopes de ressource
7. entitlements de plan

Le point critique:

- le plan ne remplace jamais le RBAC humain
- le RBAC humain ne remplace jamais le scope de ressource

## 7.3 Transitional compatibility

Pour eviter une rupture brutale:

- `users_auth.workspace_id` peut rester le workspace principal en V1
- `req.user.role` peut rester expose
- mais les modules metier nouveaux doivent preferer `workspace_members`

---

## 8. Human Email Provisioning Strategy

## 8.1 Principles

- le login email n'est pas automatiquement une identite de travail
- une identite email humaine peut etre provisionnee, retiree, suspendue
- une identite email doit etre liee a un workspace et a un membre workspace

## 8.2 Provisioning modes

### Managed alias

Exemple:

- `prenom.nom@slug.vutler.ai`

Usage:

- simple a provisionner
- bon defaut pour les workspaces sans domaine custom

### Custom domain alias

Exemple:

- `alex@client.com`

Usage:

- disponible si le workspace a un domaine verifie et l'entitlement adequat

### Connected mailbox

Exemple:

- Gmail / Microsoft 365 / IMAP plus tard

Usage:

- utile si l'humain doit envoyer et lire depuis une vraie boite externe

### Shared inbox only

Usage:

- l'humain n'a pas d'adresse personnelle geree
- mais participe a `support@`, `info@`, etc.

## 8.3 Provisioning policy

Recommandation:

- tout humain invite peut exister comme membre
- toutes les offres ne donnent pas automatiquement une identite email personnelle
- un membre peut etre actif sans identite sender
- les identites custom domain doivent rester soumises a entitlement et verification DNS

## 8.4 Identity lifecycle

Statuts recommandes:

- `pending_provisioning`
- `active`
- `suspended`
- `revoked`

---

## 9. Mailbox Governance Model

## 9.1 Distinguish surface availability from mailbox rights

Exemples:

- le workspace peut avoir la feature `email`
- mais seul un sous-ensemble des humains peut voir/gerer/approuver

## 9.2 Minimum mailbox permission model

Permissions recommandees:

- `mailbox_admin`: domaines, routes, groupes, identities, delegation
- `mailbox_approver`: traiter la queue `pending`
- `mailbox_contributor`: repondre depuis certaines boites
- `mailbox_viewer`: lecture seule

## 9.3 Resource scopes

Chaque permission doit pouvoir etre scopee a:

- tout le workspace
- certains groupes email
- certaines routes agent
- certaines identities humaines
- certaines queues pending

## 9.4 Approval audit

Chaque decision humaine doit laisser une trace:

- `approved_by`
- `approved_at`
- `rejected_by`
- `rejected_at`
- `edited_before_send`
- `approval_rule_id` si une regle s'applique

---

## 10. Unified Implementation Phases

## Phase 0: Multi-human workspace foundation

### Goal

Etablir un modele propre pour plusieurs humains dans un workspace.

### Work

- faire de `workspace_members` la source de verite membership
- ajouter invitations et statuts de membres
- definir roles workspace et permissions metier
- ajouter la surface UI "Team" ou "Members"
- preparer la resolution auth -> membership -> permissions

### Output

- plusieurs humains peuvent exister proprement dans un workspace
- les droits ne dependent plus uniquement de `users_auth.role`

### Dependencies

- aucune

### Exit criteria

- un membre peut etre invite, accepter, etre active, suspendu ou retire
- le backend sait resoudre un membership actif et ses permissions

## Phase 1: Human email identities and provisioning

### Goal

Permettre a des humains internes d'avoir des identites email de travail ou des scopes sur des boites partagees.

### Work

- ajouter `workspace_member_email_identities`
- definir le provisionning `managed_alias`, `custom_domain_alias`, `shared_inbox_only`
- separer clairement login email et sender identity
- exposer les identities dans l'admin workspace

### Output

- un humain peut exister sans identite email
- un humain peut avoir une ou plusieurs identites email de travail

### Dependencies

- Phase 0

### Exit criteria

- une identite email humaine peut etre creee, suspendue, retiree, et selectionnee comme sender autorise

## Phase 2: Mailbox RBAC

### Goal

Introduire un vrai RBAC mailbox humain.

### Work

- proteger les endpoints mailbox par permissions humaines
- separer lecture, approbation, contribution et administration
- ne plus confondre entitlement de plan et droit utilisateur

### Output

- un viewer ne peut pas approuver
- un approver ne peut pas administrer les domaines
- un admin mailbox peut gerer la surface email

### Dependencies

- Phase 0
- Phase 1

### Exit criteria

- les endpoints critiques email renvoient `403` aux mauvais profils
- les permissions sont testables et explicites

## Phase 3: Real scopes by group, route, agent, identity

### Goal

Faire respecter "qui voit quoi" et "qui peut agir ou".

### Work

- remplacer les humains libres de groupes par des membres internes quand applicable
- utiliser `workspace_member_id` pour les membres internes de groupes
- introduire les scopes mailbox
- filtrer inbox, pending queue et actions selon scopes

### Output

- un humain ne voit plus tout le workspace par defaut
- les droits de groupe/route/identity deviennent reels

### Dependencies

- Phase 0
- Phase 1
- Phase 2

### Exit criteria

- chaque membre ne voit que ses ressources autorisees
- les groupes distinguent interne et externe

## Phase 4: Route and group workflow controls

### Goal

Rendre les flags email vraiment pilotables et effectifs.

### Work

- exposer `auto_reply` et `approval_required` en UI
- rendre ces flags actifs pour routes et groupes
- definir les priorites de configuration si plusieurs couches existent

### Output

- les groupes et routes respectent les reglages depuis l'UI

### Dependencies

- Phase 2
- Phase 3

### Exit criteria

- un admin peut configurer le workflow d'une route ou d'un groupe sans passer par l'API brute

## Phase 5: Approval UX and audit trail

### Goal

Fiabiliser la review queue humaine.

### Work

- corriger l'edition de draft avant approbation
- tracer les decisions humaines
- exposer l'historique utile dans l'UI
- rendre la queue pending exploitable sur desktop et mobile

### Output

- la review queue devient un vrai espace operatoire

### Dependencies

- Phase 2
- Phase 3
- Phase 4

### Exit criteria

- un draft peut etre edite, approuve, rejete, regenere avec tracabilite complete

## Phase 6: Smart approval rules v1

### Goal

Reduire le volume d'approbation manuelle sans logique opaque.

### Work

- introduire un moteur de regles deterministes
- scopes par groupe, route, agent, sender domain, internal/external, attachments
- decisions `require_approval` ou `auto_send`
- UI d'administration et explication de la regle appliquee

### Output

- certains emails low-risk peuvent sortir automatiquement
- les cas sensibles restent en approbation humaine

### Dependencies

- Phase 4
- Phase 5

### Exit criteria

- la smart approval repose sur des regles lisibles et auditables

## Phase 7: Validation and hardening

### Goal

Eviter les regressions et securiser le rollout.

### Work

- tests API/service/UI
- metriques queue pending
- journaux d'audit
- rollout progressif par feature flag si necessaire

### Output

- comportement stable
- regression risk reduit

### Dependencies

- toutes les phases precedentes au fur et a mesure

### Exit criteria

- les chemins critiques sont couverts par tests et verifies en environnement de preprod

---

## 11. Recommended Order

Ordre recommande:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

Pourquoi:

- sans membership propre, le RBAC email restera fragile
- sans identities humaines, les droits email resteront abstraits
- sans RBAC, la queue pending restera exposee trop largement

---

## 12. Migration Strategy

## 12.1 Compatibility-first

Approche recommandee:

- ajouter les nouvelles tables et colonnes sans casser les champs existants
- conserver temporairement `users_auth.workspace_id`
- resoudre les permissions via membership lorsque disponible
- garder un fallback transitoire pour les workspaces historiques

## 12.2 Group membership migration

Approche recommandee:

- conserver `human_email` pour les externes
- pour les internes, introduire `workspace_member_id`
- migrer progressivement les groupes connus vers des membres internes references

## 12.3 Email identity migration

Approche recommandee:

- ne pas deduire automatiquement qu'un `users_auth.email` est une sender identity
- creer explicitement les identities humaines necessaires

---

## 13. API Surfaces To Add Or Evolve

Exemples de surfaces recommandees:

### Team management

```text
GET    /api/v1/workspace/members
POST   /api/v1/workspace/members/invitations
POST   /api/v1/workspace/members/invitations/:id/resend
POST   /api/v1/workspace/members/invitations/:token/accept
PATCH  /api/v1/workspace/members/:id
POST   /api/v1/workspace/members/:id/suspend
POST   /api/v1/workspace/members/:id/reactivate
DELETE /api/v1/workspace/members/:id
```

### Human email identities

```text
GET    /api/v1/email/member-identities
POST   /api/v1/email/member-identities
PATCH  /api/v1/email/member-identities/:id
POST   /api/v1/email/member-identities/:id/provision
POST   /api/v1/email/member-identities/:id/suspend
DELETE /api/v1/email/member-identities/:id
```

### Mailbox scopes and permissions

```text
GET    /api/v1/email/member-scopes
POST   /api/v1/email/member-scopes
PATCH  /api/v1/email/member-scopes/:id
DELETE /api/v1/email/member-scopes/:id
```

### Smart approval rules

```text
GET    /api/v1/email/approval-rules
POST   /api/v1/email/approval-rules
PATCH  /api/v1/email/approval-rules/:id
DELETE /api/v1/email/approval-rules/:id
```

---

## 14. Frontend Surfaces To Add Or Evolve

### New settings tab

Ajouter un onglet:

- `Team`

Contenu:

- members list
- invitations
- workspace role
- mailbox permissions
- email identities
- mailbox scopes

### Existing email settings

Faire evoluer:

- routes
- groups
- domains
- pending approvals

Pour:

- afficher les vrais droits
- distinguer ressources internes et externes
- exposer les workflows et identities humaines

---

## 15. Test Strategy

Minimum recommande:

### API tests

- invitation lifecycle
- member role updates
- mailbox permission checks
- identity provisioning checks
- pending queue scope filtering
- approve/reject permissions
- route/group workflow flags
- smart approval rule resolution

### Service tests

- auth to membership resolution
- sender identity resolution
- scope evaluation
- approval audit persistence

### UI tests

- members management
- invitation flows
- identity assignment
- pending queue visibility by role
- edit draft
- approval actions

---

## 16. Risks

### Risk 1: Half-migrated auth model

Impact:

- comportements incoherents selon les endpoints

Mitigation:

- documenter clairement les endpoints migres
- centraliser la resolution membership dans un service unique

### Risk 2: Rights remain plan-only

Impact:

- fuite de surface mailbox a tous les humains du workspace

Mitigation:

- introduire le RBAC humain avant les features de confort

### Risk 3: Login email confused with sender identity

Impact:

- envois depuis une mauvaise adresse
- governnance floue

Mitigation:

- table d'identites dediee
- selection explicite des senders autorises

### Risk 4: External and internal humans remain conflated

Impact:

- impossible de securiser vraiment les groupes et l'approbation

Mitigation:

- ajouter `workspace_member_id` pour les internes
- garder `human_email` uniquement pour les externes

### Risk 5: Smart approval becomes opaque

Impact:

- perte de confiance

Mitigation:

- v1 deterministe uniquement
- explication systematique de la regle appliquee

---

## 17. Definition Of Done For The Full Program

Le programme est considere termine quand:

1. plusieurs humains peuvent etre invites et geres proprement dans un workspace
2. les roles workspace et permissions mailbox sont resolus depuis une vraie couche membership
3. les identites email humaines sont provisionnables et administrables
4. les boites partagees et routes agents respectent de vrais scopes humains
5. la queue d'approbation est fiable, editable, et auditable
6. les regles de smart approval low-risk peuvent etre activees de maniere explicite
7. les flows critiques sont couverts par tests

---

## 18. Recommended Next Step

Le prochain livrable recommande est un mini design slice pour la `Phase 0`, avec:

- schema cible de `workspace_members`
- table `workspace_invitations`
- service central de resolution membership/permissions
- contrat UI minimal pour un onglet `Team`

Une fois cette base posee, la suite email devient beaucoup plus simple et beaucoup moins fragile.
