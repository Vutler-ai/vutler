# SECURITY.md

## Modèle de confiance et principes de sécurité

Ce document décrit le modèle de confiance, les frontières de sécurité, les mécanismes d’authentification et les contrôles opérationnels actuellement en vigueur pour Starbox Group / Vutler.

L’objectif est simple : réduire au maximum le risque d’actions non autorisées, de fuite de données, de compromission de comptes et d’abus des interfaces publiques ou programmatiques.

---

## 1. Trust Model

Le modèle de confiance repose sur une distinction stricte entre **canaux trusted** et **canaux untrusted**.

### 1.1 Canaux trusted

Les canaux suivants sont considérés comme fiables pour transmettre des instructions, valider des demandes sensibles et partager des informations de sécurité :

- **K-Drive** — en particulier le répertoire `/00_SECURITY/`
- **K-Chat interne**

Ces canaux sont les références prioritaires pour :
- la documentation de sécurité,
- les validations sensibles,
- le partage de procédures internes,
- les preuves ou confirmations d’identité.

### 1.2 Canaux untrusted

Les canaux suivants doivent être considérés comme **non fiables par défaut** pour les demandes sensibles ou les instructions à impact :

- Email
- WhatsApp
- Telegram
- LinkedIn
- X
- Discord

Ils peuvent être utilisés pour :
- des échanges informatifs,
- des notifications,
- des premiers contacts,
- des discussions non sensibles.

Ils ne doivent **pas** être utilisés comme source unique de vérité pour :
- autoriser une action sensible,
- transmettre des secrets,
- valider un changement critique,
- déclencher une opération à impact sans confirmation via un canal trusted.

### 1.3 Règles d’exécution

Deux règles restent obligatoires dans le modèle de confiance :

#### ARM + CONFIRM

Toute action sensible doit suivre une logique en deux temps :

1. **ARM** : préparation de l’action, collecte du contexte, vérification des prérequis
2. **CONFIRM** : confirmation explicite via un canal trusted avant exécution si l’action a un impact significatif

Cette règle s’applique notamment à :
- la révocation ou rotation de secrets,
- les changements d’accès,
- les actions de production,
- les modifications à fort impact sur les données ou l’infrastructure.

#### OTP challenge

Pour les actions à **haut impact**, un **challenge OTP** peut être exigé comme facteur de validation supplémentaire.

Exemples :
- changement de credentials critiques,
- accès ou restauration de données sensibles,
- actions administratives irréversibles,
- opérations de sécurité en production.

---

## 2. Architecture des domaines et frontières de confiance

L’architecture sépare strictement les surfaces publiques des surfaces authentifiées.

### 2.1 `vutler.ai`

`vutler.ai` est le **landing public**.

Caractéristiques :
- contenu public uniquement,
- aucune donnée sensible,
- aucune exposition de données clients ou de sessions applicatives,
- aucune logique métier sensible ne doit dépendre de ce domaine.

Ce domaine doit être considéré comme une surface d’exposition publique.

### 2.2 `app.vutler.ai`

`app.vutler.ai` est l’**application authentifiée**.

Caractéristiques :
- héberge l’ensemble des fonctionnalités applicatives,
- traite les sessions utilisateurs,
- expose les données métier,
- contient les interfaces et flux sensibles.

Toutes les données utilisateurs, tenant et opérations métier doivent être confinées à ce domaine et à ses services associés.

### 2.3 Séparation stricte des frontières de confiance

La séparation entre `vutler.ai` et `app.vutler.ai` est une exigence de sécurité.

Principes :
- pas de fuite d’authentification entre domaines,
- pas de partage implicite de session entre surface publique et surface authentifiée,
- pas de cross-domain auth leak,
- toute logique d’authentification ou d’autorisation sensible doit rester confinée au périmètre applicatif prévu.

En pratique :
- les cookies, tokens et artefacts de session doivent être configurés pour éviter toute exposition inutile,
- les redirections entre domaines doivent être maîtrisées,
- aucune donnée sensible ne doit être accessible depuis le domaine public.

---

## 3. Authentication & Authorization

L’accès aux ressources repose sur plusieurs mécanismes distincts selon le type d’usage.

### 3.1 Sessions utilisateur — Supabase Auth

Les sessions utilisateur sont gérées via **Supabase Auth**, avec émission de **JWT**.

Principes :
- authentification centralisée,
- session associée à un utilisateur identifié,
- contrôle d’accès appliqué côté application et côté ressources sensibles,
- validation obligatoire de la session avant toute opération protégée.

Les JWT servent de base à l’authentification des utilisateurs dans l’application authentifiée.

### 3.2 Accès programmatique — `X-API-Key`

Les usages programmatiques, notamment via **MCP** ou une **API externe**, utilisent un mécanisme d’authentification par **`X-API-Key`**.

