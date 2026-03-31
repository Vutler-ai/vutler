# Jarvis — Workflow d'Onboarding Nouveau Utilisateur

> Ce document décrit le workflow que Jarvis utilise pour accompagner un nouvel utilisateur dans la création de son workspace Vutler. Conçu pour être injecté dans la mémoire/contexte de Jarvis.

---

## Philosophie

- **Time to value < 60 secondes** — l'utilisateur doit voir un agent travailler avant de configurer quoi que ce soit
- **Zero friction LLM** — tokens d'essai provisionnés silencieusement, jamais de question technique à l'onboarding
- **Choix concrets, pas de texte libre** — cartes cliquables, pas de champs ouverts qui paralysent
- **Monétisation post-valeur** — plan et config LLM se déclenchent après que l'user a vu la magie, pas avant

---

## Vue d'ensemble

L'onboarding se déroule en **3 étapes** via le wizard UI + chat Jarvis. En arrière-plan, les trial tokens sont provisionnés automatiquement.

```
Step 1: Accueil & Identité .............. 10s
Step 2: Choix du domaine (cartes) ....... 20s
Step 3: Votre équipe est prête .......... 30s → agent exécute EN LIVE
```

La config LLM et le choix du plan sont déplacés en **post-onboarding**, déclenchés par des milestones d'usage.

---

## Pré-onboarding (automatique, invisible)

**Au moment du signup** (dans `api/auth.js`, transaction de création du workspace) :

1. Créer le workspace + user (existant)
2. Créer Jarvis coordinator avec `FULL_PROMPT` (existant)
3. Créer le channel `DM-jarvis` (existant)
4. **NOUVEAU** — Provisionner les trial tokens silencieusement :
   - Insérer provider `vutler-trial` dans `workspace_llm_providers` avec la clé API interne
   - Insérer dans `workspace_settings` : `trial_tokens_total=50000`, `trial_tokens_used=0`, `trial_expires_at=+7j`
   - Aucune action utilisateur requise

**Résultat :** Quand l'user arrive sur le wizard, tout est déjà prêt pour que les agents fonctionnent.

---

## Step 1 — Accueil & Identité

**Durée cible :** 10 secondes

**UI :**
- Titre : "Bienvenue sur Vutler"
- Sous-titre : "Créez votre workspace en quelques secondes."
- Input : nom de l'entreprise ou du workspace
- Bouton : "Continuer"

**Actions backend :**
- `PUT /api/v1/settings` avec `{ companyName }`

**Jarvis (message de bienvenue dans le chat DM, affiché en parallèle) :**
> "Bienvenue ! Je suis Jarvis, votre assistant IA. Je m'occupe de tout préparer pendant que vous choisissez votre équipe d'agents."

---

## Step 2 — Choix du Domaine

**Durée cible :** 20 secondes

**UI : 6 cartes cliquables (pas de texte libre)**

| Carte | Icone | Label | Agents créés automatiquement |
|-------|-------|-------|------------------------------|
| Marketing | 📣 | Marketing & Contenu | Content Writer + Social Media Manager |
| Support | 🎧 | Support Client | Customer Support Agent + FAQ Agent |
| Ventes | 💰 | Sales & CRM | Sales Agent + Lead Gen Specialist |
| Tech | 💻 | Développement | Senior Developer + Code Reviewer |
| Admin | 📋 | Admin & Gestion | Project Manager + HR Assistant |
| Autre | ✨ | Je veux explorer | Content Writer + Customer Support Agent |

**Sélection multiple autorisée** — l'user peut cliquer 2-3 cartes.

**Actions backend (au clic sur "Continuer") :**
1. `POST /api/v1/onboarding/setup` avec `{ domains: ["marketing", "support", ...] }`
2. Le backend :
   - Appelle `recommendAgents()` pour résoudre les templates
   - Crée les agents via `INSERT INTO agents` en batch
   - Retourne la liste des agents créés avec nom + description + avatar
3. `POST /api/v1/onboarding/complete`

---

## Step 3 — Votre Équipe est Prête

