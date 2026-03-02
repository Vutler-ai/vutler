# Vutler Bug Fixing - Priorisation (2026-03-01)

**Source:** Alex manual QA session  
**Workflow:** Stratégie (Jarvis) → Implementation (Mike/Kimi K2.5) → Review (Jarvis) → Deploy (Mike)

---

## 🔴 P0 - Bloquants (Core Features Cassées)

### 1. Chat - Création de channels impossible ✅ FIXÉ
- **Status:** RÉSOLU (bugs #2-4 fixés par Mike)
- ~~Bug: Pas de création de channel possible~~
- ~~Errors: 500 GET /channels, 404 POST /channels, 404 POST /channels/direct~~
- **Fix deployed:** 2026-03-01 20:14

### 2. Agents - Bouton "Manage" ne fait rien
- **Page:** /agents
- **Issue:** Clic sur "Manage" → pas d'action
- **Impact:** Impossible de gérer les agents existants
- **Root cause probable:** Event handler manquant ou route cassée

### 3. Nexus Registration - N'existe pas
- **Page:** /nexus/setup
- **Issue:** Pas de génération de token, rien ne fonctionne
- **Impact:** BLOQUANT pour Nexus (feature majeure)
- **Root cause probable:** API /nexus/register ou /nexus/local-token cassée (pourtant testée OK en dev)

### 4. Setup - Token generation cassée
- **Page:** /setup (onboarding)
- **Issue:** Pas de génération de token
- **Impact:** BLOQUANT pour nouveau workspace
- **Root cause probable:** API /setup/init ou frontend broken

### 5. Drive - Plus de fichiers/folders
- **Page:** /drive
- **Issue:** Aucun fichier ni dossier affiché
- **Impact:** BLOQUANT pour Drive feature
- **Root cause probable:** API /drive/list cassée ou DB vide

---

## 🟠 P1 - Important (Features Partielles)

### 6. Email - Aucun email reçu
- **Issue:** Aucun email visible (suspect)
- **Impact:** Feature email non fonctionnelle
- **Root cause probable:** Polling cassé ou intégration Postal

### 7. Integrations - Multiples 500/404
- **Errors:**
  - 500: `/api/v1/marketplace/templates/1/install`
  - 404: `/api/v1/agents/deploy`
  - 404: `/api/v1/integrations/undefined/connect`
  - 500: `/api/v1/agents/{id}/executions`
- **Impact:** Aucune intégration ne fonctionne
- **Root cause:** Endpoints manquants ou API cassée

### 8. LLM Settings - 404 Assets (CSS/JS)
- **Errors:**
  - 404: `b0440156e67b234a.css`
  - 404: `3763927b785df6cc.js`
  - 404: `1627bf2f54f2038d.js`
  - 404: `turbopack-bd45b4b4e476b92b.js`
  - 404: `b6b23795db1968e0.js`
- **Impact:** Page LLM Settings potentiellement cassée
- **Root cause:** Build Next.js incomplet ou static files manquants

### 9. Sprites - 404 (agents) ✅ FIXÉ
- **Status:** RÉSOLU (bug #1 fixé par Mike)
- ~~Error: 404 `/sprites/agent-customer_support_agent.png`~~
- **Fix deployed:** 2026-03-01 (nginx + scripts)

### 10. Notifications - Pas câblé
- **Issue:** Feature non implémentée
- **Impact:** Pas de notifications utilisateur
- **Root cause:** Feature non développée (normal pour MVP?)

### 11. Usage - Pas de data
- **Page:** /usage
- **Issue:** Pas de données affichées
- **Impact:** Pas de monitoring token usage
- **Root cause:** API /usage pas câblée ou DB vide

### 12. Audit Logs - Pas câblé
- **Page:** /audit
- **Issue:** Pas de logs
- **Impact:** Pas d'audit trail
- **Root cause:** Feature non développée

---

## 🟡 P2 - Nice-to-Have (Non-Bloquant)

### 13. Tasks - Auto-update à vérifier
- **Issue:** Vérifier si tasks sont auto-updatées par agents
- **Impact:** UX (refresh manuel?)
- **Root cause:** WebSocket ou polling à tester

### 14. Deployments - À vérifier
- **Page:** /nexus/deployments
- **Issue:** Statut inconnu
- **Root cause:** Needs testing

### 15. Clients - "Unknown"
- **Page:** /nexus/clients
- **Issue:** Affiche "unknown" (devrait être "Jarvis sur Mac"?)
- **Impact:** UX
- **Root cause:** Client metadata pas envoyée ou pas affichée

### 16. Sandbox - À tester
- **Page:** /sandbox
- **Issue:** Pas encore testé
- **Root cause:** Needs QA

### 17. Automation - Tester création
- **Page:** /automation
- **Issue:** Vérifier si création fonctionne
- **Root cause:** Needs testing

### 18. Templates - Rien câblé
- **Page:** /templates
- **Issue:** Feature non implémentée
- **Impact:** Pas de templates utilisateur
- **Root cause:** Backend manquant

### 19. Integrations Menu - Doublé
- **Issue:** Menu integrations existe 2x, meilleur pas fonctionnel
- **Impact:** UX confusion
- **Root cause:** Routes dupliquées

---

## 🟠 P1 - Nouvelles Tâches (Ajoutées 2026-03-01)

### 21. Nexus & Setup Buttons - Visual State
- **Page:** Sidebar / Layout
- **Issue:** Boutons statiques, pas d'indication si configuré
- **Fix:** Badges verts "Connected" / "Complete" quand actifs
- **API:** `/api/v1/nexus/status` + `/api/v1/setup/status`

### 22. Nexus Configuration - Mac Remote (Jarvis)
- **Goal:** Installer Nexus sur Mac d'Alex
- **Steps:** npm install → pair → configure OpenRouter
- **Owner:** Jarvis (config manuelle après stabilisation)

---

## 🔵 Hors Scope (Mettre de Côté)

### 23. Pixel Office
- **Issue:** "Ne sert à rien pour l'instant"
- **Decision:** Mettre de côté (feature future)

---

## 📊 Stats

| Priorité | Count | % Total |
|----------|-------|---------|
| P0 (Bloquants) | 5 bugs (2 fixés) | 25% |
| P1 (Important) | 9 bugs (1 fixé) | 45% |
| P2 (Nice-to-have) | 7 bugs | 35% |
| **Total actif** | **18 bugs restants** | 100% |
| ✅ Fixés | 3 bugs | - |
| 🔵 Hors scope | 1 item | - |

---

## 🎯 Plan d'Attaque (Workflow Hybride)

### Phase 1: P0 Bloquants (URGENT)
1. **Agents - Bouton Manage** → Mike (Kimi K2.5)
2. **Nexus Registration** → Mike (Kimi K2.5)
3. **Setup - Token gen** → Mike (Kimi K2.5)
4. **Drive - Fichiers manquants** → Mike (Kimi K2.5)

### Phase 2: P1 Important
5. **Email integration** → Mike
6. **Integrations API** → Mike
7. **LLM Settings assets** → Mike
8. **Notifications** → Décision: implémenter maintenant ou post-MVP?
9. **Usage/Audit** → Décision: feature scope?

### Phase 3: P2 Polish
10. Tests E2E sur tasks/deployments/clients/sandbox/automation

---

**Next Step:** Spawner Mike sur Phase 1 (4 bugs P0) en batch