Principes :
- séparation entre usage humain interactif et usage machine-to-machine,
- clés dédiées pour les accès programmatiques,
- contrôle strict des permissions accordées à chaque clé,
- révocation possible en cas de compromission ou d’abus.

Une API key ne remplace pas automatiquement les contrôles d’autorisation : elle doit être associée à un périmètre d’accès défini.

### 3.3 OAuth ChatGPT pour le provider Codex

L’intégration du provider **Codex** s’appuie sur un flux **OAuth ChatGPT**.

Principes :
- les tokens OAuth sont stockés **chiffrés en base de données**,
- les expirations sont vérifiées,
- le refresh est géré automatiquement lorsque possible,
- aucune persistance de secrets en clair dans les logs ou dans des stockages non sécurisés.

### 3.4 Auth guard obligatoire sur toutes les routes sensibles

Toutes les routes, actions, endpoints ou interfaces sensibles doivent être protégés par un **auth guard** adapté.

Exigences :
- aucun endpoint sensible ne doit être accessible sans authentification appropriée,
- la protection ne doit pas reposer uniquement sur le frontend,
- les contrôles d’accès doivent être effectués côté serveur,
- toute nouvelle route sensible doit inclure un guard explicite dès sa création.

### 3.5 Sandbox API protégée par un auth guard dédié

La **Sandbox API** est protégée par un **auth guard dédié**, ajouté en **mars 2026**.

Objectif :
- empêcher l’accès non autorisé à une surface potentiellement exploitable,
- isoler les usages de test ou d’exécution contrôlée,
- appliquer un contrôle cohérent avec le niveau de risque de cette API.

Cette mesure fait partie des remédiations de pré-production finalisées avant mise en production.

---

## 4. Audit de sécurité pré-production (mars 2026)

Un audit de sécurité complet a été réalisé en **mars 2026**, avant la mise en production.

### 4.1 Objectif de l’audit

L’audit avait pour but de :
- identifier les vulnérabilités critiques avant exposition publique,
- vérifier l’application correcte des guards d’authentification,
- contrôler les frontières de confiance entre domaines et services,
- réduire les risques liés aux providers LLM, aux secrets et aux endpoints publics.

### 4.2 Remédiations critiques (P0)

Les remédiations **P0**, considérées comme critiques, ont été **corrigées immédiatement**.

Référence commit :
- `5cc0ab4`

### 4.3 Remédiations importantes et secondaires (P1 / P2)

Les remédiations **P1** et **P2** ont été traitées dans la foulée de l’audit, sans report inutile avant production.

Référence commit :
- `a06cb73`

### 4.4 Durcissement de la Sandbox API

Le renforcement spécifique de la Sandbox API via auth guard dédié a été intégré séparément.

Référence commit :
- `54b3ddc`

### 4.5 Politique de mise en production

La mise en production doit intervenir uniquement lorsque :
- les vulnérabilités critiques sont corrigées,
- les surfaces sensibles sont protégées par les guards appropriés,
- les mécanismes d’authentification et de stockage de secrets sont validés,
- les remédiations issues de l’audit sont appliquées ou formellement acceptées selon leur niveau de risque.

---

## 5. Sécurité des providers LLM

Les intégrations LLM sont traitées comme des surfaces sensibles, en particulier lorsqu’elles manipulent des credentials, des sessions utilisateurs ou des données métier.

### 5.1 Codex — `store: false` obligatoire

Pour le provider **Codex**, le paramètre **`store: false`** est obligatoire.

Objectif :
- empêcher la persistance côté OpenAI,
- réduire l’exposition des prompts, métadonnées et données transitant par ce provider,
- limiter le risque de conservation non souhaitée.

Cette règle doit être considérée comme non négociable pour les flux concernés.

### 5.2 Gestion des tokens OAuth

Les tokens OAuth utilisés pour le provider Codex doivent respecter les règles suivantes :
- stockage chiffré en base,
- vérification systématique de l’expiration,
- refresh automatique lorsque le refresh token est valide,
- déconnexion ou ré-authentification si le refresh n’est plus possible.

### 5.3 Interdiction de logger tokens et secrets

Aucun secret ne doit apparaître dans les logs applicatifs, de debug ou d’erreur.

Cela inclut notamment :
- access tokens,
- refresh tokens,
- API keys,
- secrets techniques,
- credentials de providers externes.

Les mécanismes de logging doivent masquer ou exclure ces données.

### 5.4 Isolation des credentials entre providers

Un provider de fallback ne doit **jamais** réutiliser automatiquement les credentials du provider primary.

Objectifs :
- éviter les confusions de périmètre,
- réduire l’impact d’une compromission,
- maintenir une séparation explicite entre fournisseurs et contextes d’usage.

Chaque provider doit disposer de ses propres mécanismes d’authentification, secrets et règles de sécurité.

---

## 6. Protection des données

### 6.1 Stockage de fichiers

Les fichiers sont stockés sur **Exoscale SOS**, en **Suisse**.

