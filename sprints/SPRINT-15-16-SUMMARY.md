# Sprints 15 & 16 — Synthèse Exécutive

**Date:** 2026-02-27  
**Owner:** Luna 🧪 (Product Manager, ENTJ)  
**Status:** Ready for Sprint Planning

---

## 🎯 Vue d'Ensemble

Deux sprints stratégiques pour transformer Vutler en **plateforme d'automation intelligente** :

| Sprint | Thème | Story Points | Durée Estimée | Impact Business |
|--------|-------|--------------|---------------|-----------------|
| **Sprint 15** | Automation Engine (n8n-style) | **63 SP** | 3-4 semaines | ⭐⭐⭐⭐⭐ Critique |
| **Sprint 16** | Marketplace 20-30 Templates | **57 SP** | 2-3 semaines | ⭐⭐⭐⭐ Élevé |

**Total:** 120 SP (~6 semaines de dev avec équipe pleine)

---

## 🚀 Sprint 15 — Automation Engine

### Vision 1-Liner
*"Les agents créent leurs propres workflows d'automation via prompts. Zéro intervention humaine."*

### User Stories Clés (6 stories)

| ID | Story | SP | Priorité |
|----|-------|----|---------:|
| US-15.1 | Création workflow par prompt (agent-generated) | 13 | P0 |
| US-15.2 | Triggers (webhook, schedule, event) | 8 | P0 |
| US-15.3 | Actions (email, task, API, messaging) | 13 | P0 |
| US-15.4 | Visual workflow builder (UI debug) | 8 | P1 |
| US-15.5 | Execution engine (background worker) | 13 | P0 |
| US-15.6 | Auto-suggest automations | 8 | P2 |

### Deliverables Techniques
- ✅ 5 nouvelles tables PostgreSQL (`automation_rules`, `automation_triggers`, `automation_logs`, `automation_action_logs`, `agent_secrets`)
- ✅ Background worker Node.js `automation-runner`
- ✅ API REST complète (create, pause, resume, delete, logs)
- ✅ UI React Flow pour visualisation workflows
- ✅ Snipara MCP integration (`rlm_orchestrate` pour workflows complexes)

### Risques Majeurs
1. **Complexité workflows génératifs** → LLM produit JSON invalide (mitigation: validation stricte)
2. **Scalabilité runner** → 1000+ automations actives (mitigation: queue BullMQ, horizontal scaling)
3. **Infinite loops** → Automation mal configurée boucle (mitigation: rate limits, circuit breaker)

### Success Metrics
- Agent crée 1 automation en <30s (prompt → workflow actif)
- Execution success rate ≥95%
- Latency P95 <5s (trigger → action)

---

## 🏪 Sprint 16 — Marketplace 20-30 Templates

### Vision 1-Liner
*"Le GitHub des agents AI. Découvrir, déployer, customiser des agents spécialisés en 1 click."*

### User Stories Clés (7 stories)

| ID | Story | SP | Priorité |
|----|-------|----|---------:|
| US-16.1 | Template discovery (catalogue enrichi) | 5 | P0 |
| US-16.2 | Template detail page (showcase complet) | 8 | P0 |
| US-16.3 | One-click deploy (sans config) | 5 | P0 |
| US-16.4 | Deploy avec customisation avancée | 13 | P1 |
| US-16.5 | Template authoring (créer/publier) | 13 | P1 |
| US-16.6 | Stats & analytics (admin) | 5 | P2 |
| US-16.7 | Reviews & ratings | 8 | P1 |

### Lineup Templates (30 templates sur 10 catégories)

