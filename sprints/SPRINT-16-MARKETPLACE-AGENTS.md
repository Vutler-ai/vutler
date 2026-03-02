# Sprint 16 — Marketplace d'Agents (20-30 Templates)

**Version:** 1.0  
**Date:** 2026-02-27  
**Owner:** Luna 🧪 (Product Manager)  
**Sprint Goal:** Passer de 12 à 20-30 agent templates prêts à déployer en one-click

---

## 🎯 Vision

Le Marketplace Vutler devient le **GitHub des agents AI**. Les utilisateurs découvrent, déploient et customisent des agents spécialisés en quelques clics. Pas de code, pas de configuration complexe — juste un catalogue de talents prêts à travailler.

**Impact Business:**
- ↗️ Conversion Free → Pro (templates premium)
- ↗️ Time-to-value (déploiement <2 min vs 2h de config manuelle)
- ↗️ Use case coverage (de 3 cas d'usage à 10+)

**État actuel:** 12 templates (Sprint 9.3)  
**Objectif Sprint 16:** 20-30 templates, 10+ catégories

---

## 📊 User Stories

### US-16.1 : Template Discovery (Catalogue Enrichi)
**En tant qu'** utilisateur Vutler,  
**Je veux** découvrir des agents spécialisés par catégorie et cas d'usage,  
**Pour** trouver rapidement le bon agent pour mon besoin.

**Acceptance Criteria:**
- [ ] Page `/marketplace` affiche 20-30 templates (cards)
- [ ] Filtres par catégorie : Customer Support, Sales, Marketing, HR, Legal, Finance, DevOps, Content, Analytics, Operations
- [ ] Filtres par pricing : Free, Pro, Enterprise
- [ ] Search bar : recherche par nom, description, tags
- [ ] Card template affiche :
  - [ ] Nom + icône
  - [ ] Description 1-liner
  - [ ] Tags (ex: "Email Automation", "Slack", "AI-Powered")
  - [ ] Pricing tier (badge Free/Pro/Enterprise)
  - [ ] Rating (⭐⭐⭐⭐⭐ basé sur reviews utilisateurs)
  - [ ] Nb de déploiements (ex: "1.2K deployments")
- [ ] Click → détail template avec README complet

**Estimation:** **5 story points**  
**Priorité:** P0 (Must-Have)  
**Tech Stack:** React, Fuselage Design System, PostgreSQL (agent_templates table)

---

### US-16.2 : Template Detail Page (Showcase Complet)
**En tant qu'** utilisateur Vutler,  
**Je veux** comprendre en profondeur ce qu'un agent peut faire avant de le déployer,  
**Pour** m'assurer qu'il correspond à mon besoin.

**Acceptance Criteria:**
- [ ] Page `/marketplace/:template_id` affiche :
  - [ ] Header : Nom, icône, description longue, pricing
  - [ ] Section "What It Does" : bullets points des capacités
  - [ ] Section "SOUL & Personality" : MBTI, tone, style (ex: "ENTJ, direct, efficient")
  - [ ] Section "Tools & Integrations" : logos des outils utilisés (email, Slack, Notion, etc.)
  - [ ] Section "Example Conversations" : 3-5 exemples d'interactions
  - [ ] Section "Suggested Automations" : workflows pré-configurés (si Sprint 15 terminé)
  - [ ] Section "Reviews" : avis utilisateurs (5 derniers)
  - [ ] CTA : "Deploy Agent" (bouton principal)
- [ ] README.md au format Markdown (affiché avec syntax highlighting)
- [ ] Screenshots/GIFs optionnels (uploaded par template creator)

**Estimation:** **8 story points**  
**Priorité:** P0 (Must-Have)  

---

### US-16.3 : One-Click Deploy (Sans Configuration)
**En tant qu'** utilisateur Vutler non-technique,  
**Je veux** déployer un agent en 1 click sans éditer de config,  
**Pour** être opérationnel en <2 minutes.

**Acceptance Criteria:**
- [ ] Bouton "Deploy Agent" sur template detail page
- [ ] Click → modale "Deploy [Agent Name]"
- [ ] Champs pré-remplis (modifiables) :
  - [ ] Agent Name (ex: "Support Bot")
  - [ ] Email Address (ex: "support@mycompany.com")
  - [ ] Workspace (dropdown si multi-workspace)
- [ ] Bouton "Deploy Now"
- [ ] Backend :
  - [ ] Crée un agent dans `agents` table
  - [ ] Copie la config du template dans `agent_configs`
  - [ ] Lance le container OpenClaw (via Docker API)
  - [ ] Assigne l'email et les channels (si applicable)
- [ ] Confirmation : "✅ Support Bot deployed! Go to Dashboard."
- [ ] Redirect vers `/agents/:agent_id` (dashboard de l'agent)

**Estimation:** **5 story points**  
**Priorité:** P0 (Must-Have)  

---

### US-16.4 : One-Click Deploy (Avec Customisation Avancée)
**En tant qu'** power user Vutler,  
**Je veux** customiser un template avant de le déployer (tools, system prompt, MBTI),  
**Pour** adapter l'agent à mon contexte spécifique.

**Acceptance Criteria:**
- [ ] Bouton "Customize & Deploy" sur template detail page
- [ ] Page `/marketplace/:template_id/customize` avec formulaire :
  - [ ] **Identity** : Name, Email, Avatar
  - [ ] **Personality** : MBTI (dropdown), Tone (dropdown: Friendly/Professional/Casual)
  - [ ] **System Prompt** : Textarea avec prompt pré-rempli (modifiable)
  - [ ] **Tools** : Checkboxes (Email, Web Search, Memory, Slack, etc.)
  - [ ] **Integrations** : API keys pour tools activés (ex: Notion API key)
  - [ ] **Resource Limits** : CPU (0.5-2 cores), Memory (512MB-2GB)
- [ ] Preview en temps réel : "Your agent will be able to..."
- [ ] Bouton "Deploy Customized Agent"
- [ ] Sauvegarde la config customisée dans `agent_configs`
- [ ] Lance le container avec les params customisés

**Estimation:** **13 story points**  
**Priorité:** P1 (Should-Have)  

---

### US-16.5 : Template Authoring (Créer et Publier un Template)
**En tant qu'** power user ou Vutler team member,  
**Je veux** créer un nouveau template et le publier sur le marketplace,  
**Pour** partager mes configs avec la communauté.

**Acceptance Criteria:**
- [ ] Page `/marketplace/create` (accessible uniquement si role=admin ou power_user)
- [ ] Formulaire :
  - [ ] **Metadata** : Name, Description, Icon (upload), Category, Tags
  - [ ] **Pricing Tier** : Free, Pro, Enterprise (affecte visibility)
  - [ ] **SOUL Config** : MBTI, Personality traits, Communication style
  - [ ] **System Prompt** : Textarea (Markdown preview)
  - [ ] **Tools** : Multi-select (email, web_search, memory, etc.)
  - [ ] **Suggested Automations** : JSON editor (optionnel, si Sprint 15 done)
  - [ ] **README** : Markdown editor avec preview
  - [ ] **Example Conversations** : JSON array (user message → agent response)
- [ ] Validation :
  - [ ] Name unique dans `agent_templates`
  - [ ] System prompt <5000 chars
  - [ ] Au moins 1 tool activé
- [ ] Bouton "Publish Template"
- [ ] Insert dans `agent_templates` avec status='published'
- [ ] Apparaît immédiatement dans le marketplace

**Estimation:** **13 story points**  
**Priorité:** P1 (Should-Have)  

---

### US-16.6 : Template Categories & Stats
**En tant qu'** Vutler admin,  
**Je veux** voir les stats de popularité des templates (déploiements, reviews),  
**Pour** prioriser le développement de nouveaux templates et retirer les impopulaires.

**Acceptance Criteria:**
- [ ] Dashboard admin `/admin/marketplace/stats`
- [ ] Table des templates avec colonnes :
  - [ ] Name, Category, Pricing Tier
  - [ ] Total Deployments (count)
  - [ ] Active Agents (deployed et status=running)
  - [ ] Avg Rating (⭐ 1-5)
  - [ ] Total Reviews (count)
  - [ ] Last Deployed (timestamp)
- [ ] Tri par colonne (clickable headers)
- [ ] Filtres : Category, Pricing, Status (published/draft/archived)
- [ ] Export CSV (pour analysis externe)

**Estimation:** **5 story points**  
**Priorité:** P2 (Nice-to-Have)  

---

### US-16.7 : Template Reviews & Ratings
**En tant qu'** utilisateur ayant déployé un agent,  
**Je veux** laisser un avis sur le template,  
**Pour** aider d'autres utilisateurs à choisir.

**Acceptance Criteria:**
- [ ] Sur template detail page : section "Reviews"
- [ ] Bouton "Write a Review" (si user a déployé ce template)
- [ ] Modale review :
  - [ ] Rating : ⭐ 1-5 (star selector)
  - [ ] Title : Input court (ex: "Perfect for customer support!")
  - [ ] Comment : Textarea (max 1000 chars)
  - [ ] Bouton "Submit Review"
- [ ] Insert dans `agent_template_reviews` (nouvelle table)
- [ ] Review apparaît sous le template (modéré si flagged)
- [ ] Calcul automatique de avg_rating dans `agent_templates`

**Estimation:** **8 story points**  
**Priorité:** P1 (Should-Have)  

---

## 📋 20-30 Templates Lineup (Détail)

### **Customer Support (4 templates)**
1. **Support Bot Classic** — FAQ auto-response, ticket routing, sentiment analysis
2. **Multilingual Support** — Détecte la langue, répond dans 10+ langues
3. **Escalation Manager** — Trie les tickets par urgence, escalade au support humain
4. **Chatbot Widget** — Embedded chat pour sites web (via iframe)

### **Sales (3 templates)**
5. **Lead Qualifier** — Score les leads, enrichit les données (Clearbit API)
6. **Meeting Scheduler** — Propose des créneaux, envoie invitations Calendar
7. **Follow-Up Specialist** — Relance automatique après 3 jours sans réponse

### **Marketing (4 templates)**
8. **Content Writer** — Génère des blog posts, newsletters, social posts
9. **SEO Optimizer** — Analyse les pages, suggère keywords, meta descriptions
10. **Email Campaign Manager** — A/B testing, segmentation, automated drip campaigns
11. **Social Media Manager** — Planifie des posts Twitter/LinkedIn, engage avec mentions

### **HR (3 templates)**
12. **Recruiter Assistant** — Parse CVs, schedule interviews, send rejections
13. **Onboarding Buddy** — Guide nouveaux employés (FAQs, tasks, resources)
14. **Employee Feedback Analyzer** — Analyse les surveys, détecte sentiment

### **Legal (2 templates)**
15. **Contract Reviewer** — Highlight risks dans les contrats (NDA, SaaS agreements)
16. **Compliance Checker** — Vérifie GDPR, CCPA, SOC2 compliance

### **Finance (3 templates)**
17. **Expense Tracker** — Parse receipts, catégorise dépenses, export QuickBooks
18. **Invoice Chaser** — Relance les factures impayées, génère reports aging
19. **Budget Analyst** — Analyse cash flow, alerte si dépassement budget

### **DevOps (3 templates)**
20. **Incident Manager** — Détecte incidents (via PagerDuty), crée post-mortems
21. **Deploy Assistant** — Deploy sur Railway/Vercel, rollback si erreurs
22. **Code Reviewer** — Review PRs GitHub, suggère améliorations (via Snipara context)

### **Content & Media (3 templates)**
23. **Podcast Show Notes Generator** — Transcription audio → notes structurées
24. **Video Script Writer** — Génère scripts YouTube/TikTok avec hooks
25. **Newsletter Curator** — Agrège news, génère résumés, envoie weekly digest

### **Analytics & Data (2 templates)**
26. **Data Analyst** — Queries SQL, génère charts, insights business
27. **Report Generator** — Automated weekly/monthly reports (PDF, email)

### **Operations (3 templates)**
28. **Task Automator** — Crée des tasks Notion/Linear depuis emails/Slack
29. **Meeting Notes Bot** — Join Zoom calls, transcrit, extrait action items
30. **Workflow Optimizer** — Analyse les workflows existants, suggère automations (meta!)

---

## 🗂️ Database Schema (Modifications)

```sql
-- Agent templates (existe déjà, on ajoute colonnes)
ALTER TABLE agent_templates
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN (
    'customer_support', 'sales', 'marketing', 'hr', 'legal', 
    'finance', 'devops', 'content', 'analytics', 'operations'
)),
ADD COLUMN IF NOT EXISTS pricing_tier TEXT DEFAULT 'free' CHECK (pricing_tier IN ('free', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]', -- ["email", "slack", "ai-powered"]
ADD COLUMN IF NOT EXISTS icon_url TEXT,
ADD COLUMN IF NOT EXISTS example_conversations JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS suggested_automations JSONB DEFAULT '[]', -- Workflows from Sprint 15
ADD COLUMN IF NOT EXISTS deployment_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(2,1) DEFAULT 0.0, -- 0.0-5.0
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- Template reviews
CREATE TABLE agent_template_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT REFERENCES agents(id), -- L'agent déployé depuis ce template
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title TEXT,
    comment TEXT,
    is_flagged BOOLEAN DEFAULT FALSE, -- Moderation flag
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, template_id) -- Un user ne peut review qu'une fois par template
);

-- Template deployments (tracking)
CREATE TABLE agent_template_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES agent_templates(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    customized BOOLEAN DEFAULT FALSE, -- True si config modifiée
    deployed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_templates_category ON agent_templates(category);
CREATE INDEX idx_agent_templates_pricing ON agent_templates(pricing_tier);
CREATE INDEX idx_agent_templates_status ON agent_templates(status);
CREATE INDEX idx_template_reviews_template ON agent_template_reviews(template_id);
CREATE INDEX idx_template_reviews_rating ON agent_template_reviews(rating);
CREATE INDEX idx_template_deployments_template ON agent_template_deployments(template_id);
CREATE INDEX idx_template_deployments_user ON agent_template_deployments(user_id);

-- Trigger pour mettre à jour deployment_count
CREATE OR REPLACE FUNCTION update_template_deployment_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_templates 
    SET deployment_count = (
        SELECT COUNT(*) FROM agent_template_deployments 
        WHERE template_id = NEW.template_id
    )
    WHERE id = NEW.template_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_deployment_count
AFTER INSERT ON agent_template_deployments
FOR EACH ROW
EXECUTE FUNCTION update_template_deployment_count();

-- Trigger pour mettre à jour avg_rating
CREATE OR REPLACE FUNCTION update_template_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_templates
    SET avg_rating = (
        SELECT AVG(rating)::NUMERIC(2,1)
        FROM agent_template_reviews
        WHERE template_id = COALESCE(NEW.template_id, OLD.template_id)
    )
    WHERE id = COALESCE(NEW.template_id, OLD.template_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_avg_rating_insert
AFTER INSERT ON agent_template_reviews
FOR EACH ROW
EXECUTE FUNCTION update_template_avg_rating();

CREATE TRIGGER trg_update_avg_rating_update
AFTER UPDATE ON agent_template_reviews
FOR EACH ROW
EXECUTE FUNCTION update_template_avg_rating();
```

---

## 🔧 API Endpoints

### Marketplace Discovery
```bash
GET    /api/v1/marketplace/templates                # Liste templates (avec filtres)
GET    /api/v1/marketplace/templates/:id            # Détail template
GET    /api/v1/marketplace/categories               # Liste catégories + counts
GET    /api/v1/marketplace/search?q=support         # Search full-text
```

### Template Deployment
```bash
POST   /api/v1/marketplace/templates/:id/deploy    # Deploy template (one-click)
POST   /api/v1/marketplace/templates/:id/customize # Deploy avec custom config
GET    /api/v1/marketplace/deployments              # Mes déploiements
```

### Template Management (Admin/Power Users)
```bash
POST   /api/v1/marketplace/templates/create         # Créer template
PUT    /api/v1/marketplace/templates/:id            # Modifier template
DELETE /api/v1/marketplace/templates/:id            # Archiver template
PUT    /api/v1/marketplace/templates/:id/publish    # Publish draft
```

### Reviews & Ratings
```bash
GET    /api/v1/marketplace/templates/:id/reviews    # Reviews d'un template
POST   /api/v1/marketplace/templates/:id/reviews    # Créer review
PUT    /api/v1/marketplace/reviews/:id              # Modifier ma review
DELETE /api/v1/marketplace/reviews/:id              # Supprimer ma review
POST   /api/v1/marketplace/reviews/:id/flag         # Flag review (moderation)
```

### Stats (Admin)
```bash
GET    /api/v1/admin/marketplace/stats               # Stats globales
GET    /api/v1/admin/marketplace/templates/:id/stats # Stats par template
```

---

## 🏗️ Template Config Format (JSON)

```json
{
  "id": "template-support-bot-classic",
  "name": "Support Bot Classic",
  "description": "AI-powered customer support agent. Auto-responds to FAQs, routes tickets, analyzes sentiment.",
  "category": "customer_support",
  "pricing_tier": "free",
  "tags": ["email", "slack", "sentiment-analysis", "faq"],
  "icon_url": "https://cdn.vutler.team/icons/support-bot.svg",
  
  "soul": {
    "mbti": "ESFJ",
    "personality_traits": ["empathetic", "patient", "solution-oriented"],
    "communication_style": "friendly, professional",
    "tone": "warm"
  },
  
  "system_prompt": "You are a helpful customer support agent for {{company_name}}. Your goal is to resolve customer issues quickly and empathetically. Always:\n- Greet warmly\n- Ask clarifying questions\n- Provide solutions with links to docs\n- Escalate to human if needed\n\nKnowledge base: {{knowledge_base_url}}",
  
  "tools": [
    {
      "name": "email",
      "enabled": true,
      "config": {
        "smtp_host": "{{user_smtp_host}}",
        "from_address": "{{agent_email}}"
      }
    },
    {
      "name": "web_search",
      "enabled": true
    },
    {
      "name": "memory",
      "enabled": true,
      "config": {
        "snipara_collection": "customer-support-kb"
      }
    },
    {
      "name": "sentiment_analysis",
      "enabled": true
    }
  ],
  
  "suggested_automations": [
    {
      "name": "Auto-respond FAQ emails",
      "description": "When email contains 'pricing' or 'refund', auto-respond with FAQ",
      "workflow_json": { /* workflow from Sprint 15 */ }
    }
  ],
  
  "example_conversations": [
    {
      "user": "I can't log in to my account. Help!",
      "agent": "Hi there! I'm sorry to hear you're having trouble logging in. Let's fix this together. Could you tell me:\n1. What error message do you see?\n2. Have you tried resetting your password?\n\nIn the meantime, here's our login troubleshooting guide: https://help.vutler.team/login"
    },
    {
      "user": "What's your refund policy?",
      "agent": "Great question! Our refund policy is:\n- 30-day money-back guarantee for all plans\n- No questions asked\n- Refunds processed within 5-7 business days\n\nFull details: https://vutler.team/refund-policy\n\nWould you like me to start a refund for you?"
    }
  ],
  
  "customizable_fields": [
    "company_name",
    "knowledge_base_url",
    "agent_email",
    "smtp_host"
  ],
  
  "resource_limits": {
    "cpu_cores": 0.5,
    "memory_mb": 512
  },
  
  "created_by": "vutler-team",
  "published_at": "2026-02-20T10:00:00Z"
}
```

---

## 📦 Dépendances

### Techniques
- **Vaultbrix PostgreSQL** — Tables `agent_templates`, `agent_template_reviews`, `agent_template_deployments`
- **Sprint 2** — Agent creation flow (réutilisé pour deployment)
- **Sprint 15** — Suggested automations (optionnel, ajouté si Sprint 15 terminé)
- **Docker API** — Lancement containers pour déploiement
- **Fuselage Design System** — UI components (cards, filters, modals)

### Business
- **Aucune dépendance bloquante** — Peut être développé en parallèle de Sprint 15

---

## ⚠️ Risques

### R1 — Quality Control des Templates (PROBABILITÉ: Élevée, IMPACT: Critique)
**Risque:** Templates de mauvaise qualité (prompts inefficaces, outils mal configurés) déployés par la communauté.  
**Mitigation:**
- Review process : tous les templates community passent en moderation (status='draft' → 'published' après validation)
- Criteria de qualité : 
  - System prompt >200 chars
  - Au moins 1 example conversation
  - Tests automatisés : deploy template → run 5 test prompts → check responses
- Badge "Verified by Vutler" pour templates officiels

### R2 — Template Sprawl (PROBABILITÉ: Moyenne, IMPACT: Moyen)
**Risque:** Trop de templates similaires (ex: 10 "Support Bots"), utilisateurs perdus.  
**Mitigation:**
- Curation : Vutler team choisit "Featured Templates" (max 10 affichés en premier)
- Search & filter UX forte (tags, catégories, ratings)
- Deduplication : si 2 templates >80% similaires, suggérer merge

### R3 — Customisation Complexity (PROBABILITÉ: Moyenne, IMPACT: Moyen)
**Risque:** Users non-techniques bloqués par les champs de customisation (ex: "What's a system prompt?").  
**Mitigation:**
- Two-tier deploy : "Quick Deploy" (no config) + "Advanced Deploy" (full config)
- Tooltips explicatifs sur chaque champ
- Defaults intelligents : si aucun input, utiliser config template par défaut

### R4 — Pricing Tier Confusion (PROBABILITÉ: Faible, IMPACT: Moyen)
**Risque:** Users Free essayent de déployer templates Enterprise, frustration.  
**Mitigation:**
- Badge pricing visible sur chaque card
- Lors du deploy : si tier incompatible, afficher "Upgrade to Pro to deploy this template"
- Free tier : accès à 5-10 templates basiques

### R5 — Template Versioning (PROBABILITÉ: Faible, IMPACT: Élevé)
**Risque:** Template mis à jour, agents déployés avec ancienne version cassent.  
**Mitigation:**
- Phase 1 (MVP) : Pas de versioning, templates immuables après publish
- Phase 2 (post-Sprint 16) : Versioning system (v1.0, v1.1, etc.), agents auto-update ou opt-in

---

## 🎯 Definition of Done

- [ ] Marketplace affiche 20-30 templates (US-16.1)
- [ ] Template detail page complète (US-16.2)
- [ ] One-click deploy fonctionnel (US-16.3)
- [ ] Advanced customization flow (US-16.4)
- [ ] Template authoring tool (US-16.5)
- [ ] Admin stats dashboard (US-16.6)
- [ ] Review & rating system (US-16.7)
- [ ] 20-30 templates seedés dans la DB (JSON configs)
- [ ] Tests E2E : 5 scénarios (discover → deploy → review)
- [ ] Documentation : "How to Create a Template" guide
- [ ] Marketing : Blog post "30 Agent Templates to Automate Your Business"

---

## 📊 Total Story Points : **57 SP**

**Recommandation Luna:**  
Sprint faisable en 2 semaines si on parallélise :
- **Track 1 (Frontend)** — US-16.1, 16.2 (Philip)
- **Track 2 (Backend)** — US-16.3, 16.4, 16.5 (Mike, Alex)
- **Track 3 (Content)** — Créer les 20-30 templates JSON configs (Luna + community)

**Priorisation si besoin de couper :**
- **Must-Have (P0)** — US-16.1, 16.2, 16.3 (35 SP) : Core marketplace + one-click deploy
- **Should-Have (P1)** — US-16.4, 16.5, 16.7 (34 SP) : Customization + authoring + reviews
- **Nice-to-Have (P2)** — US-16.6 (5 SP) : Admin stats (peut attendre Sprint 17)

---

## 🚀 Success Metrics

### Product Metrics
- **Deployment Rate:** 30% des users Free déploient au moins 1 template dans les 7 premiers jours
- **Template Diversity:** Au moins 50% des déploiements répartis sur 5+ templates différents (pas 90% sur "Support Bot")
- **Customization Rate:** 20% des déploiements utilisent "Advanced Deploy" (vs quick deploy)

### Business Metrics
- **Conversion Free → Pro:** +15% (templates Pro attirent upgrades)
- **Time-to-First-Agent:** <2 min (vs 30 min sans marketplace)
- **Retention D7:** +10% (agents déployés = engagement)

### Quality Metrics
- **Avg Template Rating:** ≥4.0/5.0
- **Review Rate:** 10% des deployments laissent une review
- **Template Failure Rate:** <5% (agents déployés qui crashent dans les 24h)

---

## 📝 Template Content Production Plan

### Phase 1 — Vutler Team (20 templates)
**Week 1:**
- Luna : Rédige 10 SOUL configs + system prompts (Customer Support, Sales, Marketing, HR)
- Mike : Configure tools + Docker configs pour 10 templates
- Alex : Seed database avec JSON configs

**Week 2:**
- Luna : 10 templates restants (Legal, Finance, DevOps, Content, Analytics)
- Philip : Screenshots + example conversations
- Team : Review & publish

### Phase 2 — Community (10+ templates)
**Post-Sprint 16:**
- Open template authoring aux power users
- Incentive : Featured template creators get free Pro tier (1 year)
- Moderation : Luna reviews tous les templates community avant publish

---

**Signature:** Luna 🧪  
**Status:** Ready for Sprint Planning  
**Dependencies:** Sprint 2 (done), Sprint 15 (optional for suggested_automations)
