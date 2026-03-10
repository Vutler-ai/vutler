# SPEC 1 : Onboarding Wizard — Vutler
**Version:** 1.0  
**Auteur:** Philip (UI/UX Designer, Vutler)  
**Date:** 2026-02-17  
**Statut:** Draft

---

## Vue d'ensemble

Le Onboarding Wizard est le premier contact d'un utilisateur avec Vutler. Son objectif : **en moins de 2 minutes**, comprendre le besoin, provisionner automatiquement un agent opérationnel, et amener l'utilisateur à son premier échange direct.

### Principes de design
- **Progressive disclosure** : ne demander que ce qui est nécessaire à chaque étape
- **Smart defaults** : pré-remplir intelligemment selon le use case sélectionné
- **Feedback immédiat** : chaque action a une réponse visuelle claire
- **Exit visible** : possibilité de "Skip & explore" à tout moment (après step 3)
- **Mobile-first** : toutes les étapes sont optimisées pour mobile (card plein écran)

### Flow global
```
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7 → Step 8 → Step 9
Welcome  Use case  Agents   LLM     Perso    Outils   Contexte  Résumé   Chat
```
Durée estimée : ~90 secondes (utilisateur type).

---

## User Stories

| ID | Story | Points |
|----|-------|--------|
| US-OB-01 | En tant que nouvel utilisateur, je veux être guidé pas à pas pour créer mon premier agent sans lire de documentation. | 8 |
| US-OB-02 | En tant qu'utilisateur déjà connecté, je ne veux pas ressaisir mon nom/email. | 2 |
| US-OB-03 | En tant qu'utilisateur "support client", je veux que mes outils et le ton de l'agent soient pré-configurés automatiquement. | 5 |
| US-OB-04 | En tant qu'utilisateur BYOLLM, je veux pouvoir coller ma clé API OpenAI/Anthropic et la voir validée en live. | 5 |
| US-OB-05 | En tant qu'utilisateur gratuit, je veux clairement voir ce que j'ai avec 1 agent vs ce que j'aurais avec le plan Pro. | 3 |
| US-OB-06 | En tant qu'utilisateur, je veux uploader un PDF de ma FAQ et que l'agent le connaisse immédiatement. | 8 |
| US-OB-07 | En tant qu'utilisateur, je veux voir un résumé de tout ce que j'ai configuré avant de valider. | 3 |
| US-OB-08 | En tant qu'utilisateur, je veux voir le provisioning se faire en temps réel (progress bar) et être notifié quand c'est prêt. | 5 |
| US-OB-09 | En tant qu'utilisateur, je veux envoyer mon premier message à l'agent directement à la fin du wizard. | 3 |
| US-OB-10 | En tant qu'admin, je veux que le SOUL.md soit auto-généré et stocké dans le workspace de l'agent. | 8 |
| US-OB-11 | En tant qu'utilisateur, je veux pouvoir reprendre le wizard là où je l'ai laissé si je ferme la fenêtre. | 5 |
| US-OB-12 | En tant qu'utilisateur mobile, je veux que chaque step soit une card plein écran avec navigation tactile. | 3 |

**Total estimé : 58 story points**

---

## Step 1 : Welcome + Identification

### Wireframe
```
┌─────────────────────────────────────────┐
│                                         │
│        🔷  VUTLER                       │
│                                         │
│   Bienvenue ! Créons votre assistant    │
│   en quelques minutes.                  │
│                                         │
│   ┌───────────────────────────────┐     │
│   │  Votre prénom          [____] │     │
│   └───────────────────────────────┘     │
│   ┌───────────────────────────────┐     │
│   │  Email professionnel   [____] │     │
│   └───────────────────────────────┘     │
│                                         │
│   ─── ou ───                            │
│   [  Continuer avec Google  ]           │
│   [  Continuer avec GitHub  ]           │
│                                         │
│         [ Commencer →  ]               │
│                                         │
│   Déjà un compte ? Se connecter         │
└─────────────────────────────────────────┘
```

