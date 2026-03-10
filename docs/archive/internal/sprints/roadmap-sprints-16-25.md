# 🚀 Vutler Product Roadmap — Sprints 16-25

**Product Manager:** Luna 🧪  
**Date:** 27 février 2026  
**Status:** ✅ Validé par Alex  
**Équipe:** Mike (Backend), Philip (Frontend), Luna (PO)

---

## 📋 Table des matières

- [Sprint 16 — Marketplace 30 Templates](#sprint-16--marketplace-30-templates)
- [Sprint S17 — Calendar System](#sprint-s17--calendar-system)
- [Sprint S18 — Mail System](#sprint-s18--mail-system)
- [Sprint 19 — Hybrid Agents (On-premise)](#sprint-19--hybrid-agents-on-premise)
- [Sprint 20 — Security Hardening](#sprint-20--security-hardening)
- [Sprint 21 — Connectors Multi-sources (Phase 1)](#sprint-21--connectors-multi-sources-phase-1)
- [Sprint 22 — Connectors Multi-sources (Phase 2)](#sprint-22--connectors-multi-sources-phase-2)
- [Sprint 23 — Visual Automation Builder](#sprint-23--visual-automation-builder)
- [Sprint 24 — Custom Agent Commands & CI/CD](#sprint-24--custom-agent-commands--cicd)
- [Sprint 25 — Analytics, Monitoring & Cleanup](#sprint-25--analytics-monitoring--cleanup)
- [Roadmap Timeline](#roadmap-timeline)

---

## Sprint 16 — Marketplace 30 Templates

**Objectif:** Déployer un marketplace de 30 templates d'automatisation prêts à l'emploi pour accélérer l'adoption et démontrer les capacités de Vutler.

**Durée:** 2 semaines (3-14 mars 2026)  
**Story Points:** 57 SP  
**Priorité:** HIGH  
**Statut:** ✅ Specs validées

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Database & API** | Schéma BDD pour tasks, labels, comments + API REST complète | 15 |
| **E2 — A2A Task Bridge** | Pont entre queue interne agents et tasks utilisateur | 8 |
| **E3 — Frontend Kanban** | Interface Kanban drag-and-drop + vue liste | 13 |
| **E4 — Task Detail & Comments** | Modal détail, commentaires, activity log | 8 |
| **E5 — Real-time & Agent Tools** | SSE/polling pour updates temps réel + outils Snipara | 6 |
| **E6 — Testing & Docs** | Tests unitaires/intégration + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Database migration, API tasks.js, taskManager.js, A2A bridge, Redis pub/sub |
| **Philip (Frontend)** | tasks.html Kanban/Liste, drag-and-drop, modal détail, real-time updates |
| **Luna (PO)** | User stories, acceptance criteria, review UI/UX, coordination |

### 🎯 User Stories principales

1. **US-01** [5 SP] — En tant qu'utilisateur, je peux créer une tâche depuis un message chat pour transformer une discussion en action
2. **US-02** [8 SP] — En tant qu'utilisateur, je peux visualiser mes tâches en mode Kanban et les déplacer par drag-and-drop
3. **US-03** [5 SP] — En tant qu'agent, je reçois les tâches qui me sont assignées via agentBus et je peux mettre à jour leur statut
4. **US-04** [3 SP] — En tant qu'utilisateur, je peux filtrer les tâches par statut, assigné, priorité et label
5. **US-05** [5 SP] — En tant qu'utilisateur, je peux ajouter des commentaires sur une tâche et voir l'historique des changements

### 📊 Métriques de succès

- 30+ templates disponibles au lancement
- Temps de création d'une tâche < 5 secondes
- Drag-and-drop fonctionne sur Chrome/Firefox
- 100% des tâches A2A synchronisées avec le board

### 📝 Documentation technique

Voir: `sprint-s16-tasks-technical.md`

---

## Sprint S17 — Calendar System

**Objectif:** Calendrier natif pour agents et humains, avec événements, rappels et intégration agentBus pour automatiser les notifications.

**Durée:** 2 semaines (17-28 mars 2026)  
**Story Points:** 54 SP  
**Priorité:** HIGH  
**Statut:** ✅ Specs validées

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Database & API** | Schéma events, attendees, reminders + API REST | 13 |
| **E2 — Calendar Views** | Frontend month/week/day views | 13 |
| **E3 — Event Management** | Création, édition, RSVP, récurrence | 10 |
| **E4 — Reminder System** | Cron heartbeat pour rappels automatiques | 7 |
| **E5 — Agent Integration** | agentBus events + agent tools (calendar_list, create) | 5 |
| **E6 — Testing & Docs** | Tests + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Database, API calendar.js, calendarManager.js, reminder cron (heartbeat.js), agentBus |
| **Philip (Frontend)** | calendar.html (month/week/day views), event modal, date navigation |
| **Luna (PO)** | User flows, acceptance tests, UX review |

### 🎯 User Stories principales

1. **US-06** [8 SP] — En tant qu'utilisateur, je peux créer un événement avec des participants (agents + humains)
2. **US-07** [5 SP] — En tant qu'agent, je peux créer automatiquement des événements (deadlines, sprints)
3. **US-08** [5 SP] — En tant qu'utilisateur, je reçois un rappel chat 15 min avant un meeting
4. **US-09** [8 SP] — En tant qu'utilisateur, je peux naviguer entre vues mois/semaine/jour
5. **US-10** [3 SP] — En tant qu'agent, je peux consulter mon agenda du jour pour prioriser mes actions

### 📊 Métriques de succès

- Création d'événement < 30 secondes
- Rappels envoyés avec précision (±1 minute)
- Interface responsive desktop/mobile
- 95% des événements agents synchronisés

### 📝 Documentation technique

Voir: `sprint-s17-calendar-technical.md`

---

## Sprint S18 — Mail System

**Objectif:** Système email intégré avec Postal, mailbox par agent, threading, routage automatique et inbox management complet.

**Durée:** 3 semaines (31 mars - 18 avril 2026)  
**Story Points:** 72 SP  
**Priorité:** HIGH  
**Statut:** ✅ Specs validées

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Database & API** | Mailboxes, threads, emails, labels, routing rules + API | 15 |
| **E2 — Email Send/Receive** | Postal SMTP send + webhook inbound + threading | 18 |
| **E3 — Frontend Mail UI** | Inbox, thread list, thread view, compose modal | 18 |
| **E4 — Routing & Agent Integration** | Rules engine, agentBus events, agent tools | 8 |
| **E5 — Advanced Features** | Search, labels, attachments, rich text compose | 8 |
| **E6 — Testing & Docs** | Tests end-to-end + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Database, API mail.js, mailManager.js, Postal integration, webhook, routing, imapPoller extension |
| **Philip (Frontend)** | mail.html (sidebar, thread list, thread view, compose modal, rich text) |
| **Luna (PO)** | Email workflows, routing rules design, acceptance criteria |

### 🎯 User Stories principales

1. **US-11** [8 SP] — En tant qu'agent, je reçois automatiquement les emails envoyés à mon adresse dédiée
2. **US-12** [8 SP] — En tant qu'utilisateur, je peux composer et envoyer un email avec rich text et signature
3. **US-13** [5 SP] — En tant qu'utilisateur, je peux répondre inline à un email dans un thread
4. **US-14** [5 SP] — En tant qu'admin, je peux créer des règles de routage pour assigner automatiquement les emails aux bons agents
5. **US-15** [5 SP] — En tant qu'utilisateur, je peux chercher dans tous mes emails par mots-clés

### 📊 Métriques de succès

- Email reçu → visible dans inbox < 30 secondes
- Envoi email < 5 secondes
- Threading correct à 95%+
- Routage automatique fonctionne pour 100% des règles configurées
- Interface comparable à Gmail/Outlook en termes d'UX

### 📝 Documentation technique

Voir: `sprint-s18-mail-technical.md`

---

## Sprint 19 — Hybrid Agents (On-premise)

**Objectif:** Déployer des agents Vutler en on-premise chez les clients (Docker) avec tunnel sécurisé vers le cloud, permettant l'accès aux systèmes internes sans exposer les données.

**Durée:** 3 semaines (21 avril - 9 mai 2026)  
**Story Points:** 68 SP  
**Priorité:** 🔴 CRITICAL (différenciateur marché)  
**Statut:** 📋 Specs disponibles (hybrid-agents-brief.md)

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Agent Runtime Core** | Binary Go : runtime, heartbeat, config receiver | 13 |
| **E2 — Secure Tunnel** | WebSocket/WireGuard tunnel outbound-only vers cloud | 13 |
| **E3 — Agent Gateway Cloud** | Service cloud : auth mTLS, config push, data ingestion | 13 |
| **E4 — Dashboard & Monitoring** | UI cloud pour gérer agents déployés + statuts | 8 |
| **E5 — Data Filter & Security** | Rules engine pour contrôler ce qui remonte au cloud | 8 |
| **E6 — Deployment & SDK** | Docker image, install script, SDK connecteurs | 8 |
| **E7 — Testing & Docs** | Tests e2e, doc déploiement, case studies | 5 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Agent Runtime (Go), Agent Gateway, tunnel, auth mTLS, data filter, API |
| **Philip (Frontend)** | Dashboard agents, monitoring UI, logs viewer, config editor |
| **Luna (PO)** | Product brief, use cases, pricing model, beta-testers, documentation business |
| **Agent Dev (nouveau)** | SDK connecteurs, install scripts, Docker packaging |

### 🎯 User Stories principales

1. **US-16** [13 SP] — En tant qu'IT Admin, je peux déployer un agent en une commande Docker
2. **US-17** [8 SP] — En tant qu'agent déployé, je me connecte automatiquement au cloud via tunnel sécurisé sans ouvrir de ports
3. **US-18** [8 SP] — En tant que Manager, je vois tous mes agents déployés et leur statut (online/offline, version, CPU/RAM)
4. **US-19** [8 SP] — En tant qu'agent on-premise, j'exécute des tâches localement et ne remonte que les résultats filtrés
5. **US-20** [5 SP] — En tant qu'IT Admin, je configure l'agent depuis le cloud sans toucher au serveur

### 📊 Métriques de succès

- Install time < 10 minutes
- Uptime agents > 95%
- Aucune donnée sensible remontée (audit trail 100%)
- 3 beta-testeurs validés en production
- Dashboard affiche statut temps réel (< 1 min de latence)

### 🏗️ Architecture

```
Cloud: Agent Gateway (API + WebSocket) + Dashboard
  ↕️ Tunnel chiffré (outbound-only)
Client: Docker Agent → connecteurs locaux (DB, files, SAP)
```

### 📝 Documentation technique

Voir: `hybrid-agents-brief.md`

---

## Sprint 20 — Security Hardening

**Objectif:** Corriger les failles de sécurité critiques : DB ports exposés, CORS wildcard, HTTPS manquant, et implémenter les best practices.

**Durée:** 1 semaine (12-16 mai 2026)  
**Story Points:** 21 SP  
**Priorité:** 🔴 CRITICAL (compliance clients enterprise)  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Database Security** | Fermer ports DB exposés Vaultbrix, setup firewall strict | 5 |
| **E2 — CORS & API Security** | Remplacer CORS wildcard par whitelist, rate limiting | 5 |
| **E3 — HTTPS Hardening** | Certificats SSL partout, HSTS, CSP headers | 5 |
| **E4 — Auth & Secrets** | Rotation secrets, JWT secure, password policies | 3 |
| **E5 — Audit & Pen-test** | Security audit externe + pen-test | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Firewall config, CORS fix, HTTPS setup, secrets rotation, rate limiting |
| **Philip (Frontend)** | CSP headers, secure cookies, XSS prevention |
| **Luna (PO)** | Coordination audit externe, compliance checklist, documentation |

### 🎯 User Stories principales

1. **US-21** [5 SP] — En tant que SysAdmin, je veux que les ports DB ne soient accessibles qu'en local/VPN
2. **US-22** [5 SP] — En tant que Security Officer, je veux un CORS strict avec whitelist des domaines autorisés
3. **US-23** [3 SP] — En tant qu'utilisateur, je veux accéder à Vutler uniquement via HTTPS avec certificats valides
4. **US-24** [3 SP] — En tant qu'admin, je veux une rotation automatique des secrets API toutes les 90 jours
5. **US-25** [3 SP] — En tant que CISO, je veux un rapport de pen-test validant la sécurité de la plateforme

### 📊 Métriques de succès

- 0 ports DB exposés publiquement
- CORS wildcard supprimé (whitelist stricte)
- 100% HTTPS avec A+ SSL Labs
- Rate limiting actif (max 100 req/min/IP)
- Pen-test sans vulnérabilité critique

---

## Sprint 21 — Connectors Multi-sources (Phase 1)

**Objectif:** Indexation multi-sources pour contexte agents : GitHub, Notion, Google Drive.

**Durée:** 2 semaines (19-30 mai 2026)  
**Story Points:** 42 SP  
**Priorité:** 🟠 HIGH (valeur ajoutée agents)  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Connector Framework** | SDK/framework pour créer des connecteurs (OAuth, sync, indexing) | 8 |
| **E2 — GitHub Connector** | Index repos, issues, PRs, comments → Snipara | 10 |
| **E3 — Notion Connector** | Index pages, databases → Snipara | 8 |
| **E4 — Google Drive Connector** | Index files, docs, sheets → Snipara | 8 |
| **E5 — Admin UI** | Configuration connecteurs (OAuth flow, sélection sources) | 5 |
| **E6 — Testing & Docs** | Tests intégration + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Connector framework, GitHub/Notion/GDrive API, indexing pipeline, Snipara upload |
| **Philip (Frontend)** | UI config connecteurs, OAuth callbacks, status monitoring |
| **Luna (PO)** | Use cases, priorité sources, documentation utilisateur |

### 🎯 User Stories principales

1. **US-26** [8 SP] — En tant qu'admin, je peux connecter un repo GitHub pour que les agents accèdent au code et aux issues
2. **US-27** [8 SP] — En tant qu'agent, je peux chercher dans le contexte Notion de l'équipe
3. **US-28** [8 SP] — En tant qu'utilisateur, je peux indexer mon Google Drive pour que les agents trouvent mes documents
4. **US-29** [5 SP] — En tant qu'admin, je vois le statut de synchronisation de chaque connecteur
5. **US-30** [3 SP] — En tant qu'agent, je reçois automatiquement les mises à jour quand une source change

### 📊 Métriques de succès

- 3 connecteurs fonctionnels (GitHub, Notion, GDrive)
- Sync initiale < 5 min pour 1000 fichiers
- Agents accèdent au contexte en < 2s
- Taux de succès sync > 95%

---

## Sprint 22 — Connectors Multi-sources (Phase 2)

**Objectif:** Ajout connecteurs Confluence, Slack, et amélioration framework (webhooks, incremental sync).

**Durée:** 2 semaines (2-13 juin 2026)  
**Story Points:** 38 SP  
**Priorité:** 🟠 HIGH  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Confluence Connector** | Index spaces, pages, attachments | 10 |
| **E2 — Slack Connector** | Index channels, messages, threads (respect privacy) | 10 |
| **E3 — Incremental Sync** | Delta sync au lieu de full resync | 8 |
| **E4 — Webhooks** | Real-time updates via webhooks (GitHub, Notion) | 5 |
| **E5 — Testing & Docs** | Tests + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Confluence/Slack APIs, incremental sync, webhooks, optimisations |
| **Philip (Frontend)** | UI amélioration config, logs détaillés |
| **Luna (PO)** | Priorisation sources, use cases enterprise |

### 🎯 User Stories principales

1. **US-31** [8 SP] — En tant qu'agent, je peux chercher dans la base de connaissances Confluence
2. **US-32** [8 SP] — En tant qu'agent, je peux accéder à l'historique des conversations Slack (avec permissions)
3. **US-33** [5 SP] — En tant que système, je synchronise uniquement les changements (delta) au lieu de tout re-indexer
4. **US-34** [3 SP] — En tant qu'agent, je reçois une notification quand un document pertinent est modifié

### 📊 Métriques de succès

- 5 connecteurs opérationnels au total
- Incremental sync réduit le temps de 80%+
- Webhooks real-time < 10s de latence
- 0 conflit de données

---

## Sprint 23 — Visual Automation Builder

**Objectif:** Interface drag-and-drop pour créer des automations sans code (Epic 5 du Sprint 15).

**Durée:** 3 semaines (16 juin - 4 juillet 2026)  
**Story Points:** 55 SP  
**Priorité:** 🟡 MEDIUM (nice-to-have mais différenciant)  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Visual Editor Core** | Canvas drag-and-drop, nodes (trigger, action, condition) | 13 |
| **E2 — Workflow Engine** | Exécution des workflows créés visuellement | 13 |
| **E3 — Node Library** | 20+ nodes prédéfinis (email, calendar, tasks, HTTP, DB) | 13 |
| **E4 — Testing & Debugging** | Test mode, logs, debugging visuel | 8 |
| **E5 — Templates & Marketplace** | Templates d'automations, marketplace communautaire | 5 |
| **E6 — Testing & Docs** | Tests + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Workflow engine, exécution nodes, API workflows |
| **Philip (Frontend)** | Visual editor (React Flow ou similaire), UI nodes, debugging |
| **Luna (PO)** | Use cases automations, templates prioritaires, UX flows |

### 🎯 User Stories principales

1. **US-35** [13 SP] — En tant qu'utilisateur, je peux créer une automation par drag-and-drop sans écrire de code
2. **US-36** [8 SP] — En tant qu'utilisateur, je peux tester mon workflow avant de l'activer
3. **US-37** [8 SP] — En tant qu'utilisateur, je peux utiliser des templates d'automations prêts à l'emploi
4. **US-38** [5 SP] — En tant qu'utilisateur, je vois les logs d'exécution de mes workflows
5. **US-39** [5 SP] — En tant que créateur, je peux partager mon automation sur le marketplace

### 📊 Métriques de succès

- 20+ nodes disponibles
- Création d'un workflow simple < 3 minutes
- 10+ templates dans le marketplace
- Taux d'adoption > 30% des utilisateurs

---

## Sprint 24 — Custom Agent Commands & CI/CD

**Objectif:** Custom slash commands depuis Markdown templates + agents dans GitHub Actions pour review automatique de PR.

**Durée:** 2 semaines (7-18 juillet 2026)  
**Story Points:** 34 SP  
**Priorité:** 🟡 MEDIUM  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Custom Commands Framework** | Markdown templates → slash commands dynamiques | 8 |
| **E2 — Command Editor** | UI pour créer/éditer des custom commands | 5 |
| **E3 — GitHub Actions Integration** | Agent runner dans Actions pour PR review | 13 |
| **E4 — CI/CD Templates** | Templates : lint, test, security scan, changelog | 5 |
| **E5 — Testing & Docs** | Tests + documentation | 3 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Command parser, GitHub Actions runner, API integration |
| **Philip (Frontend)** | Command editor UI, preview, test interface |
| **Luna (PO)** | Use cases commands, templates CI/CD, documentation |

### 🎯 User Stories principales

1. **US-40** [8 SP] — En tant qu'utilisateur, je peux créer un slash command custom depuis un template Markdown
2. **US-41** [13 SP] — En tant que dev, je peux utiliser un agent Vutler dans GitHub Actions pour reviewer mes PRs automatiquement
3. **US-42** [5 SP] — En tant qu'équipe, je peux créer des templates CI/CD réutilisables
4. **US-43** [3 SP] — En tant qu'utilisateur, je peux tester mon custom command avant de le déployer

### 📊 Métriques de succès

- 10+ custom commands créés par les utilisateurs
- Agent GitHub Actions fonctionne sur 5+ repos
- Temps de PR review réduit de 50%+

---

## Sprint 25 — Analytics, Monitoring & Cleanup

**Objectif:** Analytics Umami sur app.vutler.ai, dashboards d'utilisation, et nettoyage codebase (références K-Suite).

**Durée:** 2 semaines (21 juillet - 1 août 2026)  
**Story Points:** 29 SP  
**Priorité:** 🟢 LOW (quality of life)  
**Statut:** 📋 À spécifier

### 📦 Epics

| Epic | Description | SP |
|------|-------------|-----|
| **E1 — Analytics Umami** | Setup Umami, tracking events, dashboards | 8 |
| **E2 — Usage Dashboards** | Dashboards admin : users actifs, agents, tasks, emails, etc. | 8 |
| **E3 — Codebase Cleanup** | Remove K-Suite references, dead code, eslint fixes | 8 |
| **E4 — Code Quality** | ESLint strict, Prettier, pre-commit hooks | 3 |
| **E5 — Testing & Docs** | Tests coverage improvement, docs update | 2 |

### 👥 Assignations

| Rôle | Responsabilités |
|------|----------------|
| **Mike (Backend)** | Cleanup backend, code quality tools, analytics API |
| **Philip (Frontend)** | Cleanup frontend, Umami integration, usage dashboards |
| **Luna (PO)** | Metrics définition, dashboards UX, documentation |

### 🎯 User Stories principales

1. **US-44** [8 SP] — En tant qu'admin, je veux voir les métriques d'utilisation (users, agents, actions/jour)
2. **US-45** [5 SP] — En tant que dev, je veux que le code soit propre, sans références K-Suite
3. **US-46** [3 SP] — En tant que PM, je veux tracker les features les plus utilisées via Umami
4. **US-47** [3 SP] — En tant que dev, je veux du code formaté automatiquement (Prettier + pre-commit)

### 📊 Métriques de succès

- Umami tracking > 95% des pages
- 0 références K-Suite dans le code
- Code coverage > 70%
- Dashboards admin accessibles et utilisés

---

## 📅 Roadmap Timeline

```
Mars 2026
├─ S16 (3-14 mars) — Marketplace Tasks [57 SP]
└─ S17 (17-28 mars) — Calendar [54 SP]

Avril 2026
└─ S18 (31 mars - 18 avril) — Mail [72 SP]

Mai 2026
├─ S19 (21 avril - 9 mai) — Hybrid Agents [68 SP] 🔴 CRITICAL
└─ S20 (12-16 mai) — Security Hardening [21 SP] 🔴 CRITICAL

Juin 2026
├─ S21 (19-30 mai) — Connectors Phase 1 [42 SP]
└─ S22 (2-13 juin) — Connectors Phase 2 [38 SP]

Juillet 2026
├─ S23 (16 juin - 4 juillet) — Visual Automation [55 SP]
└─ S24 (7-18 juillet) — Custom Commands & CI/CD [34 SP]

Août 2026
└─ S25 (21 juillet - 1 août) — Analytics & Cleanup [29 SP]
```

### 📊 Vélocité moyenne

- **Équipe 3 devs** : ~35-45 SP/semaine
- **Sprint 2 semaines** : ~70-90 SP
- **Sprint 3 semaines** : ~105-135 SP

**Note:** Les estimations sont calibrées sur l'équipe actuelle (Mike + Philip). Pour les sprints > 70 SP, prévoir un dev additionnel ou étaler sur 3 semaines.

---

## 🎯 Priorités stratégiques

### Q2 2026 (Avril-Juin)
1. **Hybrid Agents** — Différenciateur marché, cible enterprise/MSP
2. **Security Hardening** — Compliance clients critiques
3. **Connectors** — Valeur ajoutée agents, contexte multi-sources

### Q3 2026 (Juillet-Septembre)
1. **Visual Automation** — No-code, élargir audience
2. **Custom Commands & CI/CD** — Developer experience
3. **Analytics** — Product insights

---

## 📈 Métriques globales (fin Sprint 25)

| Métrique | Cible |
|----------|-------|
| **Users actifs** | 500+ |
| **Agents déployés** | 1000+ (dont 100+ on-premise) |
| **Tasks créées/mois** | 5000+ |
| **Emails gérés/mois** | 10'000+ |
| **Events calendrier/mois** | 2000+ |
| **Connecteurs actifs** | 500+ (5 types × 100 workspaces) |
| **Automations actives** | 200+ |
| **MRR** | CHF 50'000+ |
| **NPS** | > 50 |

---

## 🚀 Beyond Sprint 25 (Backlog long terme)

- **Agent Mesh** — Agents qui collaborent entre eux
- **Mobile App** — iOS/Android native
- **Voice Interface** — Commandes vocales
- **White-label** — MSP branding
- **Marketplace Plugins** — Communauté de développeurs
- **Agent Benchmarks & Evals** — Évaluation de performance des agents (temps de réponse, qualité, coût/token, taux de succès), scoring automatique, comparaison entre modèles — inspiré de l'approche "evaluator-first" (cf. brainqub3/agent-labs)
- **AI Models Fine-tuning** — Models custom par workspace
- **Enterprise SSO** — SAML, LDAP
- **Multi-language** — FR, DE, EN, IT

---

**Document créé par Luna 🧪**  
**Dernière mise à jour:** 27 février 2026  
**Status:** ✅ Ready for execution

_Roadmap vivante — mise à jour après chaque sprint review._
