# Sprint Plan — Settings Completion

- **Sprint**: S-Settings-01
- **Durée**: 5 jours ouvrés
- **Objectif sprint**: rendre `/settings` complet, stable, et validé en prod (PROD_OK)
- **Référence BMAD**: `projects/vutler/BMAD-SETTINGS-COMPLETION.md`

---

## 1) Stories (priorisées)

## US-SET-01 — Workspace Profile (P1)
**En tant que** Workspace Admin, **je veux** éditer le profil workspace **afin de** maintenir des infos correctes.

### AC
- Formulaire complet (nom, timezone, langue, contact)
- Validation front+API
- Persistance confirmée après reload

## US-SET-02 — Sessions Management (P1)
**En tant que** Admin, **je veux** voir/révoquer sessions actives.

### AC
- Liste sessions actives avec métadonnées minimales
- Action revoke session effective
- Audit log généré

## US-SET-03 — API Keys / Tokens (P1)
**En tant que** Admin, **je veux** gérer les clés API du workspace.

### AC
- Create/list/revoke
- secret affiché une seule fois
- masking en lecture
- audit log généré

## US-SET-04 — Notification Preferences (P2)
**En tant que** Admin, **je veux** configurer les notifications.

### AC
- toggles par catégorie
- sauvegarde/relecture fiable

## US-SET-05 — Branding minimal (P2)
**En tant que** Admin, **je veux** gérer logo + display name.

### AC
- upload validé
- rendu visible dans UI
- audit log pour modification

## US-SET-06 — UI Consistency & Empty States (P1)
**En tant que** utilisateur, **je veux** une UI cohérente Dashboard et sans mock data.

### AC
- sidebar Dashboard canonique
- no mock data
- empty states explicites

---

## 2) Capacity & Allocation

- **Backend**: 40%
- **Frontend**: 40%
- **QA/E2E**: 20%

---

## 3) Execution Chunks

### Chunk A (Jour 1)
- US-SET-01 API + UI profile
- Schéma DB/validation

### Chunk B (Jour 2)
- US-SET-02 sessions
- revoke flow + audit

### Chunk C (Jour 3)
- US-SET-03 keys/tokens
- masking + one-time secret

### Chunk D (Jour 4)
- US-SET-04 notifications
- US-SET-05 branding

### Chunk E (Jour 5)
- US-SET-06 consistency
- tests intégrés + PROD_OK validation

---

## 4) Definition of Done

- [ ] AC de chaque story validés
- [ ] Tests unit/integration/e2e pass
- [ ] Vérification prod utilisateur réel (PROD_OK)
- [ ] Logs audit présents pour actions sensibles
- [ ] Documentation mise à jour

---

## 5) Risks / Blockers

1. **Auth/token drift** entre pages
   - Action: standardiser helper auth + test navigation complète
2. **Régression sidebar/layout**
   - Action: layout partagé unique
3. **Sécurité token**
   - Action: chiffrement + no plain secret + revoke immédiat

---

## 6) Reporting Protocol (execution-forced)

Chaque update doit contenir:
- actions concrètes exécutées depuis update précédent
- pour chaque NOK/BLOCKED:
  - OWNER
  - ACTIONS DONE
  - NEXT ACTION (déjà démarrée)
  - WHO MUST ACT
  - DEADLINE
  - ESCALATION si deadline dépassée