### Champs
| Champ | Type | Validation | Requis |
|-------|------|-----------|--------|
| Prénom | text | min 2 chars | Oui |
| Email | email | format valide + domaine MX | Oui |
| SSO Google | OAuth2 | — | Non |
| SSO GitHub | OAuth2 | — | Non |

### Comportement
- **Si utilisateur déjà authentifié** : step 1 est skippée automatiquement, on passe à step 2 avec animation de transition.
- Le prénom est utilisé pour personnaliser toutes les étapes suivantes ("Quel est votre cas d'usage, {prénom} ?")
- L'email déclenche une vérification asynchrone (domaine professionnel → badge "Pro" suggéré)

### Backend
- `POST /api/v1/onboarding/start` — crée une session d'onboarding avec TTL 24h
- Retourne un `onboarding_token` stocké en localStorage + cookie HTTPOnly
- Si compte existant + token valide : `GET /api/v1/onboarding/session/{token}` pour reprendre
- Email vérification : non-bloquante, envoi async après step 2

---

## Step 2 : Use Case

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          2 / 9               │
│  ████░░░░░░░░░░░░░  (22%)              │
│                                         │
│   Quel est votre besoin principal ?     │
│                                         │
│   ┌──────────┐  ┌──────────┐           │
│   │  🎧      │  │  💻      │           │
│   │ Support  │  │   Dev    │           │
│   │ Client   │  │ Assistant│           │
│   └──────────┘  └──────────┘           │
│                                         │
│   ┌──────────┐  ┌──────────┐           │
│   │  📣      │  │  ⚙️      │           │
│   │Marketing │  │   Ops    │           │
│   │          │  │          │           │
│   └──────────┘  └──────────┘           │
│                                         │
│   ┌──────────┐  ┌──────────┐           │
│   │  🔬      │  │  ✏️      │           │
│   │ Research │  │  Custom  │           │
│   │          │  │          │           │
│   └──────────┘  └──────────┘           │
│                                         │
│         [ Suivant →  ]                  │
└─────────────────────────────────────────┘
```

### Options et presets associés

| Use Case | Ton par défaut | Outils activés | Modèle suggéré |
|----------|---------------|---------------|----------------|
| Support Client | Friendly, patient | Email, Fichiers | GPT-4o mini |
| Dev Assistant | Technique, précis | Shell, Browser, Fichiers | Claude Sonnet |
| Marketing | Créatif, persuasif | Browser, Email | GPT-4o |
| Ops | Pro, efficace | Shell, Calendar, Email | Claude Sonnet |
| Research | Analytique, neutre | Browser, Fichiers | Claude Opus |
| Custom | — | Aucun (manuel) | — |

### Validation
- Sélection obligatoire (1 carte doit être active)
- Carte active : border electric-blue + fond navy/10

### Backend
- Preset chargé côté client (JSON statique)
- Sélection stockée dans la session d'onboarding
- Aucun appel API à ce stade

---

## Step 3 : Nombre d'agents

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          3 / 9               │
│  ████████░░░░░░░░░  (33%)              │
│                                         │
│   Combien d'agents voulez-vous ?        │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  ✅  1 Agent        GRATUIT     │   │
│   │      Parfait pour démarrer      │   │
│   │      • 1 agent actif            │   │
│   │      • 500 messages/mois        │   │
│   │      • Modèles inclus (limités) │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  ⭐  Multi-agents    PRO €29/mo │   │
│   │      Pour les équipes           │   │
│   │      • Agents illimités         │   │
│   │      • Messages illimités       │   │
│   │      • BYOLLM sans surcoût      │   │
│   │      • Support prioritaire      │   │
│   └─────────────────────────────────┘   │
│                                         │
│   [  Continuer en Gratuit  ]            │
│   [  Passer à Pro →        ]            │
└─────────────────────────────────────────┘
```

