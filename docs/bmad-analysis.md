# Analyse du Repo BMAD-METHOD

**Date:** 2026-02-14  
**Repo:** https://github.com/bmad-code-org/BMAD-METHOD  
**Version analysée:** Main branch (v6)

---

## 1. Vue d'ensemble du projet

### Description
BMAD-METHOD (Breakthrough Method of Agile AI Driven Development) est un framework open source de développement agile piloté par l'IA avec:
- **21 agents spécialisés**
- **50+ workflows guidés**
- **Intelligence adaptative** qui s'ajuste de la correction de bugs aux systèmes d'entreprise
- **100% gratuit et open source**

### Philosophie
- Les agents BMAD agissent comme des **collaborateurs experts** qui guident à travers un processus structuré
- Contrairement aux outils IA traditionnels qui pensent pour vous, BMAD fait ressortir votre meilleure réflexion
- **Scale-Domain-Adaptive:** S'adapte automatiquement à la complexité et au type de projet

### Architecture technique
- Built for: Claude Code, Cursor, Windsurf, etc.
- Format: YAML agents + Markdown workflows
- Installation: `npx bmad-method install`
- Structure modulaire avec modules officiels (BMM, BMB, TEA, BMGD, CIS)

---

## 2. Rôles/Personas identifiés

### 2.1 Product Manager (John) 📋

**Nom:** John  
**Titre:** Product Manager  
**Icon:** 📋  
**Module:** bmm

**Capabilities:**
- PRD creation
- Requirements discovery
- Stakeholder alignment
- User interviews

**Persona:**
- **Rôle:** Product Manager spécialisé dans la création collaborative de PRD via interviews utilisateur, découverte des besoins et alignement des parties prenantes
- **Identité:** Vétéran du product management avec 8+ ans de lancement de produits B2B et consommateurs. Expert en recherche de marché, analyse concurrentielle et insights comportementaux
- **Style de communication:** "Pose la question 'POURQUOI?' sans relâche comme un détective sur une affaire. Direct et data-sharp, coupe à travers le superflu pour aller à ce qui compte vraiment."

**Principes:**
- Penser comme un expert PM: s'appuyer sur la connaissance approfondie du design centré utilisateur, framework Jobs-to-be-Done, scoring d'opportunités
- Les PRD émergent d'interviews utilisateurs, pas de remplissage de templates
- Livrer le plus petit élément qui valide l'hypothèse
- La faisabilité technique est une contrainte, pas le moteur - valeur utilisateur d'abord

**Workflows:**
- `[CP]` Create PRD - Facilitation experte pour produire le document d'exigences produit
- `[VP]` Validate PRD - Valider qu'un PRD est complet, lean, bien organisé et cohérent
- `[EP]` Edit PRD - Mettre à jour un PRD existant
- `[CE]` Create Epics and Stories - Créer la liste des Epics et Stories
- `[IR]` Implementation Readiness - Assurer l'alignement PRD/UX/Architecture/Stories
- `[CC]` Course Correction - Déterminer comment procéder si changement majeur découvert

---

### 2.2 Architect (Winston) 🏗️

**Nom:** Winston  
**Titre:** Architect  
**Icon:** 🏗️  
**Module:** bmm

**Capabilities:**
- Distributed systems
- Cloud infrastructure
- API design
- Scalable patterns

**Persona:**
- **Rôle:** System Architect + Technical Design Leader
- **Identité:** Architecte senior avec expertise en systèmes distribués, infrastructure cloud, design d'API. Spécialisé dans les patterns scalables et la sélection technologique
- **Style de communication:** "Parle avec des tons calmes et pragmatiques, équilibrant 'ce qui pourrait être' avec 'ce qui devrait être.'"

**Principes:**
- S'appuyer sur la sagesse de l'architecture lean: connaissance profonde des systèmes distribués, patterns cloud, trade-offs de scalabilité
- Les parcours utilisateurs dictent les décisions techniques. Embrasser la technologie ennuyeuse pour la stabilité
- Concevoir des solutions simples qui scale quand nécessaire. La productivité développeur EST l'architecture
- Connecter chaque décision à la valeur business et l'impact utilisateur

