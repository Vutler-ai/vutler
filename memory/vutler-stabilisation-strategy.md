# Stratégie de Stabilisation Vutler

**Date:** 2026-03-01 20:34  
**Décision:** Alex Lopez  
**Approche:** "Tout opérationnel avant commit"

---

## 🎯 Principe

**Aucune page ne doit être vide ou cassée.**

Toutes les features doivent être câblées et fonctionnelles, même si basiques, avant de commit sur `master` et passer en branche `dev` pour développement futur.

## 🚨 Règle Critique: "Tout Câblé ou Rien"

**Problème identifié:** Incohérence systématique UI ↔ API
- ❌ UI existe mais API retourne 404
- ❌ API existe mais pas d'UI
- ❌ Les deux existent mais mal câblés (champs différents)

**Solution:** Chaque feature = **API + Frontend + Wiring + Tests** obligatoires

**Voir:** `memory/dev-workflow-rules.md` pour détails complets

---

## 📋 Règles de Stabilisation

### 1. Pages/Features
- ✅ Toutes les pages doivent charger sans erreur
- ✅ Toutes les pages doivent afficher des données (real ou demo)
- ❌ Pas de pages vides avec "Coming soon" ou "Not implemented"
- ❌ Pas de boutons qui ne font rien

### 2. API Endpoints
- ✅ Tous les endpoints appelés par le frontend doivent exister
- ✅ Endpoints retournent 200 + data (même si sample/mock)
- ❌ Pas de 404 sur routes attendues
- ❌ Pas de 500 sur routes existantes

### 3. Base de Données
- ✅ Toutes les tables référencées doivent exister
- ✅ Seed data minimal pour chaque table
- ✅ Foreign keys valides

### 4. Services
- ✅ Tous les services Docker/systemd running
- ✅ Health checks passent
- ✅ Logs sans erreurs critiques

---

## 🔧 Workflow

```
1. Fix ALL bugs (P0 + P1 + P2)
   ↓
2. Câbler toutes features manquantes (même basiques)
   ↓
3. QA complet (22 pages end-to-end)
   ↓
4. Commit sur master
   ↓
5. Créer branche dev
   ↓
6. Future development sur dev
```

---

## 📊 Checklist Bugs (Phase Actuelle)

### Phase 1: P0 Bloquants ✅
- [x] Bug #1: Agents - Bouton "Manage" → ✅ Fixed
- [x] Bug #2: Nexus Registration → ✅ Fixed
- [x] Bug #3: Setup Token → ✅ Fixed
- [x] Bug #4: Drive fichiers → ✅ Fixed

### Phase 2: P1 Important (en cours)
- [ ] Bug #5: Email - Aucun email visible
- [ ] Bug #6: Integrations - 500/404 multiples
- [ ] Bug #7: LLM Settings - Assets 404
- [ ] Bug #8: Notifications/Usage/Audit - **CÂBLER TOUT**

### Phase 3: P2 Polish
- [ ] Bug #9: Tasks - Auto-update à vérifier
- [ ] Bug #10: Deployments - À vérifier
- [ ] Bug #11: Clients - "Unknown"
- [ ] Bug #12: Sandbox - À tester
- [ ] Bug #13: Automation - Tester création
- [ ] Bug #14: Templates - Rien câblé
- [ ] Bug #15: Integrations menu - Doublé

---

## 🎯 Pour Bug #8 Spécifiquement

**Notifications:**
- Endpoint: `GET /api/v1/notifications`
- Table: `CREATE TABLE notifications (id, user_id, type, message, read, created_at)`
- Seed: 3-5 notifications sample
- Frontend: Affiche liste même si vide

**Usage:**
- Endpoint: `GET /api/v1/usage` (déjà existe partiellement)
- Table: `token_usage` (existe déjà)
- Fix: Query correcte + aggregation par jour/agent
- Frontend: Chart + breakdown table

**Audit Logs:**
- Endpoint: `GET /api/v1/audit`
- Table: `audit_logs` (existe déjà)
- Seed: Logs pour actions critiques (login, agent create, etc.)
- Frontend: Table filtrable par date/user/action

---

## 🚫 Ce qu'on NE fait PAS

- ❌ Skip des features "pour plus tard"
- ❌ Commit du code avec TODO/FIXME non résolus
- ❌ Pages avec placeholders vides
- ❌ Endpoints qui retournent 501 Not Implemented

**Philosophie:** Si c'est dans l'UI, ça doit fonctionner. Si c'est pas prêt, on l'enlève de l'UI.

---

## 📅 Timeline

**Target:** Tout opérationnel avant fin de semaine (2026-03-07)

1. **Aujourd'hui (2026-03-01):** P0 ✅ + P1 en cours
2. **Demain (2026-03-02):** P1 complete + P2 début
3. **Mar-Mer:** P2 complete + QA
4. **Jeu-Ven:** Polissage + commit master
5. **Lundi prochain:** Dev sur branche `dev`

---

**Owner:** Jarvis  
**Executor:** Mike (Kimi K2.5)  
**Review:** Alex (tests manuels finaux)