### Logique
- Gratuit sélectionné par défaut
- "Passer à Pro" → ouvre une modal Stripe Checkout (sans quitter le wizard)
- Après paiement réussi, retour automatique sur step 3 avec plan Pro confirmé
- Indicateur visuel : badge "PRO" en haut de l'écran pour le reste du wizard

### Backend
- `POST /api/v1/billing/checkout-session` → retourne Stripe URL
- Webhook Stripe `checkout.session.completed` → `PATCH /api/v1/user/plan`
- Long-polling sur `GET /api/v1/user/plan` pendant que modal Stripe est ouverte

---

## Step 4 : Configuration LLM

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          4 / 9               │
│  ████████████░░░░░  (44%)              │
│                                         │
│   Comment alimenter votre agent ?       │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  🔑  Apportez votre clé API     │   │
│   │      BYOLLM                     │   │
│   │  ○ OpenAI   ○ Anthropic         │   │
│   │  ○ Mistral  ○ Groq   ○ Autre    │   │
│   │  ┌───────────────────────────┐  │   │
│   │  │  sk-...           [Test] │  │   │
│   │  └───────────────────────────┘  │   │
│   │  ✅ Clé valide — gpt-4o accès   │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ─── ou ───                            │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  ☁️  Utiliser les crédits Vutler│   │
│   │      Inclus dans votre plan     │   │
│   │                                 │   │
│   │  Modèle : [Claude Sonnet 4.5 ▾] │   │
│   │  (pré-sélectionné selon use case)│  │
│   └─────────────────────────────────┘   │
│                                         │
│         [ Suivant →  ]                  │
└─────────────────────────────────────────┘
```

### Champs BYOLLM
| Champ | Type | Validation |
|-------|------|-----------|
| Provider | radio | requis si BYOLLM |
| Clé API | password | regex selon provider, test live |
| Modèle | text (auto-détecté) | — |

### Validation de clé
- Bouton "Test" → appel proxy `/api/v1/llm/validate-key`
- Timeout 5s
- États : idle / loading / ✅ valid / ❌ invalid
- **La clé n'est jamais loggée côté frontend**

### Champs Crédits Vutler
| Champ | Type | Options |
|-------|------|---------|
| Modèle | select | GPT-4o, GPT-4o mini, Claude Sonnet, Claude Haiku, Mistral Large |

### Backend
- `POST /api/v1/llm/validate-key` → test minimal (list models ou simple completion)
- Clé stockée chiffrée : `AES-256-GCM` côté serveur, jamais en clair dans DB
- Session d'onboarding mise à jour : `llm_config: { type, provider, model }`

---

## Step 5 : Personnalité & Nom de l'agent

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          5 / 9               │
│  ████████████████░░  (56%)             │
│                                         │
│   Donnez une identité à votre agent     │
│                                         │
│   Nom de l'agent                        │
│   ┌───────────────────────────────┐     │
│   │  Aria                   [✏️] │     │
│   └───────────────────────────────┘     │
│   💡 Suggestion basée sur votre cas     │
│                                         │
│   Personnalité                          │
│   ┌──────────┐  ┌──────────┐           │
│   │  👔      │  │  😊      │           │
│   │   Pro    │  │  Friendly│           │
│   │ Formel,  │  │ Chaleureux│          │
│   │ concis   │  │ empathique│          │
│   └──────────┘  └──────────┘           │
│                                         │
│   ┌──────────┐  ┌──────────┐           │
│   │  🔧      │  │  💬      │           │
│   │Technique │  │  Casual  │           │
│   │ Précis,  │  │  Détendu │           │
│   │ détaillé │  │  naturel │           │
│   └──────────┘  └──────────┘           │
│                                         │
│   Aperçu du ton :                       │
│   ┌───────────────────────────────┐     │
│   │ 💬 "Bonjour ! Je suis Aria.  │     │
│   │  Comment puis-je vous aider  │     │
│   │  aujourd'hui ?"              │     │
│   └───────────────────────────────┘     │
│                                         │
│         [ Suivant →  ]                  │
└─────────────────────────────────────────┘
```

