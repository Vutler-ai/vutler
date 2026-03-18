# AGENDA.md — Schedule & Recurring Events

_Updated: 2026-03-12_

> Reality note: social scheduling is now managed by `social-media/WEEKLY-SOCIAL-PLAN.md` + active cron jobs.

## Daily Automations (Crons)
| Time | Agent | Task |
|------|-------|------|
| 08h, 12h, 16h, 20h | Sentinel 📰 | News intelligence fetch |
| 10h (L-V) | Marcus 📊 | Morning trading analysis |
| 12h (L-V) | Marcus 📊 | Noon trading report → WhatsApp |
| 20h (L-V) | Marcus 📊 | Evening review + portfolio update |
| 21h (L-V) | Marcus 📊 | Evening report → WhatsApp |
| 21h | Comité stratégique | Audit quotidien → WhatsApp |
| Every 4h | Rex 🛡️ | VPS health check |
| Every 30min | Snipara | Context sync |

## Vutler Ops Cadence (L-V)
| Time | Round | Checkpoint | Expected Output |
|------|-------|------------|-----------------|
| 08h00 | AM | Priorités + assignations | Owners confirmés, queue du matin verrouillée |
| 10h30 | AM | Check blocages | Escalade/reassign immédiate sur blockers |
| 12h00 | AM | Wrap-up | Preuves PROD_OK/BLOCKED + plan PM |
| 14h30 | PM | Priorités + assignations | Owners PM confirmés |
| 16h00 | PM | Check blocages | Escalade rapide + sécurisation progression |
| 17h30 | PM | Wrap-up final | Preuves PROD_OK/BLOCKED + plan J+1 |

## Social Media Calendar (active)
| Day | Time | Platform | Theme |
|-----|------|----------|-------|
| Mon-Fri | 09h30 | X | Daily priority theme (Vutler / Snipara / Vaultbrix / Build-in-public / GTM) |
| Tue, Thu | 12h30 | LinkedIn | Educational + operator insight (context, execution, compliance) |
| Mon-Fri | 17h30 | X | Proof/insight/CTA follow-up |

Source of truth posts and themes:
- `social-media/WEEKLY-SOCIAL-PLAN.md`

## Marcus Trading Reports (L-V) — à suivre
| Heure | Rapport | Delivery |
|-------|---------|----------|
| 10h00 | 📊 Morning trading (analyse + décisions) | Interne |
| 12h00 | 📊 Noon report (P&L + positions) | → WhatsApp Alex |
| 20h00 | 📊 Evening review (closing prices + lessons) | Interne |
| 21h00 | 📊 Evening report (résumé final) | → WhatsApp Alex |

*Marchés fermés week-end — pas de rapport Sam/Dim*

## Upcoming
- **2026-03-11 (mercredi 17h00)** — Sprint "Settings Pro" kickoff exécution (HIGH): lancer Chunk 0 (baseline+safety net), verrouiller flags, puis enchaîner chunks 1→9 avec gates `LOCAL_OK`/`PROD_OK`
- **2026-03-12 (jeudi 10h00)** — Sprint Onboarding: auto-provisioning Snipara (workspace→context/swarm, agent→memory+swarm join), + câblage shared context par type d’agent dans onboarding/création agent + onboarding client automatisé, avec livrables repo + copie Drive
- **2026-03-13 (vendredi 14h00)** — Roadmap R&D: évaluation CLI-Anything (HKUDS) sur use case Vutler/OpenClaw + décision GO/NO-GO
- **2026-03-14 (samedi 11h00)** — Roadmap automation commerciale/admin: rappels SLA/facturation/échéances (item 8)
- **2026-03-10 (mardi 12h00)** — Revue rapport investissements Marcus (Noon report) avec Alex
- **2026-03-16 (lundi 09h30)** — Kickoff Snipara Cron Tasks: design `rlm_cron_task` + plan migration hybride (cron ↔ swarm)
- **2026-03-08 (dimanche matin)** — Rapport 9h : résultats des 9 tâches de nuit
- **2026-03-08 (dimanche matin)** — Test Nexus Docker sur Mac (clone + dédié)
- **2026-03-08 (dimanche après-midi)** — Stripe + pricing final + DNS avec Alex
- **2026-03-08 (dimanche fin d'aprèm)** — Marketplace + templates déployables + intégrations
- **2026-03-08 (dimanche)** — Remettre Postiz en place (Colima Docker) pour posting X + LinkedIn
- **2026-03-09 (lundi)** — Marketplace suite + 15-20 templates + page améliorée

## Alex's Pending Decisions
- [ ] Stripe setup (6 produits, metering API)
- [ ] Go/no-go communication publique suite Starbox
- [ ] Review Vutler admin UI on app.vutler.ai (mobile)

## Cadence Ops/SOC2 verrouillée jusqu’à fin 2026
> Périmètre: Vutler VPS + Vaultbrix + SOC2 (Rex)

### Quotidien (tous les jours)
- **08:00, 14:00, 20:00 (Europe/Zurich)** — Rex: health check combiné Vaultbrix + Vutler VPS (containers, disk/memory, SSL, DB/API health)

### Hebdomadaire
- **Lundi 06:00** — Rex: security scan hebdo Vaultbrix (SOC2 CC7.1)

### Mensuel
- **Le 1er du mois à 08:00** — Rex: capacity planning Vaultbrix (SOC2 A1.2)

### Trimestriel / Semestriel / Annuel (SOC2)
- **Trimestriel** — access/risk reviews + IR drill (jobs SOC2 actifs)
- **Semestriel** — readiness SOC2
- **Annuel** — vendor review SOC2

Règle de suivi: alertes/résumés envoyés sur WhatsApp Alex.