| Catégorie | Templates | Examples |
|-----------|-----------|----------|
| **Customer Support** | 4 | Support Bot Classic, Multilingual, Escalation Manager, Chatbot Widget |
| **Sales** | 3 | Lead Qualifier, Meeting Scheduler, Follow-Up Specialist |
| **Marketing** | 4 | Content Writer, SEO Optimizer, Email Campaign Manager, Social Media Manager |
| **HR** | 3 | Recruiter Assistant, Onboarding Buddy, Feedback Analyzer |
| **Legal** | 2 | Contract Reviewer, Compliance Checker |
| **Finance** | 3 | Expense Tracker, Invoice Chaser, Budget Analyst |
| **DevOps** | 3 | Incident Manager, Deploy Assistant, Code Reviewer |
| **Content & Media** | 3 | Podcast Show Notes, Video Script Writer, Newsletter Curator |
| **Analytics** | 2 | Data Analyst, Report Generator |
| **Operations** | 3 | Task Automator, Meeting Notes Bot, Workflow Optimizer |

### Deliverables Techniques
- ✅ 3 nouvelles tables (`agent_template_reviews`, `agent_template_deployments`, + colonnes `agent_templates`)
- ✅ API REST marketplace (discovery, deploy, reviews, stats)
- ✅ UI React marketplace (cards, filters, detail page, customization flow)
- ✅ 30 templates JSON configs (SOUL, MBTI, tools, prompts, automations)
- ✅ Review system avec moderation

### Risques Majeurs
1. **Quality control templates** → Templates community de mauvaise qualité (mitigation: review process, tests auto)
2. **Template sprawl** → Trop de templates similaires (mitigation: curation, featured templates)
3. **Customisation complexity** → Users non-tech bloqués (mitigation: two-tier deploy, tooltips)

### Success Metrics
- 30% users Free déploient ≥1 template dans 7 jours
- Time-to-first-agent <2 min
- Avg template rating ≥4.0/5.0
- Conversion Free → Pro +15%

---

## 📊 Comparaison Sprints

| Dimension | Sprint 15 | Sprint 16 |
|-----------|-----------|-----------|
| **Complexité technique** | ⭐⭐⭐⭐⭐ Très élevée (workflow engine) | ⭐⭐⭐ Moyenne (CRUD + UI) |
| **Valeur business** | ⭐⭐⭐⭐⭐ Game changer | ⭐⭐⭐⭐ Forte (conversion) |
| **Risque** | ⭐⭐⭐⭐ Élevé (scalabilité, infinite loops) | ⭐⭐ Faible (mostly content) |
| **Dépendances** | Sprint 2, 9 (AgentBus) | Sprint 2 (agent creation) |
| **Parallélisable** | ❌ Non (backend-heavy) | ✅ Oui (frontend/backend/content) |

---

## 🎯 Recommandations Luna (ENTJ Mode)

### Option 1 : Séquentiel (Safe)
1. **Sprint 15A (4 semaines)** — Core automation engine (US-15.1, 15.2, 15.3, 15.5)
2. **Sprint 16 (2 semaines)** — Marketplace complet (profite de Sprint 15 pour `suggested_automations`)
3. **Sprint 15B (1 semaine)** — Polish automation UI + auto-suggest

**Avantages:** Sprint 16 bénéficie de Sprint 15 terminé (automations dans templates)  
**Inconvénients:** 7 semaines total (long)

### Option 2 : Parallèle (Aggressive)
1. **Sprint 15 + 16 en parallèle (4 semaines)**
   - Track 1: Mike + Alex → Automation engine (backend)
   - Track 2: Philip → Marketplace UI (frontend)
   - Track 3: Luna → Content (30 templates configs)
2. **Sprint 15B + 16 polish (1 semaine)** — Integration + tests E2E

**Avantages:** 5 semaines total (gain 2 semaines)  
**Inconvénients:** Risque integration, équipe split

### Option 3 : Phased Rollout (Recommandé ✅)
1. **Sprint 15 MVP (3 semaines)** — US-15.1, 15.2, 15.3, 15.5 (P0 uniquement, 47 SP)
2. **Sprint 16 (2 semaines)** — US-16.1, 16.2, 16.3 + 10 templates (P0 uniquement, 35 SP)
3. **Sprint 17 (2 semaines)** — Sprint 15 polish + Sprint 16 expansion (20 templates restants)