### Suggestions de noms par use case
| Use Case | Noms suggérés |
|----------|--------------|
| Support Client | Aria, Maya, Leo |
| Dev Assistant | Hex, Axel, Dev |
| Marketing | Spark, Nova, Muse |
| Ops | Ops, Atlas, Core |
| Research | Lux, Sage, Oracle |

### Validation
- Nom : 2–20 chars, alphanumeric + espaces, pas de noms réservés (Admin, Vutler, etc.)
- Ton : sélection obligatoire (1 par défaut selon use case)

### Aperçu dynamique
- Texte de preview se met à jour en temps réel selon le ton sélectionné
- Généré côté client depuis templates statiques (pas de LLM à ce stade)

### Backend
- Session mise à jour : `agent: { name, personality }`
- Le nom sera le `display_name` de l'agent dans RC

---

## Step 6 : Outils à activer

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          6 / 9               │
│  ████████████████████░  (67%)          │
│                                         │
│   Quels outils pour votre agent ?       │
│   (pré-sélectionnés selon votre usage)  │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  ✅  📧 Email                   │   │
│   │      Lire, envoyer des emails   │   │
│   │      Nécessite: OAuth Gmail/    │   │
│   │      Outlook (après wizard)     │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  ✅  📁 Fichiers                │   │
│   │      Lire/écrire des fichiers   │   │
│   │      Dossier sandbox isolé      │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  ☐   🌐 Browser                 │   │
│   │      Navigation web, scraping   │   │
│   │      ⚠️ Plan Pro requis         │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  ☐   💻 Shell                   │   │
│   │      Exécution de commandes     │   │
│   │      ⚠️ Plan Pro requis         │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  ☐   📅 Calendar                │   │
│   │      Lire/créer des événements  │   │
│   │      Nécessite: OAuth (après)   │   │
│   └─────────────────────────────────┘   │
│                                         │
│   💡 Les autorisations OAuth seront     │
│      demandées après la création.       │
│                                         │
│         [ Suivant →  ]                  │
└─────────────────────────────────────────┘
```

### Règles de verrouillage
- Browser et Shell : verrouillés en plan Free → click affiche un tooltip "Disponible en Pro"
- Email et Calendar : disponibles mais OAuth demandé post-wizard (non-bloquant)
- Fichiers : toujours disponible, sandbox isolé par agent

### Backend
- Session : `tools: ["email", "files", "calendar"]`
- Permissions stockées dans le profil de l'agent
- Outils Pro non-sélectionnables si plan Free (validation côté serveur)

---

## Step 7 : Contexte Métier

### Wireframe
```
┌─────────────────────────────────────────┐
│  ← Retour          7 / 9               │
│  ████████████████████████░  (78%)      │
│                                         │
│   Donnez du contexte à votre agent      │
│                                         │
│   Documents (optionnel)                 │
│   ┌───────────────────────────────┐     │
│   │                               │     │
│   │   📄 Glissez vos fichiers ici │     │
│   │      ou cliquez pour choisir  │     │
│   │                               │     │
│   │   PDF, DOCX, TXT, MD — 10MB  │     │
│   └───────────────────────────────┘     │
│   • FAQ-support.pdf     ✅ indexé       │
│   • guide-produit.docx  ⏳ en cours...  │
│                                         │
│   Site web à analyser (optionnel)       │
│   ┌───────────────────────────────┐     │
│   │  https://votre-site.com [→]  │     │
│   └───────────────────────────────┘     │
│   ✅ 42 pages indexées                  │
│                                         │
│   Notes contextuelles (optionnel)       │
│   ┌───────────────────────────────┐     │
│   │  Ex: "Nous vendons des SaaS  │     │
│   │  B2B dans la finance..."     │     │
│   │                               │     │
│   └───────────────────────────────┘     │
│                                         │
│   [ Passer cette étape ]  [ Suivant → ] │
└─────────────────────────────────────────┘
```

### Champs
| Champ | Type | Contraintes |
|-------|------|------------|
| Documents | file upload | PDF/DOCX/TXT/MD, max 10MB/fichier, max 5 fichiers |
| URL site | url | format valide, http/https, timeout 10s |
| Notes | textarea | max 2000 chars |

### Comportement upload
- Upload immédiat dès sélection (multipart)
- Indexation Snipara en arrière-plan
- Statut par fichier : ⏳ en cours / ✅ indexé / ❌ erreur
- L'étape est "passable" même si indexation incomplète (continue en bg)

### Backend
- `POST /api/v1/onboarding/documents` → upload + queue indexation Snipara
- `POST /api/v1/onboarding/scrape` → lance scraping URL (job async)
- `GET /api/v1/onboarding/context-status` → polling statut indexation
- Snipara project auto-créé : `vutler-{agent_id}-context`
- Notes métier → injectées dans le SOUL.md généré

---

## Step 8 : Résumé + Provisioning

### Wireframe — Phase A : Résumé
```
┌─────────────────────────────────────────┐
│  ← Retour          8 / 9               │
│  █████████████████████████████░  (89%) │
│                                         │
│   Récapitulatif de votre agent          │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  👤 Identité                    │   │
│   │     Nom : Aria                  │   │
│   │     Ton : Friendly              │   │
│   │     Usage : Support Client      │   │
│   ├─────────────────────────────────┤   │
│   │  🧠 LLM                         │   │
│   │     Claude Sonnet 4.5           │   │
│   │     Crédits Vutler              │   │
│   ├─────────────────────────────────┤   │
│   │  🔧 Outils                      │   │
│   │     ✅ Email  ✅ Fichiers        │   │
│   │     ❌ Browser  ❌ Shell         │   │
│   ├─────────────────────────────────┤   │
│   │  📚 Contexte                    │   │
│   │     2 documents indexés         │   │
│   │     Site web : monsite.com      │   │
│   └─────────────────────────────────┘   │
│                                         │
│   [  ✏️ Modifier  ]                     │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   │   🚀  Créer mon agent           │   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Wireframe — Phase B : Provisioning
```
┌─────────────────────────────────────────┐
│           Création en cours...          │
│                                         │
│   ████████████████░░░░  75%            │
│                                         │
│   ✅  Compte créé                       │
│   ✅  Agent "Aria" configuré            │
│   ✅  SOUL.md généré                    │
│   ✅  Snipara context lié               │
│   ⏳  Canal de chat créé...             │
│   ○   Outils activés                    │
│   ○   Message de bienvenue envoyé       │
│                                         │
│   (Attendez, ça arrive vite ! 🎉)       │
└─────────────────────────────────────────┘
```