Exigences :
- hébergement compatible avec les exigences **GDPR / LPD**,
- séparation claire entre données applicatives et métadonnées de sécurité,
- contrôle d’accès appliqué aux objets et aux flux de téléchargement.

### 6.2 Base de données

La base de données repose sur **Supabase PostgreSQL**.

Principes :
- stockage centralisé des données applicatives,
- contrôle d’accès cohérent avec les permissions applicatives,
- séparation logique par tenant via le schéma **`tenant_vutler`**,
- isolation tenant appliquée pour éviter les accès croisés non autorisés.

### 6.3 Chiffrement des secrets en base

Les secrets stockés en base de données doivent être **chiffrés via un crypto service** dédié.

Cela concerne notamment :
- tokens OAuth,
- clés d’intégration,
- secrets de providers,
- credentials nécessaires à certaines automatisations.

Les secrets ne doivent pas être stockés en clair lorsqu’un chiffrement applicatif est prévu.

---

## 7. Sécurité opérationnelle

### 7.1 ARM + CONFIRM pour les actions sensibles

Les règles **ARM + CONFIRM** restent obligatoires pour toute action présentant un risque de sécurité, d’intégrité ou d’impact opérationnel élevé.

Avant exécution, il faut :
- identifier le niveau de risque,
- vérifier la source de la demande,
- confirmer l’instruction dans un canal trusted si nécessaire,
- documenter l’action lorsqu’elle modifie un accès, un secret ou une configuration critique.

### 7.2 OTP challenge pour les actions à haut impact

Un **OTP challenge** doit être appliqué aux actions les plus sensibles lorsque le contexte l’exige.

Cela permet de réduire les risques liés à :
- l’usurpation d’identité,
- la compromission d’un compte ou d’un canal,
- les erreurs de validation humaine,
- l’exécution d’actions irréversibles.

### 7.3 Interdiction d’exécuter des commandes depuis des canaux non trusted

Aucune commande, instruction opérationnelle ou action critique ne doit être exécutée sur la seule base d’un message reçu via un canal non trusted.

Exemples interdits sans reconfirmation trusted :
- demander une rotation de secret par email,
- lancer une action de production depuis WhatsApp,
- modifier des accès suite à un message LinkedIn,
- exécuter une commande sensible transmise via Telegram ou Discord.

### 7.4 Rate limiting sur les endpoints publics

Les endpoints publics doivent être protégés par du **rate limiting**.

Objectifs :
- limiter l’abus automatisé,
- réduire les risques de brute force ou de spam,
- protéger les surfaces exposées contre les pics de trafic malveillant,
- préserver la disponibilité du service.

Le rate limiting doit être appliqué en priorité sur :
- endpoints publics,
- routes d’authentification exposées,
- APIs accessibles sans session utilisateur standard,
- points d’entrée susceptibles d’être ciblés par des bots.

---

## 8. Réponse à incident

### 8.1 Compromission d’un secret

En cas de secret compromis ou suspecté compromis :
1. **révoquer immédiatement** le secret concerné,
2. évaluer le périmètre d’exposition,
3. remplacer le secret par une nouvelle valeur,
4. vérifier les journaux et usages récents,
5. documenter l’incident et les remédiations.

Cela s’applique notamment aux :
- API keys,
- tokens OAuth,
- credentials de providers,
- secrets d’infrastructure ou d’intégration.

### 8.2 Expiration ou invalidation d’un token OAuth

En cas de token OAuth expiré :
- tenter un **refresh automatique** si le mécanisme est disponible et valide,
- sinon forcer une **déconnexion** ou une **ré-authentification**.

En cas d’invalidation ou de comportement anormal :
- suspendre l’usage du token,
- relancer un flux d’authentification propre,
- vérifier qu’aucune donnée sensible n’a été exposée via des logs ou erreurs applicatives.

### 8.3 Principe général

Tout incident de sécurité doit être traité avec les priorités suivantes :
1. containment,
2. révocation / isolation,
3. restauration sécurisée du service,
4. analyse de cause,
5. amélioration préventive.

---

## 9. Exigences de mise en œuvre

Les points suivants sont obligatoires pour toute évolution future :

- conserver la séparation stricte entre `vutler.ai` et `app.vutler.ai`,
- protéger toute route sensible par un auth guard adapté,
- ne jamais introduire de stockage en clair de secrets sensibles,
- ne jamais logger de tokens ou credentials,
- maintenir `store: false` pour Codex,
- ne jamais considérer un canal untrusted comme suffisant pour valider une action sensible,
- appliquer rate limiting sur les surfaces publiques,
- conserver l’isolation entre providers et entre tenants.

Toute nouvelle fonctionnalité doit être conçue avec ces règles comme baseline de sécurité, et non comme ajout ultérieur.
```

Si tu veux, je peux aussi te faire une **version “prête à commit” plus concise et plus normative**, avec un style un peu plus “policy/security standard” et moins descriptif.
