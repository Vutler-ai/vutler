# Vutler Pricing Study
> Rédigé par Luna, Product Manager — vutler.ai  
> Date : 17 février 2026  
> Version : 1.0 (pré-soft launch)

---

## Sommaire

1. [Analyse concurrentielle](#1-analyse-concurrentielle)
2. [Grille tarifaire Vutler](#2-grille-tarifaire-vutler)
3. [Détail features par plan](#3-détail-features-par-plan)
4. [Coûts infra estimés par utilisateur](#4-coûts-infra-estimés-par-utilisateur)
5. [Recommandations et justifications](#5-recommandations-et-justifications)
6. [Métriques de conversion attendues](#6-métriques-de-conversion-attendues)

---

## 1. Analyse concurrentielle

### 1.1 Contexte du marché

Le marché se segmente en deux grandes familles :

- **Chat/assistant IA** (ChatGPT, Claude, Copilot) : focalisés sur l'utilisateur humain, pas les agents autonomes multi-instances
- **Plateformes d'agents IA** (Relevance AI, CrewAI, Dust.tt, Lindy) : focalisées sur l'orchestration de workflows automatisés, pas sur la persistance identitaire des agents

**Vutler se positionne différemment** : un _workspace vivant_ où les agents ont une identité, une mémoire, et coexistent avec les humains dans des channels, à la manière d'une équipe. Ni assistant, ni workflow runner — un environnement de travail mixte humains/IA.

---

### 1.2 Tableau comparatif

| Produit | Modèle pricing | Prix entry-level | Prix team | Agents multi | Mémoire persistante | BYOLLM | Identité agent | Local agent |
|---|---|---|---|---|---|---|---|---|
| **ChatGPT Plus/Teams** | Par siège | $20/mois | $25/siège | Non (1 ChatGPT) | Partielle | Non | Non | Non |
| **ChatGPT Pro** | Par siège | $200/mois | — | Non | Oui | Non | Non | Non |
| **Claude Pro/Teams** | Par siège | $20/mois | $25/siège | Non (1 Claude) | Oui (Projects) | Non | Non | Non |
| **Claude Max** | Par siège | $100+/mois | $100/siège | Non | Oui | Non | Non | Non |
| **Microsoft Copilot** | Add-on M365 | $30/user/mois | $30/user/mois | Non | Limité | Non | Non | Partiel |
| **Relevance AI** | Par actions | $0 (200 actions) | $29/mois (2.5K actions) | Oui (multi-agent) | Via tools | Oui (Pro+) | Non | Non |
| **CrewAI Cloud** | Par exécutions | $0 (50 exec) | $25/mois (100 exec) | Oui (framework) | Non natif | Oui | Non | Non |
| **LangGraph Cloud** | Par compute | Usage-based | ~$40-500+/mois | Oui (framework) | Externe | Oui | Non | Non |
| **Dust.tt** | Par siège | Contact | ~$29/user | Oui (workspaces) | Via connectors | Non | Non | Non |
| **Lindy.ai** | Par assistant | $49.99/mois (Pro) | Enterprise | Non (1 Lindy) | Oui (apprend) | Non | Partiel | Non |
| **Fixie.ai / AI SDK** | Developer | $0 (OSS) | Usage-based | Oui (dev-focused) | Non natif | Oui | Non | Non |
| **🌟 Vutler** | Par workspace | **$0 (Free)** | **$29/mois** | **Oui (natif)** | **Oui (Snipara)** | **Oui (tous plans)** | **Oui (SOUL.md)** | **Oui** |

---

### 1.3 Analyse détaillée par concurrent

#### ChatGPT Teams/Enterprise (OpenAI)
- **Teams** : $25/siège/mois (min 2 sièges) — pas de formation sur les données, contexte plus long
- **Enterprise** : tarif custom, SSO, API admin, sécurité avancée
- **Limite critique** : 1 seul ChatGPT partagé par l'équipe, pas d'agents distincts avec identité propre
- **Opportunité pour Vutler** : nos agents ont une SOUL, des skills spécifiques, une mémoire ciblée

#### Claude Teams/Max (Anthropic)
- **Pro** : $20/mois (annuel) ou $20/mois
- **Teams** : $25/siège/mois (annuel) ou $25/mois — Projects partagés, SSO
- **Max** : $100/siège/mois — usage intensif
- **Limite critique** : un seul modèle "Claude" partagé, pas multi-agent natif
- **Opportunité** : Vutler peut inclure Claude _comme LLM_ (BYOLLM) tout en offrant le workspace multi-agent

#### Microsoft Copilot
- **$30/user/mois** en add-on Microsoft 365
- Profondément intégré à M365, mais uniquement assistant IA sur contenu Office/Teams
- **Limite critique** : lock-in Microsoft total, pas d'agents autonomes, pas de mémoire agent
- **Opportunité** : entreprises non-Microsoft, ou qui veulent agents en dehors de l'écosystème

#### Relevance AI
- **Free** : 200 actions/mois (très limité), 1 workforce, 1 user
- **Pro** : $29/mois → 2.500 actions + BYOLLM + multi-workforces
- **Team** : $349/mois → 7.000 actions, 50 users, A/B testing
- **Enterprise** : custom
- **Verdict** : focalisé sur l'exécution de tâches (actions), pas sur la vie des agents. Pas d'identité persistante. Pricing actions peut exploser vite.

#### CrewAI Cloud
- **Free** : 50 exécutions/mois (trop limité)
- **Pro** : $25/mois → 100 exécutions incluses, puis $0.50/exécution
- **Enterprise** : custom (K8s, VPC)
- **Verdict** : outil pour développeurs, pas de workspace humain-IA. Pas de mémoire native, pas de channels.

#### LangGraph Cloud (LangSmith)
- **Developer** : usage-based, ~$0.005/step
- **Plus** : $39/mois + usage
- **Enterprise** : custom
- **Verdict** : infrastructure technique (observabilité, déploiement de graphes), pas un workspace. Nécessite dev expertise.

#### Dust.tt
- **Pro** : ~$29/user/mois — agents avec accès GitHub, Notion, Slack, etc.
- Focus sur le knowledge management et les assistants intégrés aux outils existants
- **Verdict** : le plus proche de Vutler conceptuellement, mais agents = assistants Q&A sur docs, pas d'identité autonome ni d'outils actifs (shell, email, browser)

#### Lindy.ai
- **Pro** : $49.99/mois — 1 assistant personnel IA (Lindy)
- **Enterprise** : custom, multi-sièges
- Focus sur productivité personnelle (inbox, calendar, réunions)
- **Verdict** : 1 seul agent = Lindy, pas de multi-agent. Pas BYOLLM. Très cher pour ce que c'est.

---

### 1.4 Gaps du marché (opportunités Vutler)

1. **Identité agent persistante** — aucun concurrent n'a l'équivalent de SOUL.md
2. **Mémoire persistante native** — Snipara intégré = différenciateur majeur
3. **Workspace mixte humain+IA** — channels Rocket.Chat style, agents comme membres de l'équipe
4. **BYOLLM sur tous les plans** — Relevance AI le limite au Pro+, Lindy/ChatGPT/Claude ne le permettent pas
5. **Agent local (CLI/daemon)** — aucun concurrent n'a de pont local→cloud aussi direct
6. **Multi-agent natif dès le Free** — Relevance AI limite à 1 workforce en free

---

## 2. Grille tarifaire Vutler

### Vue d'ensemble

| | **Free** | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|---|
| **Prix mensuel** | $0 | $29/mois | $79/mois | Sur devis |
| **Prix annuel** | $0 | $23/mois *(–20%)* | $63/mois *(–20%)* | Sur devis |
| **Facturé annuel** | — | $276/an | $756/an | — |
| **Agents inclus** | 1 | 3 | 10 | Illimités |
| **Users humains** | 1 | 3 | 15 | Illimités |
| **LLM** | BYOLLM | BYOLLM + $5 crédits | BYOLLM + $20 crédits | BYOLLM + crédits custom |
| **Mémoire (Snipara)** | Basique (gratuit) | Pro ($19 inclus) | Team ($49 inclus) | Enterprise (inclus) |
| **Agent local** | Add-on $5/mois | Inclus | Inclus | Inclus |
| **Messages/mois** | 500 | 5.000 | Illimité* | Illimité* |
| **Stockage fichiers** | 500 MB | 5 GB | 50 GB | 500 GB+ |
| **Support** | Community | Email | Priority | Dédié |

*Fair use — pas de hard limit absurde, rate limiting raisonnable

---

### 2.1 Plan Free — $0/mois

> **Cible** : Développeurs, curieux, early adopters qui veulent tester un vrai workspace agent IA

**Philosophie** : Pas un jouet. Le Free doit être *genuinement utile* pour un individu avec sa propre LLM key. On veut l'accrocher, pas le frustrer.

**Inclus :**
- 1 agent IA avec SOUL.md (identité complète)
- 1 user humain
- BYOLLM (OpenAI, Anthropic, Groq, Ollama...)
- 500 messages/mois (≈17/jour — raisonnable pour tester)
- Mémoire Snipara niveau Free (5.000 queries initiales)
- Channels (jusqu'à 5)
- Outils de base : shell, fichiers, recherche web
- 500 MB stockage
- Historique 30 jours
- App web + CLI de base
- **Agent local : add-on $5/mois** (optionnel)

**Non inclus :**
- Crédits LLM (100% BYOLLM)
- Email agent (Postal) → Starter+
- Browser automation → Starter+
- Multi-agent collaboration
- Channels privés avancés
- Support prioritaire

**Raison d'upgrader** : "Mon agent est super utile mais j'ai besoin d'un 2e agent spécialisé" ou "Je veux l'email et le browser"

---

### 2.2 Plan Starter — $29/mois ($23/mois annuel)

> **Cible** : Freelances, solopreneurs, consultants indépendants, early adopters qui monetisent

**Philosophie** : Un vrai setup de travail. Agent assistant + agent spécialisé + les outils qui font la différence.

**Inclus :**
- 3 agents IA (chacun avec SOUL.md + mémoire distincte)
- 3 users humains
- BYOLLM **+** $5/mois crédits LLM inclus (≈ 1M tokens GPT-4o-mini ou ~50K tokens Claude Sonnet)
- Mémoire Snipara Pro ($19/mois inclus — valeur réelle !)
- 5.000 messages/mois
- Channels illimités
- **Tous les outils** : shell, fichiers, web, email (Postal), browser
- **Agent local inclus** (CLI/daemon)
- 5 GB stockage
- Historique 90 jours
- Support email (48h)

**Valeur clé** : l'agent local inclus + Snipara Pro = stack complète pour un freelance autonome

**Non inclus :**
- Workspaces multiples
- SSO
- Audit logs
- API access (rate-limité)

---

### 2.3 Plan Growth — $79/mois ($63/mois annuel)

> **Cible** : Petites équipes (2-10 personnes), startups, agences

**Philosophie** : La collaboration humain+IA à l'échelle d'une vraie équipe. Les agents travaillent avec les humains, pas juste pour eux.

**Inclus :**
- 10 agents IA
- 15 users humains
- BYOLLM **+** $20/mois crédits LLM inclus (≈ 5M tokens GPT-4o-mini ou ~200K tokens Claude Sonnet)
- Mémoire Snipara Team ($49/mois inclus)
- Messages illimités (fair use)
- **Channels partagés multi-agent** (agents dans les mêmes channels)
- **Tous les outils** inclus + intégrations (Slack, GitHub, Notion, Google Workspace)
- Agent local inclus (pour tous les membres)
- 50 GB stockage
- Historique illimité
- Analytics workspace (messages, usage agents, coûts LLM)
- Support prioritaire (24h)
- API access complet

**Non inclus :**
- SSO (SAML/OIDC)
- Audit logs avancés
- Déploiement on-premise
- SLA garanti

---

### 2.4 Plan Enterprise — Sur devis

> **Cible** : Grandes entreprises, orgas avec exigences sécurité/compliance

**Philosophie** : Vutler dans leur infrastructure, avec nos agents.

**Inclus :**
- Agents illimités
- Users illimités
- BYOLLM + crédits LLM négociés
- Snipara Enterprise (mémoire étendue, isolation par département)
- Messages illimités
- **SSO (SAML, OIDC, Azure AD)**
- **Audit logs complets**
- **RBAC avancé** (rôles par department, per-agent permissions)
- Déploiement cloud dédié ou on-premise
- SLA 99.9% garanti
- Support dédié (Slack direct, account manager)
- Custom integrations
- Contrats annuels, facturation sur PO/invoice

**Fourchette tarifaire indicative** : $500–$5.000+/mois selon usage

---

## 3. Détail features par plan

### 3.1 Agents & Identité

| Feature | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Nombre d'agents | 1 | 3 | 10 | Illimité |
| SOUL.md (identité) | ✅ | ✅ | ✅ | ✅ |
| Mémoire persistante | Basique | Snipara Pro | Snipara Team | Snipara Enterprise |
| Mémoire cross-sessions | ✅ | ✅ | ✅ | ✅ |
| BYOLLM | ✅ | ✅ | ✅ | ✅ |
| Crédits LLM inclus | ❌ | $5/mois | $20/mois | Négociable |
| Modèles supportés | Tous* | Tous* | Tous* | Tous* + privés |

*OpenAI, Anthropic, Google Gemini, Groq, Mistral, Ollama (local)

### 3.2 Workspace & Channels

| Feature | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Channels | 5 | Illimité | Illimité | Illimité |
| DMs humain↔agent | ✅ | ✅ | ✅ | ✅ |
| Channels multi-agent | ❌ | ❌ | ✅ | ✅ |
| Threads | ✅ | ✅ | ✅ | ✅ |
| Fichiers dans channels | ✅ | ✅ | ✅ | ✅ |
| Search full-text | Basique | ✅ | ✅ | ✅ avancée |
| Historique messages | 30 jours | 90 jours | Illimité | Illimité |

### 3.3 Outils agents

| Outil | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Shell (exec commands) | ✅ | ✅ | ✅ | ✅ |
| Fichiers (read/write) | ✅ | ✅ | ✅ | ✅ |
| Recherche web | ✅ | ✅ | ✅ | ✅ |
| Email (Postal) | ❌ | ✅ | ✅ | ✅ |
| Browser automation | ❌ | ✅ | ✅ | ✅ |
| Canvas (UI rendu) | ❌ | ✅ | ✅ | ✅ |
| MCP servers custom | ❌ | ✅ | ✅ | ✅ |
| API webhooks entrants | ❌ | ✅ | ✅ | ✅ |
| Cron/scheduling | ❌ | ✅ | ✅ | ✅ |

### 3.4 Agent local (CLI/daemon)

| Feature | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Agent local | Add-on $5/mois | ✅ Inclus | ✅ Inclus | ✅ Inclus |
| Accès fichiers locaux | ✅ | ✅ | ✅ | ✅ |
| Sync mémoire local↔cloud | ✅ | ✅ | ✅ | ✅ |
| Multi-machine | ❌ | 1 machine | 3 machines | Illimité |
| Heartbeat/monitoring | ❌ | ✅ | ✅ | ✅ |

### 3.5 Administration & Sécurité

| Feature | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Users | 1 | 3 | 15 | Illimité |
| Rôles (admin/member) | Basique | ✅ | ✅ | RBAC avancé |
| SSO (SAML/OIDC) | ❌ | ❌ | ❌ | ✅ |
| SCIM | ❌ | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ❌ | Basique | ✅ Complet |
| 2FA | ✅ | ✅ | ✅ | ✅ + forcé |
| Chiffrement at-rest | ✅ | ✅ | ✅ | ✅ AES-256 |
| SLA | — | — | — | 99.9% |

### 3.6 Stockage & Limites

| Limite | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Messages/mois | 500 | 5.000 | Illimité* | Illimité* |
| Stockage fichiers | 500 MB | 5 GB | 50 GB | 500 GB+ |
| Taille fichier max | 10 MB | 50 MB | 200 MB | 2 GB |
| Mémoire Snipara (docs) | Projet 1, ~54 fichiers | 5 projets | 20 projets | Illimité |
| API rate limit | 60 req/min | 300 req/min | 1.000 req/min | Custom |
| Rétention données | 30 jours inactif | 1 an | Illimité | Illimité |

---

## 4. Coûts infra estimés par utilisateur

### 4.1 Composantes de coût

#### Snipara (mémoire agent)
| Plan Vutler | Plan Snipara utilisé | Coût Snipara/mois |
|---|---|---|
| Free | Free (gratuit jusqu'à 1 projet) | $0 |
| Starter | Pro | $19 |
| Growth | Team | $49 |
| Enterprise | Enterprise | Négocié |

#### Hosting (cloud)
Estimations pour une infra Rocket.Chat fork + PostgreSQL + Redis sur VPS/cloud :

| Composante | Coût mensuel estimé |
|---|---|
| Serveur principal (8 vCPU, 16 GB RAM) | $80–120/mois |
| PostgreSQL RDS (db.t3.medium) | $50–70/mois |
| Redis (cache/sessions) | $15–25/mois |
| Stockage S3-compatible | $0.023/GB |
| CDN + bande passante | $20–50/mois |
| **Total infra de base** | **~$165–265/mois** |

#### Postal (email agents)
- Hosting Postal : $20–40/mois (VPS dédié)
- Coût à l'usage : ~$0.001/email (SMTP sortant)
- Budget mensuel estimé : $30–60/mois

#### Monitoring, backup, CI/CD
- Sentry (erreurs) : $0–26/mois
- Backup (S3) : $5–15/mois
- **Total monitoring** : $5–41/mois

---

### 4.2 Coût par utilisateur selon plan

Hypothèse : 100 utilisateurs Free, 20 Starter, 5 Growth

#### Plan Free (100 users)
| Coût | Montant |
|---|---|
| Snipara | $0 |
| Infra partagée (fraction) | ~$1.50/user |
| Stockage moyen 200 MB | ~$0.005/user |
| Postal (quasi nul, pas d'email) | $0 |
| **Total coût/user Free** | **~$1.50/user/mois** |
| **Revenu** | **$0** |
| **Déficit/user Free** | **-$1.50/mois** |

→ **100 users Free = ~$150/mois de pertes** — acceptable en acquisition

#### Plan Starter ($29/mois)
| Coût | Montant |
|---|---|
| Snipara Pro | $19 |
| Infra partagée | ~$3/user |
| Stockage moyen 2 GB | ~$0.05/user |
| Postal (email agent) | ~$1/user |
| Crédits LLM inclus ($5) | $5 |
| **Total coût/user Starter** | **~$28/mois** |
| **Revenu** | **$29/mois** |
| **Marge brute/user** | **~$1/mois (3.4%)** |

⚠️ Marge très faible sur Starter. Options :
1. Négocier Snipara à volume (objectif : $12–15 au lieu de $19 à 50+ clients)
2. Réduire légèrement les crédits LLM inclus (passer à $3)
3. Target Starter à $34/mois (confort margin ≈ 20%)

#### Plan Growth ($79/mois)
| Coût | Montant |
|---|---|
| Snipara Team | $49 |
| Infra (plus heavy usage) | ~$8/workspace |
| Stockage moyen 15 GB | ~$0.35/workspace |
| Postal | ~$3/workspace |
| Crédits LLM ($20) | $20 |
| **Total coût Growth** | **~$80/mois** |
| **Revenu** | **$79/mois** |
| **Marge brute** | **-$1/mois (~0%)** |

⚠️ Growth est également très serré à cause du Snipara Team. Solutions :
1. **Négociation Snipara prioritaire** : si on peut avoir Snipara Team à $30 à volume, marge = +$19 = 24%
2. Passer Growth à $89/mois → marge $9 = 11% (acceptable post-négociation Snipara)
3. Ajouter des add-ons payants (stockage extra, agents supplémentaires)

#### Modèle viable à volume (100+ clients payants)
Avec négociation Snipara et économies d'échelle sur l'infra :

| Plan | Prix | Coût réel | Marge |
|---|---|---|---|
| Free | $0 | $1.50 | -$1.50 |
| Starter | $29 | ~$20 | $9 (31%) |
| Growth | $79 | ~$55 | $24 (30%) |
| Enterprise | $500+ | $150–300 | $200–350 (40–70%) |

**→ Objectif rentabilité : 30 Starter + 5 Growth = $870 + $395 = $1.265/mois revenu, coûts ≈ $880/mois → breakeven**

---

### 4.3 Seuil de rentabilité

Infra fixe mensuelle estimée (avant variable) : **~$250/mois**

| Scénario | Starter | Growth | Revenu | Coût | Résultat |
|---|---|---|---|---|---|
| Early (mois 3) | 10 | 2 | $448 | $470 | -$22/mois |
| Traction (mois 6) | 30 | 8 | $1.502 | $1.030 | +$472/mois |
| Growth (mois 12) | 80 | 25 | $4.295 | $2.600 | +$1.695/mois |
| Scale (mois 18) | 150 | 60 | $9.090 | $5.200 | +$3.890/mois |

*Hors Enterprise qui change tout à partir d'un seul deal*

---

## 5. Recommandations et justifications

### 5.1 Recommandation #1 — Ajuster le Starter à $34/mois

**Problème** : À $29/mois avec Snipara Pro à $19, la marge brute est quasi nulle.

**Recommandation** : $34/mois mensuel / $27/mois annuel
- Permet 15–20% de marge même sans négociation Snipara
- Reste sous le seuil psychologique $35
- La valeur perçue (agent local + Snipara Pro + email + browser) justifie largement ce prix face aux $49.99 de Lindy (qui offre juste un assistant)

**Alternative** : Garder $29 et réduire les crédits LLM de $5 à $2 (économie $3/user/mois)

---

### 5.2 Recommandation #2 — Négocier Snipara dès le jour 1

Le coût Snipara est le principal risque sur la marge. Il faut :
1. **Obtenir un deal partenaire Snipara** : tarif volume pour Vutler (ex : $10/projet au lieu de $19 à partir de 50 clients)
2. **Proposer un cross-selling** : Snipara bénéficie d'être notre layer mémoire → deal win-win
3. **Court-terme** : envisager de ne donner Snipara Pro qu'à partir de 1 mois d'utilisation (réduction du churn immédiat qui pompe les crédits)

---

### 5.3 Recommandation #3 — L'agent local comme driver de rétention

Le CLI/daemon local est unique sur le marché. Il faut :
- Le rendre **gratuit** à partir du Starter (pas juste inclus, mais mis en avant comme feature star)
- Pour le Free, $5/mois est justifié car c'est un vrai différenciateur technique
- Créer du lock-in sain : plus l'agent local est utile (accès aux fichiers, à la machine), moins l'utilisateur partira

---

### 5.4 Recommandation #4 — BYOLLM comme argument central

**Avantage compétitif majeur** : ChatGPT, Claude, Lindy = lock-in LLM. Vutler = liberté.

Communication : *"Bring your own keys. Switch models anytime. No vendor lock-in."*

Cela permet aussi :
- De ne pas assumer le coût LLM pour les Free users
- De se positionner comme neutre et ouvert
- D'attirer les developers qui ont déjà des accès OpenAI/Anthropic/Groq

---

### 5.5 Recommandation #5 — Différenciateurs à mettre en avant (pas le prix)

Ne pas vendre sur le prix. Vendre sur :

1. **"Vos agents ont une identité"** → SOUL.md (unique sur le marché)
2. **"Votre agent se souvient"** → Mémoire Snipara cross-sessions
3. **"Vos agents travaillent avec vous"** → Channels mixtes, pas des bots isolés
4. **"Vos agents touchent votre machine"** → Agent local
5. **"Vous choisissez votre LLM"** → BYOLLM, pas de dépendance

---

### 5.6 Recommandation #6 — Add-ons à proposer (revenu complémentaire)

| Add-on | Prix | Cible |
|---|---|---|
| Agent local (Free) | $5/mois | Free users qui veulent l'accès local |
| Agent supplémentaire | $9/agent/mois | Starter qui a besoin d'un 4e agent |
| Stockage extra | $2/10 GB/mois | Tous plans |
| Crédits LLM extra | $10/10$ crédits | Starter/Growth qui dépassent |
| Workspace supplémentaire | $15/workspace/mois | Growth avec multi-projets |
| White-label agent | $50/mois | Agencies |

---

### 5.7 Recommandation #7 — Lancement : Free + Starter uniquement

Pour le soft launch :
1. Lancer **Free + Starter** uniquement
2. Mettre **Growth "Early Bird"** à $59/mois (prix de lancement, -25%)
3. **Enterprise** = waitlist seulement
4. Collecter les retours avant de figer les limites définitives

---

## 6. Métriques de conversion attendues

### 6.1 Benchmarks industrie SaaS

| Métrique | Benchmark SaaS | Benchmark Freemium AI |
|---|---|---|
| Free → Paid (mois 1) | 2–5% | 3–8% |
| Free → Paid (mois 3) | 5–10% | 8–15% |
| Starter → Growth (mois 6) | 10–20% | 15–25% |
| Churn mensuel Starter | 3–7% | 5–10% |
| Churn mensuel Growth | 1–3% | 2–5% |
| LTV/CAC ratio (objectif) | >3x | >4x |

### 6.2 Objectifs Vutler (12 mois post-launch)

| Mois | Free users | Starter | Growth | Enterprise | MRR |
|---|---|---|---|---|---|
| M1 | 100 | 5 | 0 | 0 | $145 |
| M3 | 300 | 20 | 3 | 0 | $817 |
| M6 | 700 | 60 | 12 | 1 | $3.288 |
| M9 | 1.200 | 120 | 30 | 2 | $6.750 |
| M12 | 2.000 | 200 | 60 | 5 | $10.540 |

*MRR M12 = (200 × $29) + (60 × $79) + (5 × $500) = $5.800 + $4.740 + $2.500 = $13.040*

### 6.3 Triggers de conversion identifiés

**Free → Starter** : déclenché par...
- Atteinte de la limite 500 messages/mois (~25% des actifs)
- Besoin d'un 2e agent (spécialisation)
- Vouloir l'email ou le browser automation
- Vouloir l'agent local sans payer $5/mois séparé

**Starter → Growth** : déclenché par...
- Équipe qui rejoint (3 users atteints)
- Besoin de 4e agent ou plus
- Besoin de channels multi-agent
- Analytics workspace nécessaires

**Growth → Enterprise** : déclenché par...
- SSO requis (IT dept)
- Compliance/audit logs
- Volume d'agents > 10
- Besoin SLA garanti

### 6.4 Stratégie de conversion Free→Paid

1. **In-app nudges** : "Vous avez utilisé 80% de vos messages ce mois" → CTA Upgrade
2. **Feature teasing** : dans le Free, montrer les features Starter désactivées (agent local greyed out, email "🔒 Starter")
3. **Usage-based urgency** : pas de blocage brutal, mais ralentissement progressif après limite (message delay de 2-3 secondes)
4. **Onboarding email** J+3 : "Votre agent a une mémoire — voici comment la rendre plus puissante" → Snipara Pro
5. **Early bird** : $23/mois au lieu de $29 pour les 100 premiers Starter

---

## Appendice : Résumé exécutif pour présentation

### Vutler en 3 chiffres

- **$0** pour démarrer (Free genuinement utile, pas un jouet)
- **$29/mois** pour un workspace agent IA complet (vs $49.99 Lindy, $25 ChatGPT Teams sans multi-agent)
- **$79/mois** pour une équipe de 15 personnes + 10 agents (vs $375/mois ChatGPT Teams pour 15 sièges)

### Notre USP pricing

> "Le seul workspace où vos agents ont une identité, une mémoire, et peuvent utiliser vos outils — avec votre LLM, pas le nôtre."

### Prochaines étapes

- [ ] Négocier deal volume avec Snipara (priorité #1 avant launch)
- [ ] Définir les limites techniques exactes du Free (500 msgs = à confirmer avec infra)
- [ ] Configurer Stripe (post soft-launch, mais structure prête)
- [ ] Valider avec 5 beta users le prix Starter ($29 vs $34)
- [ ] Créer landing page pricing avec toggle mensuel/annuel

---

*Document rédigé par Luna, PM Vutler — vutler.ai*  
*Dernière mise à jour : 17 février 2026*