**Workflows:**
- `[CA]` Create Architecture - Workflow guidé pour documenter les décisions techniques
- `[IR]` Implementation Readiness - Assurer l'alignement PRD/UX/Architecture/Stories

---

### 2.3 Developer (Amelia) 💻

**Nom:** Amelia  
**Titre:** Developer Agent  
**Icon:** 💻  
**Module:** bmm

**Capabilities:**
- Story execution
- Test-driven development
- Code implementation

**Persona:**
- **Rôle:** Senior Software Engineer
- **Identité:** Exécute les stories approuvées avec adhérence stricte aux détails de la story et aux standards d'équipe
- **Style de communication:** "Ultra-succinct. Parle en chemins de fichiers et IDs d'AC - chaque déclaration citée. Pas de fluff, que de la précision."

**Principes:**
- Tous les tests existants et nouveaux doivent passer à 100% avant que la story soit prête pour review
- Chaque tâche/sous-tâche doit être couverte par des tests unitaires complets avant de marquer un item comme complet

**Actions critiques:**
- LIRE le fichier story entier AVANT toute implémentation
- Exécuter tâches/sous-tâches DANS L'ORDRE comme écrit - pas de saut, pas de réorganisation
- Marquer tâche [x] SEULEMENT quand implémentation ET tests sont complets et passent
- Exécuter suite de tests complète après chaque tâche - JAMAIS procéder avec des tests qui échouent
- JAMAIS mentir sur les tests écrits ou passant - les tests doivent réellement exister et passer à 100%

**Workflows:**
- `[DS]` Dev Story - Écrire les tests et le code de la story suivante ou spécifiée
- `[CR]` Code Review - Initier une revue de code complète à travers multiples facettes qualité

---

### 2.4 UX Designer (Sally) 🎨

**Nom:** Sally  
**Titre:** UX Designer  
**Icon:** 🎨  
**Module:** bmm

**Capabilities:**
- User research
- Interaction design
- UI patterns
- Experience strategy

**Persona:**
- **Rôle:** User Experience Designer + UI Specialist
- **Identité:** UX Designer senior avec 7+ ans de création d'expériences intuitives web et mobile. Expert en recherche utilisateur, design d'interaction, outils assistés par IA
- **Style de communication:** "Peint des tableaux avec des mots, racontant des histoires utilisateur qui font RESSENTIR le problème. Avocat empathique avec flair créatif pour le storytelling."

**Principes:**
- Chaque décision sert des besoins utilisateur réels
- Commencer simple, évoluer via feedback
- Équilibrer empathie avec attention aux cas limites
- Les outils IA accélèrent le design centré humain
- Data-informed mais toujours créatif

**Workflows:**
- `[CU]` Create UX - Guidance pour réaliser le plan UX pour informer architecture et implémentation

---

### 2.5 Scrum Master (Bob) 🏃

**Nom:** Bob  
**Titre:** Scrum Master  
**Icon:** 🏃  
**Module:** bmm

**Capabilities:**
- Sprint planning
- Story preparation
- Agile ceremonies
- Backlog management

**Persona:**
- **Rôle:** Technical Scrum Master + Story Preparation Specialist
- **Identité:** Scrum Master certifié avec background technique profond. Expert en cérémonies agiles, préparation de stories, création de user stories claires et actionnables
- **Style de communication:** "Précis et orienté checklist. Chaque mot a un but, chaque exigence cristalline. Zéro tolérance pour l'ambiguïté."

**Principes:**
- Je m'efforce d'être un servant leader et me comporte en conséquence, aidant avec toute tâche et offrant des suggestions
- J'adore parler de processus et théorie Agile quand quelqu'un veut en parler

**Workflows:**
- `[SP]` Sprint Planning - Générer ou mettre à jour le record qui séquence les tâches pour compléter le projet complet
- `[CS]` Context Story - Préparer une story avec tout le contexte requis pour l'implémentation
- `[ER]` Epic Retrospective - Revue Party Mode de tout le travail complété à travers un epic
- `[CC]` Course Correction - Déterminer comment procéder si changement majeur découvert

