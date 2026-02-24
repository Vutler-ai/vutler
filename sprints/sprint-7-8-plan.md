# Vutler - Sprint 7 & 8 Planning

**Product Manager:** Luna  
**Date:** 2026-02-20  
**Product:** Vutler - "Office 365 pour agents IA"  
**Status:** Post-MVP (Sprints 1-6 livrés)

---

## 🎯 Sprint 7: Production Ready
**Objectif:** Rendre Vutler utilisable par de vrais utilisateurs  
**Durée:** 2 semaines  
**Story Points Total:** 55

### US-701: Landing Page Publique
**En tant que** visiteur du site,  
**Je veux** découvrir ce qu'est Vutler et créer un compte facilement,  
**Afin de** comprendre la valeur du produit et m'inscrire sans friction.

**Critères d'acceptation:**
- Hero section avec value proposition claire ("Office 365 pour agents IA")
- Section features avec 3-4 use cases concrets (ex: support client, data analysis, automation)
- Pricing teaser (liens vers future pricing page)
- CTA "Start Free" menant à signup flow
- Design responsive (mobile + desktop)
- Temps de chargement < 2s

**Story Points:** 8  
**Priorité:** Must

---

### US-702: Onboarding Flow Complet
**En tant que** nouveau utilisateur,  
**Je veux** un parcours guidé de création de compte jusqu'à mon premier agent,  
**Afin de** devenir opérationnel en moins de 5 minutes.

**Critères d'acceptation:**
- Signup: email + password (validation, confirmation email)
- Workspace creation: nom + slug unique (ex: acme.vutler.ai)
- Wizard "Create Your First Agent" avec 3 templates au choix
- Template pré-configuré déployé en 1-click
- Message de bienvenue dans le chat avec l'agent
- Skip possible (bouton "I'll do this later")

**Story Points:** 13  
**Priorité:** Must

---

### US-703: Branding Cohérent
**En tant qu'** utilisateur de Vutler,  
**Je veux** une interface visuellement cohérente et professionnelle,  
**Afin de** faire confiance au produit et le recommander à mon équipe.

**Critères d'acceptation:**
- Logo Vutler appliqué partout (favicon, header, emails, login)
- Palette de couleurs définie et appliquée (primary, secondary, accent)
- Typography cohérente (headings, body, code)
- Composants UI standardisés (boutons, cards, modals)
- Dark mode opérationnel (si supporté par RC 8.1)

**Story Points:** 5  
**Priorité:** Must

---

### US-704: Email Notifications Fonctionnelles
**En tant qu'** utilisateur,  
**Je veux** recevoir des emails pour les événements importants,  
**Afin de** rester informé sans devoir vérifier l'app constamment.

**Critères d'acceptation:**
- Email de confirmation lors du signup
- Email d'invitation workspace (avec lien magic)
- Notifications configurables (mention, message direct, agent reply)
- Template emails branded (logo, couleurs Vutler)
- Unsubscribe link fonctionnel

**Story Points:** 5  
**Priorité:** Should

---

### US-705: Bug Fixes & UI Polish
**En tant qu'** utilisateur,  
**Je veux** une interface sans bugs majeurs et intuitive,  
**Afin de** pouvoir utiliser Vutler sans frustration.

**Critères d'acceptation:**
- Audit des 11 admin pages: erreurs console, responsive, UX
- Correction des top 10 bugs remontés en testing interne
- Loading states partout (spinners, skeletons)
- Error messages explicites (pas de "500 Internal Server Error")
- Tooltips sur les features complexes (Agent Builder, LLM Router)

**Story Points:** 8  
**Priorité:** Must

---

### US-706: Documentation Utilisateur Basique
**En tant que** nouvel utilisateur,  
**Je veux** accéder à une documentation claire,  
**Afin de** comprendre comment utiliser Vutler sans contacter le support.

**Critères d'acceptation:**
- Help Center accessible depuis app.vutler.ai/help
- 5 articles minimum: Getting Started, Create Agent, LLM Router, Templates, Billing
- Screenshots et GIFs explicatifs
- Search fonctionnelle
- Link "Help" dans la navbar

**Story Points:** 5  
**Priorité:** Should

---

### US-707: Performance & Monitoring
**En tant que** admin système,  
**Je veux** des outils de monitoring pour détecter les problèmes,  
**Afin de** garantir une disponibilité > 99%.

**Critères d'acceptation:**
- Health check endpoint (/api/health) avec status DB, Redis, Nginx
- Logs structurés (Winston ou équivalent)
- Alertes email si service down > 2 min
- Dashboard métrics (uptime, latency, errors) dans admin
- Backup automatique quotidien vérifié

**Story Points:** 8  
**Priorité:** Must

---

### US-708: Legal & Compliance
**En tant que** product owner,  
**Je veux** être en conformité légale,  
**Afin de** éviter des problèmes juridiques au lancement.

