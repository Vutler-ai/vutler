# BMAD — Completion du module Settings (Vutler)

- **Date**: 2026-03-10
- **Owner**: Product + Engineering
- **Statut**: Draft ready for execution
- **Scope**: `/settings` (web app Vutler cloud)

---

## 1) Business Objective

Finaliser la page **Settings** pour qu’elle soit exploitable en production par un admin workspace, avec:
- gestion du profil workspace,
- sécurité (sessions, policy basique),
- préférences notifications,
- branding minimal,
- API keys / tokens de service,
- journal d’audit des changements critiques (liaison avec Audit Logs).

**Résultat attendu**: Settings passe de “partiel” à “opérationnel” pour les besoins MVP B2B.

---

## 2) Metrics of Success

### KPI produit
- 100% des sections Settings MVP visibles et fonctionnelles
- 0 section “placeholder/mock” en production
- 95% des updates Settings < 1.5s (P95)

### KPI qualité
- 0 erreur JS bloquante sur `/settings`
- 0 requête API non-auth sur endpoints settings
- couverture tests (unit + integration) sur chemins critiques

### KPI adoption
- 1 workspace pilote configuré end-to-end sans support dev

---

## 3) Actors / Personas

- **Workspace Admin**: configure compte entreprise et politiques
- **Ops/Founder**: ajuste notifications, branding, accès
- **Security Lead**: contrôle API keys / sessions / auditability

---

## 4) Problem Statement

Le module actuel est incomplet/incohérent avec le standard Dashboard:
- sections manquantes ou non persistées,
- ergonomie et cohérence UI à stabiliser,
- traçabilité de changements sensibles à renforcer.

---

## 5) Scope

### In Scope (MVP)
1. **Workspace Profile**
   - Nom entreprise, timezone, langue, contact admin
2. **Security & Access**
   - liste sessions actives + revoke session
   - rotation token/API key workspace
3. **Notifications**
   - préférences alertes (ops, billing, incidents)
4. **Branding**
   - logo + nom d’affichage workspace
5. **Audit hooks**
   - chaque changement sensible écrit un événement d’audit

### Out of Scope (post-MVP)
- SSO SAML complet
- RBAC avancé par ressource
- policy engine granulaire (ABAC)

---

## 6) Functional Requirements

### FR-1 Workspace Profile
- L’admin peut lire/éditer les paramètres de base
- Validation stricte des champs
- sauvegarde persistée côté backend

### FR-2 Sessions Management
- L’admin voit les sessions actives
- Peut révoquer une session spécifique

### FR-3 API Keys / Tokens
- Créer, lister (masked), révoquer clé
- Affichage one-time secret au create uniquement

### FR-4 Notifications Preferences
- Toggle par catégorie
- Persistance par workspace

### FR-5 Branding
- Upload logo (format/size validés)
- Nom d’affichage workspace

### FR-6 Auditability
- Toutes actions FR-2/FR-3/FR-5 et updates sensibles FR-1 génèrent un log
- corrélation user/workspace/action/timestamp

---

## 7) Non-Functional Requirements

- Auth obligatoire (Bearer/token helper standard)
- Multi-tenant strict (workspace isolation)
- Temps de réponse P95 < 1.5s
- Erreurs API standard `{ success:false, error }`
- No mock data (empty states explicites)

---

## 8) Dependencies

- `api/settings.js` (routes)
- services settings/security
- table(s) settings + token metadata + sessions index
- intégration Audit Logs (`/audit`)

---

## 9) Risks & Mitigations

1. **Risque auth/session drift**
   - Mitigation: usage uniforme `auth-helper-v2` + tests e2e login->settings
2. **Risque régression UI sidebar/layout**
   - Mitigation: layout Dashboard canonique partagé
3. **Risque sécurité clés**
   - Mitigation: storage chiffré + affichage partiel + rotation/revoke

---

## 10) Acceptance Criteria (global)

- [ ] Admin peut configurer profil workspace et voir les valeurs persistées après refresh
- [ ] Admin peut voir/révoquer sessions actives
- [ ] Admin peut créer/révoquer API key sans fuite secret
- [ ] Préférences notifications sauvegardées et relues
- [ ] Branding sauvegardé et appliqué
- [ ] Changement sensible visible dans Audit Logs
- [ ] Aucun mock data en prod

---

## 11) Delivery Gate

- **LOCAL_OK**: tests locaux passés
- **PROD_OK**: vérification live sur workspace pilote
- En cas de dérive env: **ENV_DRIFT** puis correction avant fermeture