**Avantages:** Release progressive, feedback users early, risque contrôlé  
**Inconvénients:** 3 sprints au lieu de 2 (mais itératif)

---

## 🚦 Go/No-Go Criteria

### Green Light ✅ (On lance)
- [ ] Vaultbrix stable (no major bugs)
- [ ] Docker infra ready (automation-runner déployable)
- [ ] Snipara MCP integration testée (rlm_orchestrate OK)
- [ ] Équipe disponible (Mike, Alex, Philip full-time)
- [ ] Sprint 2 (agent creation) terminé et stable

### Yellow Light ⚠️ (On réduit scope)
- [ ] 1 dev manquant → Réduire à P0 uniquement (Sprint 15A + 16 MVP)
- [ ] Snipara pas ready → Retarder US-15.6 (auto-suggest)
- [ ] Docker issues → Utiliser direct LLM API (pas containers) pour Sprint 16

### Red Light 🛑 (On reporte)
- [ ] Vaultbrix down ou instable
- [ ] Équipe <2 devs disponibles
- [ ] Blockers techniques non-résolus (ex: AgentBus broken)

---

## 📅 Timeline Proposée (Option 3)

```
Semaine 1-3  : Sprint 15 MVP (Automation Engine Core)
Semaine 4-5  : Sprint 16 MVP (Marketplace 10 templates)
Semaine 6-7  : Sprint 17 (Polish + Expansion)

Milestone 1 (Semaine 3) : Agents peuvent créer automations simples
Milestone 2 (Semaine 5) : Users peuvent déployer agents depuis marketplace
Milestone 3 (Semaine 7) : 30 templates + automations auto-suggested
```

**Release Strategy:**
- **Beta privée (Semaine 3)** — 10 early adopters testent automation engine
- **Beta publique (Semaine 5)** — Marketplace ouvert, templates limités à 10
- **GA (Semaine 7)** — Full launch, 30 templates, blog post, social push

---

## 💰 Business Impact Projection

### Short-term (3 mois post-launch)
- **User acquisition:** +30% (marketplace = viral loop, templates partagés)
- **Conversion Free → Pro:** +15% (templates Pro + automations avancées)
- **Retention D30:** +20% (agents automatisés = sticky)

### Mid-term (6 mois)
- **MRR:** +$50K (assuming 500 Pro users @ $99/mo)
- **Template ecosystem:** 50+ community templates
- **Use cases:** De 3 cas d'usage à 15+ (diversification)

### Long-term (12 mois)
- **Category creation:** "Vutler = Zapier for AI Agents"
- **Marketplace revenue share:** 20% commission sur templates premium community
- **Enterprise land:** Automations = argument de vente clé

---

## ✅ Next Steps

1. **Sprint Planning (cette semaine)**
   - Review briefs avec Mike, Alex, Philip
   - Vote sur Option 1/2/3
   - Assign stories, définir ceremonies

2. **Tech Prep (avant Sprint 15 kickoff)**
   - [ ] Créer migrations DB (`automation_*` tables)
   - [ ] Setup repo `automation-runner` (boilerplate Node.js worker)
   - [ ] Snipara MCP tests (`rlm_orchestrate`)

3. **Content Prep (avant Sprint 16 kickoff)**
   - [ ] Luna rédige 10 premiers SOUL configs + prompts
   - [ ] Screenshots mockups pour template detail pages
   - [ ] Define template JSON schema (validation)

4. **Marketing Prep (pré-launch)**
   - [ ] Blog post draft "Automations for AI Agents"
   - [ ] Video demo (3 min) : prompt → workflow → execution
   - [ ] Twitter thread (10 tweets) : template lineup reveal

---

**Préparé par:** Luna 🧪  
**Pour review par:** Mike (CTO), Alex (Backend Lead), Philip (Frontend Lead)  
**Decision deadline:** 2026-02-28 EOD

---

*"Move fast, automate faster. Let's ship this."* — Luna 🚀