### Étapes de provisioning backend
```
POST /api/v1/onboarding/provision
```

Séquence d'actions (en ordre, certaines parallélisables) :

1. **Créer l'utilisateur** (si pas encore en DB)
   - `users.create({ email, name, plan })`

2. **Créer l'agent RC**
   - `rocketchat.users.create({ username: slugify(name), name, email: agent@... })`
   - `rocketchat.rooms.createDirect({ userId })`

3. **Générer SOUL.md**
   - Template + données du wizard → SOUL.md complet
   - `POST /api/v1/workspace/{agentId}/files/SOUL.md`

4. **Configurer LLM**
   - Si BYOLLM : stocker clé chiffrée dans vault
   - Sinon : assigner pool crédits Vutler

5. **Activer les outils**
   - Créer permissions dans la DB pour chaque outil sélectionné
   - Sandbox fichiers : `mkdir /sandboxes/{agentId}`

6. **Lier contexte Snipara**
   - Créer/assigner le projet Snipara à l'agent
   - Injecter référence dans SOUL.md

7. **Générer message de bienvenue**
   - Premier message de l'agent dans le channel, personnalisé

8. **Envoyer email de confirmation**
   - Async, non-bloquant

### SOUL.md généré — template
```markdown
# SOUL.md — {agent_name}

## Identité
Je suis **{agent_name}**, assistant {use_case} de {company_name}.
Mon rôle : {role_description_from_use_case}

## Personnalité
Ton : {personality}
Style : {style_description}
Règle d'or : {golden_rule}

## Contexte métier
{business_notes}

## Outils disponibles
{tools_list}

## LLM
Provider : {llm_provider}
Modèle : {llm_model}

## Mémoire
Contexte Snipara : {snipara_project_id}
```