**Critères d'acceptation:**
- Page Terms of Service accessible (/terms)
- Page Privacy Policy (/privacy) avec mention RGPD
- Cookie banner (si analytics activé)
- Checkbox "I accept ToS" lors du signup
- Contact email support@vutler.ai fonctionnel

**Story Points:** 3  
**Priorité:** Must

---

## 💰 Sprint 8: Monetizable
**Objectif:** Pouvoir facturer les utilisateurs  
**Durée:** 2 semaines  
**Story Points Total:** 63

### US-801: Pricing Page & Plans
**En tant que** visiteur ou utilisateur,  
**Je veux** comprendre les prix et choisir un plan,  
**Afin de** souscrire à l'offre qui correspond à mes besoins.

**Critères d'acceptation:**
- Page /pricing avec 3 plans: Free, Pro ($29/mo), Enterprise (custom)
- Comparaison claire des features par plan (tableau)
- Limites explicites: agents, users, tokens/mois, support
- CTA "Upgrade to Pro" avec lien vers billing
- FAQ pricing (5 questions minimum)

**Story Points:** 5  
**Priorité:** Must

---

### US-802: Stripe Integration
**En tant qu'** utilisateur Pro,  
**Je veux** payer par carte bancaire de façon sécurisée,  
**Afin de** débloquer les fonctionnalités premium.

**Critères d'acceptation:**
- Stripe Checkout intégré (mode subscription)
- Webhooks: payment_succeeded, payment_failed, subscription_cancelled
- Stockage secure du Stripe Customer ID dans PG (table workspaces)
- Upgrade plan: Free → Pro en 1-click
- Invoices téléchargeables depuis /billing

**Story Points:** 13  
**Priorité:** Must

---

### US-803: Workspace Plans & Limites
**En tant que** workspace owner,  
**Je veux** voir mes limites d'usage en temps réel,  
**Afin de** savoir quand upgrader.

**Critères d'acceptation:**
- Limites par plan:
  - Free: 3 agents, 5 users, 100K tokens/mois
  - Pro: 50 agents, 50 users, 5M tokens/mois, priority support
  - Enterprise: unlimited, custom SLA
- Blocage soft si limite atteinte (banner "Upgrade to continue")
- Dashboard usage: agents actifs, users, tokens consommés ce mois
- Warning email à 80% de la limite

**Story Points:** 8  
**Priorité:** Must

---

### US-804: Usage Metering Dashboard
**En tant qu'** admin workspace,  
**Je veux** visualiser ma consommation de ressources,  
**Afin de** optimiser mes coûts et prévoir mon budget.

**Critères d'acceptation:**
- Graph tokens consommés (7 jours, 30 jours, custom)
- Breakdown par agent (top 10 consumers)
- Breakdown par LLM provider (OpenAI, Anthropic, etc.)
- Export CSV des données de consommation
- Estimation coût du mois en cours (si Pro)

**Story Points:** 8  
**Priorité:** Should

---

### US-805: Agent Templates Marketplace (Payants)
**En tant qu'** utilisateur,  
**Je veux** acheter des templates premium,  
**Afin de** déployer des agents avancés sans développement.

**Critères d'acceptation:**
- Templates gratuits (5 minimum) vs payants ($9-$49)
- Page /marketplace avec filtres (free/paid, category)
- Achat 1-click via Stripe (one-time payment)
- Template installé automatiquement après paiement
- Rating & reviews (pour Sprint 9+)

**Story Points:** 13  
**Priorité:** Could

---

### US-806: API Keys & Rate Limiting
**En tant que** développeur,  
**Je veux** générer des API keys pour intégrer Vutler,  
**Afin de** automatiser mes workflows.

**Critères d'acceptation:**
- Page /api-keys dans dashboard
- Génération de clés (format: vtl_live_xxxxx)
- Rate limiting par plan:
  - Free: 100 req/hour
  - Pro: 10K req/hour
  - Enterprise: custom
- Documentation API (/api-docs) avec exemples cURL
- Header `X-API-Key` supporté sur tous les endpoints

**Story Points:** 8  
**Priorité:** Should

---

### US-807: Downgrade & Churn Prevention
**En tant que** product manager,  
**Je veux** minimiser le churn,  
**Afin de** maximiser la LTV (Lifetime Value).

**Critères d'acceptation:**
- Flow de downgrade: Pro → Free (confirmation modal avec warning)
- Exit survey (5 options: trop cher, pas utilisé, manque features, autre)
- Email automatique 7j avant fin de trial ("Your trial ends soon")
- Offer de réduction si tentative de cancel (20% off 3 mois)
- Data exportable avant cancel définitif

**Story Points:** 5  
**Priorité:** Should

---