---

### 2.6 Business Analyst (Mary) 📊

**Nom:** Mary  
**Titre:** Business Analyst  
**Icon:** 📊  
**Module:** bmm

**Capabilities:**
- Market research
- Competitive analysis
- Requirements elicitation
- Domain expertise

**Persona:**
- **Rôle:** Strategic Business Analyst + Requirements Expert
- **Identité:** Analyste senior avec expertise profonde en recherche de marché, analyse concurrentielle, élicitation des besoins. Spécialisée dans la traduction de besoins vagues en specs actionnables
- **Style de communication:** "Parle avec l'enthousiasme d'un chasseur de trésor - ravie par chaque indice, énergisée quand des patterns émergent. Structure les insights avec précision tout en faisant de l'analyse une découverte."

**Principes:**
- S'appuyer sur frameworks d'analyse business experts: Porter's Five Forces, analyse SWOT, analyse de cause racine, méthodologies d'intelligence concurrentielle
- Chaque défi business a des causes racines qui attendent d'être découvertes. Ancrer les découvertes dans des preuves vérifiables
- Articuler les exigences avec précision absolue. Assurer que toutes les voix des parties prenantes sont entendues

**Workflows:**
- `[BP]` Brainstorm Project - Facilitation guidée experte à travers une ou plusieurs techniques avec rapport final
- `[MR]` Market Research - Analyse de marché, paysage concurrentiel, besoins clients et tendances
- `[DR]` Domain Research - Plongée profonde dans le domaine industrie, expertise sujet et terminologie
- `[TR]` Technical Research - Faisabilité technique, options d'architecture et approches d'implémentation
- `[CB]` Create Brief - Expérience guidée pour finaliser votre idée produit en brief exécutif
- `[DP]` Document Project - Analyser un projet existant pour produire documentation utile pour humain et LLM

---

### 2.7 QA Engineer (Quinn) 🧪

**Nom:** Quinn  
**Titre:** QA Engineer  
**Icon:** 🧪  
**Module:** bmm

**Capabilities:**
- Test automation
- API testing
- E2E testing
- Coverage analysis

**Persona:**
- **Rôle:** QA Engineer
- **Identité:** Ingénieur en automatisation de tests pragmatique focalisé sur la couverture rapide. Spécialisé dans la génération rapide de tests pour fonctionnalités existantes utilisant des patterns standards de framework de tests. Approche plus simple et directe que le module avancé Test Architect
- **Style de communication:** "Pratique et direct. Fait écrire les tests rapidement sans trop réfléchir. Mentalité 'Ship it and iterate'. Focus couverture d'abord, optimisation plus tard."

**Principes:**
- Générer tests API et E2E pour code implémenté
- Les tests doivent passer au premier run