### Gestion d'erreur provisioning
- Chaque étape a un retry (max 3)
- Si échec critique : rollback + message d'erreur avec "Réessayer"
- Si échec non-critique (email) : continue silencieusement
- Timeout global : 30 secondes

---

## Step 9 : Premier Chat

### Wireframe
```
┌─────────────────────────────────────────┐
│  ✅  Aria est prêt !                    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                              Aria │  │
│  │  Bonjour ! 👋 Je suis Aria,       │  │
│  │  votre assistant Support Client.  │  │
│  │  Je connais vos documents et      │  │
│  │  suis prêt à vous aider.          │  │
│  │  Comment puis-je vous assister ?  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Suggestions :                          │
│  ┌──────────────────────────────────┐   │
│  │ "Que sais-tu de nos produits ?" │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ "Montre-moi tes capacités"      │   │
│  └──────────────────────────────────┘   │
│                                         │
│  ┌────────────────────────────── [→] ┐  │
│  │  Écrivez votre message...         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [ Aller au dashboard complet ]         │
└─────────────────────────────────────────┘
```

### Comportement
- Message de bienvenue auto-généré par l'agent (via LLM, incluant le contexte chargé)
- 2 suggestions cliquables pré-générées selon le use case
- Input de chat fonctionnel, réponse en streaming
- Bouton "Aller au dashboard" non-intrusif en bas
- Confetti/animation de succès à l'arrivée sur cette step

### Backend
- Connexion WebSocket au channel RC de l'agent
- Message de bienvenue déjà en DB (envoyé à step 8)
- Suggestions générées à step 8 et stockées dans `onboarding_session.suggestions`

---

## États spéciaux

### Reprise de session
- Si `onboarding_token` en localStorage → `GET /api/v1/onboarding/session/{token}`
- Modal : "Reprendre où vous en étiez (step X) ?" avec option "Recommencer"

### Erreurs réseau
- Toast non-bloquant : "Connexion interrompue — vos données sont sauvegardées"
- Auto-retry avec backoff exponentiel

### Accessibilité
- Focus trap dans le wizard
- Labels ARIA sur tous les champs
- Navigation clavier complète (Tab, Enter, Espace, Flèches)
- Contrast ratio ≥ 4.5:1 (WCAG AA)

---

## Métriques à tracker

| Événement | Description |
|-----------|-------------|
| `wizard_start` | Démarrage wizard |
| `wizard_step_N_complete` | Chaque step validée |
| `wizard_drop_step_N` | Abandon à chaque step |
| `wizard_complete` | Wizard terminé |
| `first_message_sent` | Premier message envoyé |
| `byollm_key_validated` | Clé API validée avec succès |
| `context_document_uploaded` | Document uploadé |
| `pro_upgrade_clicked` | Clic sur "Passer à Pro" |

---

## Notes techniques

- **Framework** : React + Zustand (state du wizard)
- **Animations** : Framer Motion (transitions entre steps)
- **Validation** : Zod (schemas partagés front/back)
- **Upload** : Presigned S3 URLs pour les documents volumineux
- **Session persistence** : localStorage + backend (double sécurité)
- **A/B testing** : hook `useWizardVariant()` pour tester différents flows