### US-808: Admin Analytics Dashboard
**En tant que** business owner,  
**Je veux** voir les métriques clés du business,  
**Afin de** prendre des décisions data-driven.

**Critères d'acceptation:**
- Metrics affichées:
  - MRR (Monthly Recurring Revenue)
  - Active workspaces (Free vs Pro vs Enterprise)
  - Churn rate (monthly)
  - Top agents (most used templates)
  - Total tokens consumed (all workspaces)
- Accessible uniquement par super-admin
- Refresh temps réel (ou toutes les 5min)

**Story Points:** 8  
**Priorité:** Should

---

## 📊 Récapitulatif

### Sprint 7 - Production Ready
| ID | Story | Points | Priorité |
|----|-------|--------|----------|
| US-701 | Landing Page Publique | 8 | Must |
| US-702 | Onboarding Flow Complet | 13 | Must |
| US-703 | Branding Cohérent | 5 | Must |
| US-704 | Email Notifications | 5 | Should |
| US-705 | Bug Fixes & UI Polish | 8 | Must |
| US-706 | Documentation Utilisateur | 5 | Should |
| US-707 | Performance & Monitoring | 8 | Must |
| US-708 | Legal & Compliance | 3 | Must |
| **TOTAL** | | **55** | |

**Vélocité recommandée:** 45-55 points (équipe de 3 devs + 1 designer)

---

### Sprint 8 - Monetizable
| ID | Story | Points | Priorité |
|----|-------|--------|----------|
| US-801 | Pricing Page & Plans | 5 | Must |
| US-802 | Stripe Integration | 13 | Must |
| US-803 | Workspace Plans & Limites | 8 | Must |
| US-804 | Usage Metering Dashboard | 8 | Should |
| US-805 | Templates Marketplace (Payants) | 13 | Could |
| US-806 | API Keys & Rate Limiting | 8 | Should |
| US-807 | Downgrade & Churn Prevention | 5 | Should |
| US-808 | Admin Analytics Dashboard | 8 | Should |
| **TOTAL** | | **68** | |

**Ajustement:** Si vélocité < 68, drop US-805 (Could) → Sprint 9

---

## 🚀 Critères de Succès

### Sprint 7
- ✅ Un utilisateur externe peut s'inscrire et créer son premier agent en < 5 min
- ✅ Zero bug bloquant en production
- ✅ Uptime > 99% sur 14 jours
- ✅ Legal compliance (ToS, Privacy)

### Sprint 8
- ✅ Premier paiement Stripe reçu
- ✅ MRR tracking fonctionnel
- ✅ Free users peuvent upgrade vers Pro sans friction
- ✅ Rate limiting opérationnel (pas d'abus API)

---

## 🎯 Definition of Done (DoD)

Pour chaque user story:
- [ ] Code reviewed & merged to `main`
- [ ] Tests unitaires (coverage > 80% sur nouveau code)
- [ ] Tests E2E pour flows critiques (signup, payment, agent creation)
- [ ] Documentation technique mise à jour
- [ ] Déployé sur VPS 83.228.222.180 (app.vutler.ai)
- [ ] QA validé par PM (Luna)
- [ ] Metrics & monitoring configurés

---

## 📝 Notes Techniques

### Stack Sprint 7-8
- **Frontend:** React + Rocket.Chat UI customization
- **Backend API:** Express.js (existing 14 endpoints + nouveaux)
- **Database:** PostgreSQL 16 (nouvelles tables: `plans`, `subscriptions`, `api_keys`, `usage_logs`)
- **Payment:** Stripe API (subscriptions + one-time payments)
- **Email:** Existing email integration (SMTP)
- **Monitoring:** Winston logs + custom health endpoint

### Nouvelles Tables PG (Sprint 8)
```sql
-- plans (id, name, price_monthly, limits_json)
-- subscriptions (workspace_id, stripe_subscription_id, plan_id, status)
-- api_keys (id, workspace_id, key_hash, rate_limit, created_at)
-- usage_logs (workspace_id, agent_id, tokens, timestamp)
```

### Environnement Variables à Ajouter
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
```

---

## ⚠️ Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Stripe integration complexe | Delay Sprint 8 | Spike technique 2j avant sprint |
| Onboarding trop long | Low conversion | A/B test avec version simplifiée |
| Limites trop restrictives (Free) | Churn early users | Analytics usage réel puis ajustement |
| Legal non-conforme RGPD | Blocage EU | Review avocat externe (1j) |

---

**Next Steps:**
1. Validation de ce plan avec l'équipe dev (go/no-go)
2. Sprint 7 kick-off: lundi 2026-02-24
3. Mise en place du board Jira/Linear avec ces US
4. Design mockups pour landing page & pricing (prio haute)

---

*Document créé par Luna - Product Manager @ Starbox Group*  
*Version 1.0 - 2026-02-20*