**Durée cible :** 30 secondes (l'user voit la valeur ICI)

**UI :**
- Titre : "Votre équipe IA est prête !"
- Sous-titre : "Vos agents sont opérationnels. Essayez tout de suite."
- Affichage des agents créés (avatar + nom + rôle en une ligne)
- **Zone de chat intégrée** avec Jarvis qui propose une première tâche
- Bouton principal : "Aller au Dashboard"

**Jarvis (message automatique basé sur le domaine choisi) :**

| Domaine | Message Jarvis |
|---------|---------------|
| Marketing | "Votre Content Writer et Social Media Manager sont prêts ! Essayez : 'Rédige un article de blog sur l'IA en entreprise'" |
| Support | "Votre équipe support est en place ! Essayez : 'Crée une FAQ de 10 questions pour notre produit'" |
| Ventes | "Votre équipe sales est opérationnelle ! Essayez : 'Génère une séquence de 3 emails de prospection'" |
| Tech | "Vos devs IA sont prêts ! Essayez : 'Fais un code review de ce snippet: [coller votre code]'" |
| Admin | "Votre assistant admin est en place ! Essayez : 'Organise une réunion d'équipe pour vendredi'" |
| Autre | "Votre équipe est prête ! Essayez : 'Rédige un résumé de nos objectifs du trimestre'" |

**L'utilisateur peut directement taper dans le chat et voir l'agent répondre en live.** C'est le moment "aha!" — la valeur est démontrée AVANT toute question de pricing ou de config.

---

## Post-onboarding — Triggers Organiques

Le plan, la config LLM, et l'upsell ne sont plus dans l'onboarding. Ils se déclenchent **quand l'utilisateur en a besoin**, via des triggers basés sur l'usage.

### Trigger 1 — Trial Tokens < 20% (10 000 restants)

**Jarvis (message proactif dans le chat) :**
> "Vos crédits d'essai commencent à s'épuiser (X tokens restants). Pour continuer à utiliser vos agents, vous avez 3 options :
> 1. **Connecter votre compte OpenAI** — en un clic, utilisez votre propre crédit
> 2. **Ajouter une clé API** — Anthropic ou OpenAI, dans Paramètres > LLM
> 3. **Acheter des crédits Vutler** — packs à partir de $5
>
> Qu'est-ce qui vous arrange ?"

**UI : Banner warning dans le header**
- Badge ambre : "Trial: X tokens restants"
- Clic → dropdown avec les 3 options ci-dessus

### Trigger 2 — Trial Tokens épuisés ou expirés

**Jarvis :**
> "Vos crédits d'essai sont épuisés. Configurez un accès LLM pour que vos agents puissent continuer à travailler."

**UI : Modal bloquant (soft) au prochain message chat**
- 3 boutons : "Connecter OpenAI" / "Ajouter clé API" / "Acheter crédits"
- Lien discret "Plus tard" pour fermer (mais les agents ne répondront plus)

### Trigger 3 — Veut créer un agent supplémentaire (plan Free = 1 seul)

**UI : Modal au clic sur "Nouvel Agent"**
> "Le plan Free inclut 1 agent. Pour en créer plus, choisissez un plan adapté."
> Boutons : "Voir les plans" → `/billing`

### Trigger 4 — Première semaine écoulée (email + notification)

**Email automatique (7 jours après signup) :**
> Objet : "Votre essai Vutler se termine — voici comment continuer"
> Corps : Récap de l'activité (X messages envoyés, X tâches complétées) + CTA vers plan Starter

---

## Flux OAuth & Config LLM (accessible à tout moment)

Ces flows ne sont plus dans l'onboarding mais restent accessibles via **Paramètres > LLM Providers** ou via les triggers post-onboarding.

### Option A — Connecter OpenAI (Device Auth)

1. User clique "Connecter OpenAI" (depuis trigger, settings, ou header)
2. Appel `POST /api/v1/integrations/chatgpt/connect` → retourne `user_code` + `verification_url`
3. UI affiche : "Rendez-vous sur [lien] et entrez le code : **XXXX-XXXX**"
4. Polling `POST /api/v1/integrations/chatgpt/poll` toutes les 5s
5. Quand connecté : provider `codex` créé, trial provider désactivé
6. Confirmation : "OpenAI connecté ! Vos agents utilisent maintenant votre compte."

### Option B — Ajouter une clé API manuellement

1. User va dans Paramètres > LLM Providers
2. Choisit provider (OpenAI, Anthropic, OpenRouter, etc.)
3. Colle sa clé API
4. Test de connexion automatique
5. Si OK : trial provider désactivé, agents basculent sur la clé

### Option C — Acheter des crédits LLM Vutler

1. User clique "Acheter crédits" (depuis trigger ou `/billing`)
2. Affichage des packs : 50k tokens / $5 — 200k / $15 — 1M / $50
3. Checkout Stripe → paiement
4. Tokens ajoutés au workspace, expiration retirée (crédits achetés = permanents)

---

## Règles Transversales

### Ton & Style Jarvis
- Chaleureux, direct, orienté action
- Tutoiement par défaut (vouvoiement si l'user vouvoie)
- Adapter la langue : français par défaut, anglais si l'utilisateur écrit en anglais
- Emojis : max 1 par message, jamais dans les questions critiques

### Trial Tokens — Spécifications Techniques

| Paramètre | Valeur |
|-----------|--------|
| Tokens alloués | 50 000 |
| Modèle | gpt-5.4-mini uniquement |
| Expiration | 7 jours après signup |
| Rate limit | 5 requêtes/minute par workspace |
| Provider interne | `vutler-trial` (clé API partagée) |

### Gestion des exceptions
- **Erreur technique :** Jarvis retry 1x silencieusement. Si échec : "Un petit souci, je réessaie..." + fallback message d'erreur
- **User revient après interruption :** Si `onboarding_completed = false`, le wizard reprend au dernier step complété
- **User skip tout :** Respecter. Le dashboard est toujours accessible. Les triggers post-onboarding rattraperont.

### Persistance
- Contexte d'onboarding sauvé dans `workspace_settings` : `{ onboarding_step, domains, agents_created }`
- Mémoire Jarvis : prénom, entreprise, domaine choisi, agents créés

---

## API Endpoints

| Endpoint | Méthode | Usage | Appelé quand |
|----------|---------|-------|-------------|
| `/api/v1/settings` | PUT | Nom d'entreprise | Step 1 |
| `/api/v1/onboarding/setup` | POST | Domaines + création agents batch | Step 2 |
| `/api/v1/onboarding/complete` | POST | Marquer onboarding terminé | Step 2 (auto) |
| `/api/v1/onboarding/status` | GET | État de l'onboarding | Chargement wizard |
| `/api/v1/onboarding/trial-status` | GET | État des trial tokens | Header badge |
| `/api/v1/providers` | GET | Vérifier config LLM | Post-onboarding |
| `/api/v1/integrations/chatgpt/connect` | POST | OAuth Device Auth | Trigger 1/2 |
| `/api/v1/integrations/chatgpt/poll` | POST | Poll OAuth status | Trigger 1/2 |
| `/api/v1/billing/credits` | POST | Achat crédits LLM | Trigger 1/2 |

---

## Diagramme de flux

```
[Signup] ──→ Trial tokens provisionnés silencieusement (50k, gpt-5.4-mini, 7j)
   │
   ▼
Step 1: "Nom de votre workspace ?"
   │         (10s)
   ▼
Step 2: Cartes domaines [Marketing] [Support] [Sales] [Tech] [Admin] [Autre]
   │         (20s)
   │         → Agents créés automatiquement
   │         → Onboarding marqué complete
   ▼
Step 3: "Votre équipe est prête !" + Chat live avec Jarvis
   │         (30s)
   │         → Première tâche exécutée EN LIVE
   ▼
[Dashboard] ──→ L'user utilise ses agents avec les trial tokens
                    │
                    ├─ Trigger: tokens < 20% ──→ "Connectez OpenAI / Ajoutez clé / Achetez crédits"
                    │
                    ├─ Trigger: tokens = 0 ────→ Modal : configurez un accès LLM
                    │
                    ├─ Trigger: nouvel agent ──→ "Upgradez votre plan"
                    │
                    └─ Trigger: J+7 ──────────→ Email recap + CTA plan Starter
```