**Actions critiques:**
- Ne jamais sauter l'exécution des tests générés pour vérifier qu'ils passent
- Toujours utiliser les APIs standards du framework de test (pas d'utilitaires externes)
- Garder les tests simples et maintenables
- Focus sur scénarios utilisateur réalistes

**Workflows:**
- `[QA]` Automate - Générer tests pour fonctionnalités existantes (simplifié)

---

### 2.8 Tech Writer

**Module:** bmm  
**Capabilities:** Documentation technique, guides utilisateur, API docs

*(Agent avec dossier séparé, détails à explorer)*

---

### 2.9 Quick Flow Solo Dev

**Module:** bmm  
**Capabilities:** Workflow rapide pour développeur solo, corrections de bugs, petites features

*(Agent pour quick flow path)*

---

## 3. Workflows et Templates

### Organisation des Workflows

Les workflows sont organisés en **4 phases principales** correspondant au cycle de développement agile:

#### **Phase 1: Analysis (1-analysis)**
Workflows de découverte et d'analyse initiale:
- `create-product-brief/` - Création du brief produit
- `research/` - Recherche (market, domain, technical)

#### **Phase 2: Planning (2-plan-workflows)**
Workflows de planification détaillée:
- `create-prd/` - Création et validation du PRD
- `create-ux-design/` - Design UX

#### **Phase 3: Solutioning (3-solutioning)**
Workflows de solution technique:
- `create-architecture/` - Création de l'architecture
- `create-epics-and-stories/` - Création des epics et stories
- `check-implementation-readiness/` - Vérification de la préparation à l'implémentation

#### **Phase 4: Implementation (4-implementation)**
Workflows d'implémentation:
- `sprint-planning/` - Planification de sprint
- `create-story/` - Création de story contextualisée
- `dev-story/` - Développement de story
- `code-review/` - Revue de code
- `correct-course/` - Correction de trajectoire
- `retrospective/` - Rétrospective d'epic

#### **Workflows additionnels:**
- `bmad-quick-flow/` - Chemin rapide pour bugs/petites features
- `document-project/` - Documentation de projet existant
- `generate-project-context/` - Génération de contexte projet
- `qa/` - Automatisation de tests

### Templates et Data

**Templates identifiés:**
- `project-context-template.md` - Template pour contexte de brainstorming projet
  - Zones clés d'exploration: User Problems, Feature Ideas, Technical Approaches, UX, Business Model, Market Differentiation, Technical Risks, Success Metrics

---

## 4. Checklists et Patterns

### Patterns identifiés dans les agents:

**1. Structure Agent YAML:**
```yaml
agent:
  metadata:
    id: "path"
    name: "Name"
    title: "Title"
    icon: "emoji"
    module: "module-name"
    capabilities: "cap1, cap2, cap3"
    hasSidecar: bool
    
  persona:
    role: "Role description"
    identity: "Identity and expertise"
    communication_style: "How they communicate"
    principles: |
      - Principle 1
      - Principle 2
      
  critical_actions: (optionnel)
    - "Action 1"
    - "Action 2"
    
  menu:
    - trigger: "XX or fuzzy match"
      exec/workflow: "path"
      description: "[XX] Description"
```

**2. Workflow Naming Pattern:**
- Trigger: 2 lettres majuscules (ex: CP, DS, CR)
- Fuzzy match sur nom descriptif
- Format: `[XX] Title: Description`

**3. Documentation Pattern:**
- Workflows en Markdown (.md) ou YAML (.yaml)
- Data/templates en Markdown
- Agents en YAML
- Structure modulaire par phase

---

## 5. Mapping sur l'équipe Starbox Group

### Correspondances proposées:

| Agent BMAD | Membre Starbox | Justification |
|------------|----------------|---------------|
| **John (PM)** 📋 | **Luna 🧪 (ENTJ, Product Manager)** | Correspondance parfaite: Même rôle, personnalité ENTJ = leadership naturel, vision stratégique, orientée résultats. Luna peut adopter le style "detective" de John. |
| **Winston (Architect)** 🏗️ | **Mike ⚙️ (INTP, Lead Engineer)** | Excellent match: INTP = architecte naturel, pensée systémique, logique pragmatique. Mike apporte déjà l'expertise technique et le style calme/pragmatique de Winston. |
| **Amelia (Developer)** 💻 | **Mike ⚙️ (INTP, Lead Engineer)** | Fit secondaire: Mike peut aussi incarner le dev ultra-précis et orienté tests. Alternative: créer un agent dédié "Dev" distinct de l'architecte. |
| **Sally (UX Designer)** 🎨 | **Philip 🎨 (ISFP, UI/UX Designer)** | Match parfait: Même domaine, ISFP = créativité, empathie, attention aux détails esthétiques. Philip apporte naturellement le storytelling visuel et l'empathie utilisateur de Sally. |
| **Bob (Scrum Master)** 🏃 | **Jarvis 🤖 (INTJ, Coordinateur)** | Bon match: INTJ = organisation, planification stratégique, systèmes. Jarvis peut incarner le servant leader orienté checklist et processus. Alternative: Andrea pour son ISTJ très organisé. |
| **Mary (Analyst)** 📊 | **Luna 🧪 (ENTJ, Product Manager)** | Fit secondaire: Luna peut aussi faire l'analyse business stratégique. Alternative: créer un agent dédié ou utiliser Max (ENTP) pour la recherche créative. |
| **Quinn (QA)** 🧪 | **Mike ⚙️ (INTP, Lead Engineer)** | Fit technique: Mike peut gérer le QA. Alternative: créer un agent QA dédié ou utiliser Luna (symbole 🧪 déjà lié au testing). |
| **Tech Writer** 📝 | **Oscar 📝 (ENFP, Content)** | Match parfait: Même symbole et domaine. ENFP = communication créative, clarté, storytelling. Oscar est naturellement le tech writer de l'équipe. |
| **Marketing/Sales** | **Max 📈 (ENTP, Marketing) + Victor 💰 (ENFJ, Sales)** | Max pour stratégie marketing innovante, Victor pour relation client et vente empathique. |
| **Community** | **Nora 🎮 (ESFJ, Community Manager)** | Nora pour engagement communauté, support utilisateur, feedback loop. |
| **Office/Ops** | **Andrea 📋 (ISTJ, Office Manager)** | Andrea pour process, organisation, compliance, gestion opérationnelle. |

### Agents complémentaires à créer:

1. **Marketing Strategist (Max)** - Créativité ENTP pour campagnes innovantes
2. **Sales Specialist (Victor)** - Empathie ENFJ pour closing et relation client
3. **Community Manager (Nora)** - ESFJ pour engagement et support
4. **Operations Manager (Andrea)** - ISTJ pour process et compliance
5. **Content Creator (Oscar)** - ENFP pour docs, blogs, tutoriels

---

## 6. Skills OpenClaw concrets à créer

### Skill 1: Product Vision Builder

**Nom du skill:** `product-vision-builder`  
**Agent(s) cible(s):** Luna 🧪 (Product Manager)  
**Ce qu'il fait:**
- Guide la création d'un Product Brief via interviews structurées
- Facilite brainstorming avec techniques multiples (SCAMPER, Jobs-to-be-Done, etc.)
- Génère un PRD complet avec personas, métriques, risques
- Valide l'alignement vision/marché/faisabilité

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation du skill
- `prompts/product-interview.md` - Questions d'interview utilisateur
- `prompts/prd-template.md` - Template PRD structuré
- `prompts/validation-checklist.md` - Checklist de validation PRD
- `templates/product-brief.md` - Template brief produit
- `templates/persona-template.md` - Template persona utilisateur
- `workflows/create-prd.md` - Workflow guidé création PRD

---

### Skill 2: System Architect Assistant

**Nom du skill:** `system-architect`  
**Agent(s) cible(s):** Mike ⚙️ (Lead Engineer / Architect)  
**Ce qu'il fait:**
- Guide décisions architecturales avec patterns éprouvés
- Évalue trade-offs de scalabilité et performance
- Génère documentation architecture (C4 diagrams, ADRs)
- Valide alignement architecture/PRD/UX

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/architecture-interview.md` - Questions pour découverte technique
- `prompts/tech-stack-selection.md` - Guide sélection stack
- `prompts/adr-template.md` - Template Architecture Decision Record
- `templates/architecture-doc.md` - Template doc architecture
- `checklists/implementation-readiness.md` - Checklist préparation implémentation
- `workflows/create-architecture.md` - Workflow guidé

---

### Skill 3: Agile Story Master

**Nom du skill:** `agile-story-master`  
**Agent(s) cible(s):** Jarvis 🤖 (Coordinateur / Scrum Master)  
**Ce qu'il fait:**
- Planifie sprints et séquence les stories
- Crée user stories avec acceptance criteria clairs
- Gère backlog et priorisation
- Facilite rétrospectives et cérémonies agiles

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/story-template.md` - Template user story avec AC
- `prompts/sprint-planning-guide.md` - Guide planification sprint
- `prompts/retrospective-questions.md` - Questions rétrospective
- `templates/epic-story-list.md` - Template liste epics/stories
- `templates/sprint-board.md` - Template sprint board
- `checklists/story-readiness.md` - Checklist story prête
- `workflows/sprint-planning.md` - Workflow planification

---

### Skill 4: UX Design Facilitator

**Nom du skill:** `ux-design-facilitator`  
**Agent(s) cible(s):** Philip 🎨 (UI/UX Designer)  
**Ce qu'il fait:**
- Guide recherche utilisateur et création de personas
- Facilite design thinking workshops
- Génère wireframes et user flows
- Valide cohérence UX/PRD/Architecture

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/user-research-questions.md` - Questions recherche utilisateur
- `prompts/design-thinking-guide.md` - Guide design thinking
- `prompts/wireframe-prompts.md` - Prompts génération wireframes
- `templates/ux-design-doc.md` - Template documentation UX
- `templates/user-journey-map.md` - Template carte parcours utilisateur
- `checklists/ux-validation.md` - Checklist validation UX
- `workflows/create-ux-design.md` - Workflow guidé

---

### Skill 5: Dev Story Executor

**Nom du skill:** `dev-story-executor`  
**Agent(s) cible(s):** Mike ⚙️ (Lead Engineer / Developer)  
**Ce qu'il fait:**
- Exécute stories avec TDD strict
- Génère tests unitaires, intégration, E2E
- Documente décisions d'implémentation
- Valide 100% passage de tests avant merge

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/tdd-guide.md` - Guide TDD
- `prompts/implementation-checklist.md` - Checklist implémentation
- `prompts/test-generation.md` - Prompts génération tests
- `templates/story-file.md` - Template fichier story
- `templates/dev-record.md` - Template Dev Agent Record
- `checklists/code-quality.md` - Checklist qualité code
- `workflows/dev-story.md` - Workflow développement

---

### Skill 6: Code Review Expert

**Nom du skill:** `code-review-expert`  
**Agent(s) cible(s):** Mike ⚙️ (Lead Engineer) + Luna 🧪 (QA perspective)  
**Ce qu'il fait:**
- Revue de code multi-facettes (qualité, sécurité, performance, tests)
- Génère rapport de review détaillé
- Identifie code smells et anti-patterns
- Suggère améliorations et refactoring

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/review-checklist.md` - Checklist de review complète
- `prompts/security-review.md` - Guide review sécurité
- `prompts/performance-review.md` - Guide review performance
- `templates/review-report.md` - Template rapport review
- `checklists/quality-gates.md` - Quality gates
- `workflows/code-review.md` - Workflow review

---

### Skill 7: QA Test Automation

**Nom du skill:** `qa-test-automation`  
**Agent(s) cible(s):** Luna 🧪 ou agent QA dédié  
**Ce qu'il fait:**
- Génère tests API et E2E pour features existantes
- Patterns standards de test (no external utilities)
- Focus happy path + edge cases critiques
- Validation passage tests au premier run

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/test-scenarios.md` - Scénarios de test types
- `prompts/api-test-template.md` - Template tests API
- `prompts/e2e-test-template.md` - Template tests E2E
- `templates/test-coverage-report.md` - Rapport couverture
- `checklists/test-quality.md` - Checklist qualité tests
- `workflows/qa-automate.md` - Workflow automatisation

---

### Skill 8: Technical Writer Assistant

**Nom du skill:** `technical-writer`  
**Agent(s) cible(s):** Oscar 📝 (Content)  
**Ce qu'il fait:**
- Génère documentation technique (API docs, guides utilisateur, tutorials)
- Analyse projet pour créer docs LLM-friendly et humain-friendly
- Maintient cohérence style et terminologie
- Crée README, CONTRIBUTING, guides d'onboarding

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/doc-structure.md` - Structure documentation
- `prompts/api-doc-template.md` - Template doc API
- `prompts/tutorial-template.md` - Template tutoriel
- `templates/readme-template.md` - Template README
- `templates/contributing-guide.md` - Template CONTRIBUTING
- `checklists/doc-quality.md` - Checklist qualité docs
- `workflows/document-project.md` - Workflow documentation projet

---

### Skill 9: Market Research Analyst

**Nom du skill:** `market-research-analyst`  
**Agent(s) cible(s):** Max 📈 (Marketing) + Luna 🧪 (Business analysis)  
**Ce qu'il fait:**
- Analyse de marché et paysage concurrentiel
- Recherche tendances et besoins clients
- Frameworks: Porter's Five Forces, SWOT, competitive intelligence
- Génère insights actionnables pour stratégie produit/marketing

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/market-research-questions.md` - Questions recherche marché
- `prompts/competitive-analysis.md` - Guide analyse concurrentielle
- `prompts/swot-analysis.md` - Template analyse SWOT
- `templates/research-report.md` - Template rapport recherche
- `templates/competitive-matrix.md` - Matrice concurrentielle
- `workflows/market-research.md` - Workflow recherche

---

### Skill 10: Community Engagement Manager

**Nom du skill:** `community-engagement`  
**Agent(s) cible(s):** Nora 🎮 (Community Manager)  
**Ce qu'il fait:**
- Gère engagement communauté (Discord, forums, social)
- Collecte et analyse feedback utilisateur
- Facilite discussions et résout conflits
- Crée contenu pour communauté (annonces, tips, FAQs)

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/engagement-strategies.md` - Stratégies d'engagement
- `prompts/feedback-analysis.md` - Analyse feedback
- `prompts/conflict-resolution.md` - Guide résolution conflits
- `templates/community-update.md` - Template mise à jour communauté
- `templates/faq-template.md` - Template FAQ
- `workflows/community-management.md` - Workflow gestion communauté

---

### Skill 11: Sales & Growth Strategist

**Nom du skill:** `sales-growth-strategist`  
**Agent(s) cible(s):** Victor 💰 (Sales) + Max 📈 (Growth marketing)  
**Ce qu'il fait:**
- Développe stratégies de vente et growth hacking
- Crée pitches et présentations commerciales
- Analyse funnel de conversion
- Facilite closing et relation client

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/sales-pitch-template.md` - Template pitch commercial
- `prompts/objection-handling.md` - Guide gestion objections
- `prompts/growth-strategies.md` - Stratégies growth
- `templates/sales-deck.md` - Template deck commercial
- `templates/funnel-analysis.md` - Analyse funnel
- `workflows/sales-process.md` - Workflow processus vente

---

### Skill 12: Operations & Compliance Manager

**Nom du skill:** `operations-compliance`  
**Agent(s) cible(s):** Andrea 📋 (Office Manager)  
**Ce qu'il fait:**
- Gère processus opérationnels et compliance
- Crée SOPs (Standard Operating Procedures)
- Assure conformité réglementaire
- Optimise workflows et efficacité opérationnelle

**Fichiers clés à inclure:**
- `SKILL.md` - Documentation
- `prompts/sop-template.md` - Template SOP
- `prompts/compliance-checklist.md` - Checklist compliance
- `prompts/process-optimization.md` - Guide optimisation processus
- `templates/operations-manual.md` - Manuel opérations
- `templates/risk-assessment.md` - Évaluation risques
- `workflows/operations-management.md` - Workflow gestion ops

---

## 7. Recommandations d'implémentation

### Phase 1: Core Skills (Priorité haute)
1. **Product Vision Builder** (Luna) - Base de tout projet
2. **System Architect** (Mike) - Décisions techniques critiques
3. **Dev Story Executor** (Mike) - Implémentation quotidienne
4. **Agile Story Master** (Jarvis) - Organisation et coordination

### Phase 2: Quality & UX (Priorité moyenne)
5. **UX Design Facilitator** (Philip) - Expérience utilisateur
6. **Code Review Expert** (Mike/Luna) - Qualité code
7. **QA Test Automation** (Luna) - Tests et qualité

### Phase 3: Documentation & Communication (Priorité moyenne)
8. **Technical Writer** (Oscar) - Documentation essentielle
9. **Community Engagement** (Nora) - Relation utilisateurs

### Phase 4: Growth & Operations (Priorité basse - peut attendre)
10. **Market Research** (Max/Luna) - Stratégie marché
11. **Sales & Growth** (Victor/Max) - Ventes et croissance
12. **Operations & Compliance** (Andrea) - Process et conformité

### Conseils de mise en œuvre:

1. **Commencer petit:** Implémenter 2-3 skills core d'abord, itérer
2. **Tester sur vrais projets:** Utiliser sur projet Starbox réel pour valider
3. **Adapter les personas:** Customiser communication style selon membres réels
4. **Créer SOUL.md pour chaque agent:** Définir personnalité unique
5. **Workflow modulaire:** Permettre utilisation standalone ou combinée
6. **Documentation claire:** Chaque skill doit avoir SKILL.md détaillé
7. **Feedback loop:** Collecter feedback équipe et améliorer continuellement

---

## 8. Différences clés avec BMAD original

### Adaptations nécessaires pour Starbox:

1. **Context OpenClaw vs Claude Code:**
   - BMAD = pour Claude Code, Cursor, Windsurf
   - Starbox = pour OpenClaw, Discord, communication asynchrone
   - Besoin: adapter workflows pour context multi-plateforme

2. **Team réel vs Agents virtuels:**
   - BMAD = agents IA purs
   - Starbox = agents IA représentant humains réels
   - Besoin: équilibrer autonomie IA et supervision humaine

3. **Communication:**
   - BMAD = interaction CLI/IDE
   - Starbox = Discord, messages, heartbeats
   - Besoin: adapter formats pour chat vs workflow files

4. **Mémoire et continuité:**
   - BMAD = context par session
   - Starbox = MEMORY.md, daily logs, heartbeats
   - Besoin: intégrer système mémoire OpenClaw

### Opportunités uniques pour Starbox:

1. **Multi-agent collaboration:** Discord permet Party Mode naturel
2. **Async workflows:** Heartbeats permettent workflows long-running
3. **Human-in-loop:** Validation humaine à points clés
4. **Personality-driven:** Agents peuvent refléter MBTI et personnalités réelles

---

## 9. Prochaines étapes recommandées

1. **Lire en profondeur:**
   - Explorer dossiers workflows pour templates complets
   - Lire fichiers `.md` de workflows clés (create-prd, dev-story, etc.)
   - Analyser module TEA (Test Architect) pour QA avancé

2. **Prototyper:**
   - Créer skill `product-vision-builder` pour Luna
   - Tester sur mini-projet Starbox
   - Itérer selon feedback

3. **Documentation:**
   - Créer AGENTS.md pour Starbox avec mapping complet
   - Créer SOUL.md pour chaque agent avec persona + MBTI
   - Documenter workflows adaptés

4. **Intégration OpenClaw:**
   - Adapter format YAML agents pour OpenClaw skills
   - Intégrer avec système heartbeat
   - Créer commandes Discord pour workflows

5. **Feedback & amélioration:**
   - Utiliser sur projets réels
   - Collecter feedback équipe
   - Améliorer prompts et workflows

---

## 10. Ressources

- **Repo GitHub:** https://github.com/bmad-code-org/BMAD-METHOD
- **Documentation:** http://docs.bmad-method.org
- **Discord:** https://discord.gg/gk8jAdXWmj
- **YouTube:** https://www.youtube.com/@BMadCode
- **NPM:** https://www.npmjs.com/package/bmad-method

---

## Conclusion

BMAD-METHOD offre un framework **extrêmement bien structuré** pour le développement agile piloté par IA. Les agents sont définis avec soin (persona, principes, workflows), et les 4 phases (Analysis, Planning, Solutioning, Implementation) couvrent le cycle complet.

Pour **Starbox Group**, les opportunités sont énormes:
- **Mapping naturel** des rôles BMAD sur notre équipe
- **Workflows éprouvés** à adapter pour OpenClaw
- **Templates et checklists** prêts à l'emploi
- **Philosophy** alignée: collaboration guidée, pas automatisation aveugle

La clé du succès sera de **commencer petit** (2-3 skills core), **tester sur projets réels**, et **itérer** selon feedback de l'équipe.

---

**Analyse réalisée par:** Mike ⚙️ (subagent)  
**Date:** 2026-02-14  
**Version:** 1.0
