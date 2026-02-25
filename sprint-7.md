# Sprint 7 — Launch Prep, E2E Testing & Go-Live
**Dates:** 2026-05-12 → 2026-05-25 (2 semaines)
**Objectif:** Tout tester E2E, corriger les bugs, polish final, soft launch
**Capacité:** ~20 SP (focus qualité, pas features)

---

## ⚠️ Directives Sprint 7

**ZERO NEW FEATURES** — Sauf bugs critiques. Focus: test, polish, document, deploy.
**E2E MUST WORK** — Un user doit pouvoir: s'inscrire → configurer LLM → créer un agent → l'agent répond dans un channel.
**Launch checklist** — Tout doit être validé avant go-live.

---

## Stories Sprint 7

### 🔴 P0 — Must Ship

#### S7.1 — E2E Happy Path Testing (5 SP) — Mike
- [ ] Script de test complet: signup → login → add LLM provider → create agent → agent responds
- [ ] Test avec OpenAI (GPT-4o)
- [ ] Test avec Anthropic (Claude)
- [ ] Test avec MiniMax
- [ ] Test agent email send/receive
- [ ] Test Vutler Connect partner flow
- [ ] Fix all bugs found during testing

#### S7.2 — UI Bug Fixes & Polish (4 SP) — Philip
- [ ] Tester chaque page admin sur Chrome + Safari + mobile
- [ ] Fix responsive issues
- [ ] Vérifier que tous les formulaires valident correctement
- [ ] Error messages clairs et user-friendly
- [ ] Loading states sur tous les boutons/forms
- [ ] Intégrer le vrai logo Vutler (icosahedron) dans la sidebar admin + landing page
- [ ] Favicon correct partout (admin + RC + landing)

#### S7.3 — RC Branding Complete (3 SP) — Mike
- [ ] Remplacer TOUS les logos Rocket.Chat par Vutler
- [ ] Login page: logo Vutler + "Welcome to Vutler"
- [ ] Email templates: branding Vutler
- [ ] Browser tab title: "Vutler" partout
- [ ] Favicon RC: icosahedron Vutler
- [ ] About page: "Vutler by Starbox Group"

#### S7.4 — Documentation & README (2 SP) — Mike
- [ ] README.md complet (installation, config, API, architecture)
- [ ] docker-compose.yml documenté
- [ ] .env.example avec tous les params
- [ ] CHANGELOG.md mis à jour
- [ ] Contributing guide

### 🟡 P1 — Should Ship

#### S7.5 — Landing Page Polish (2 SP) — Philip
- [ ] Intégrer les vrais logos (icosahedron SVG)
- [ ] Screenshots de l'app réelle (pas de mockups)
- [ ] CTA "Get Started" → lien vers app.vutler.ai
- [ ] CTA "Request Demo" → formulaire email (ou mailto)
- [ ] SEO basics: meta tags, OG image, sitemap

#### S7.6 — Monitoring & Alerts (2 SP) — Mike
- [ ] Health check cron (every 5min)
- [ ] Alert si un service down (email à alex@vutler.com)
- [ ] Disk usage monitoring
- [ ] Auto-restart policy pour tous les containers

#### S7.7 — Backup Automation (2 SP) — Mike
- [ ] Cron backup PG + MongoDB (daily at 3AM)
- [ ] 7-day rotation
- [ ] Test restore procedure
- [ ] Document backup/restore process

---

## Total Sprint 7 : 20 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S7.1, S7.3, S7.4, S7.6, S7.7 | 14 SP |
| **Philip** 🎨 | S7.2, S7.5 | 6 SP |
| **Luna** 🧪 | E2E acceptance testing, UX review | — |
| **Jarvis** ⚡ | Launch coordination, DNS, SSL, go-live | — |

---

## Launch Checklist

- [ ] All E2E tests green
- [ ] vutler.ai DNS → 83.228.222.180 (propagated)
- [ ] SSL cert for vutler.ai + www.vutler.ai
- [ ] RC fully rebranded "Vutler"
- [ ] Landing page live at vutler.ai
- [ ] App live at app.vutler.ai
- [ ] Backup automated + tested
- [ ] Monitoring active
- [ ] README complete
- [ ] Admin account secured (strong password, 2FA if possible)
