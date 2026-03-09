# Vutler — Grille Tarifaire Officielle v1

> **Document officiel** | Version 1.0 | 8 mars 2026  
> **Émetteur** : Starbox Group SA, Genève, Suisse  
> **Approuvé par** : Alex Lopez, CEO  
> **Classification** : Confidentiel — Investisseurs & Partenaires

---

## 1. Vue d'ensemble

Vutler est une plateforme de gestion et d'orchestration d'agents IA à destination des entreprises. Chaque plan inclut un **agent coordinateur** (Jarvis) hébergé dans le cloud, qui orchestre l'ensemble des agents workers.

Tous les prix sont exprimés en **USD**, facturés mensuellement.  
**Facturation annuelle** : 2 mois offerts (soit ~17 % de réduction).

---

## 2. Plans Cloud

| | **Free** | **Starter** | **Team** | **Enterprise** |
|:---|:---:|:---:|:---:|:---:|
| **Prix mensuel** | $0 | $29 | $79 | $199+ |
| **Agent coordinateur** | 1 inclus | 1 inclus | 1 inclus | 1 inclus |
| **Agents workers** | — | +$12/agent/mo | +$12/agent/mo | +$9/agent/mo |
| **Tokens inclus** | BYOK only | 500K | 2M | Custom |
| **BYOK (Bring Your Own Key)** | ✅ Gratuit | ✅ Gratuit | ✅ Gratuit | ✅ Gratuit |
| **Channels** | Webchat | Webchat + Email | Tous ¹ | Tous + Custom |
| **Utilisateurs** | 1 | 1 | 5 (+$5/user) | Illimité |
| **Drive (stockage)** | 100 MB | 2 GB | 10 GB | Illimité |
| **Support** | Community | Email | Priority | Dédié + SLA |

> ¹ *Tous = Webchat, Email, WhatsApp, Telegram, Slack, Discord*

---

## 3. Multiplicateur de Tokens

Les tokens consommés sont comptabilisés avec un **coefficient** selon le niveau du modèle utilisé :

| Tier | Modèles | Coefficient |
|:---|:---|:---:|
| **Economy** | Haiku, GPT-4o-mini | ×1 |
| **Standard** | GPT-4o, Claude Sonnet | ×3 |
| **Premium** | Claude Opus, GPT-4.5 | ×15 |
| **BYOK** | Tous (clé client) | ×0 — gratuit |

### Exemple concret

Un plan **Team** avec **2M tokens inclus** permet :

| Utilisation | Tokens effectifs |
|:---|:---:|
| 100 % Economy | **2 000 000** tokens |
| 100 % Standard | **~666 000** tokens |
| 100 % Premium | **~133 000** tokens |
| 100 % BYOK | **Illimité** (le client paie son fournisseur directement) |

> 💡 **BYOK est toujours gratuit** sur tous les plans. Le client fournit sa propre clé API (OpenAI, Anthropic, etc.) et ne consomme aucun token du forfait.

---

## 4. Nexus — Nœuds On-Premise

Nexus permet de déployer des agents directement sur l'infrastructure locale du client, tout en restant orchestrés par le coordinateur cloud.

### 4.1 Nexus Clone — $19/node/mo

| Caractéristique | Détail |
|:---|:---|
| **Description** | Miroir d'agents cloud déployé localement |
| **Personnalité & template** | Identique à l'agent cloud source |
| **Mémoire** | Propre mémoire locale (individuelle) |
| **Synchronisation** | Connaissances partagées via Snipara (formations, lessons learned) |
| **Disponible à partir de** | Plan **Starter** |
| **Seats inclus** | 1 seat |
| **Seats supplémentaires** | +$9/seat/mo |

### 4.2 Nexus Runtime — $39/node/mo

| Caractéristique | Détail |
|:---|:---|
| **Description** | Runtime autonome complet avec capacités étendues |
| **Agents dynamiques** | Peut demander des agents temporaires au coordinateur cloud |
| **Disponible à partir de** | Plan **Team** |
| **Seats inclus** | 2 seats |
| **Seats supplémentaires** | +$9/seat/mo |

### 4.3 Définition d'un Seat

Un **seat** = 1 emplacement d'agent sur le nœud Nexus. Trois modes d'utilisation :

| Mode | Description |
|:---|:---|
| **Agent fixe** | Agent déployé en permanence, configuré par l'utilisateur (ex : un agent DPO "Mike" local). Seul l'utilisateur assigne/désassigne. |
| **Agent dynamique** | Le coordinateur cloud (Jarvis) dispatche un agent existant ou crée un sous-agent à la demande. Le seat est libéré à la fin de la tâche. |
| **Burst** | Utilisation ponctuelle d'1 seat au-delà de la limite (politique de fair use — si récurrent, le client est invité à upgrader). |

### 4.4 Règle fondamentale

> **Le coordinateur reste dans le cloud.**  
> L'agent coordinateur (Jarvis) s'exécute **toujours** dans le cloud. Les nœuds Nexus n'exécutent que des agents workers. Jarvis orchestre et délègue vers Nexus selon les besoins.

---

## 5. Architecture Mémoire — 3 Niveaux

| Niveau | Portée | Description |
|:---|:---|:---|
| **1. Mémoire individuelle** | Par instance d'agent | Contexte local, historique de tâches. Spécifique à chaque déploiement. |
| **2. Mémoire partagée par type** | Par template d'agent | Formations, bonnes pratiques, lessons learned. "Knowledge pool" du template. Lecture seule pour les instances ; écriture via validation. |
| **3. Mémoire globale** | Plateforme entière | Contexte partagé (standards, processus). Accessible à tous les agents. |

### Cycle de vie sur Nexus

Lorsqu'un agent est instancié sur un nœud Nexus :

```
1. Charge la mémoire partagée de son type
   (formations, lessons learned de tous les agents du même template)
        ↓
2. Charge le contexte workspace
   (projets, équipe, historique)
        ↓
3. Exécute la tâche
        ↓
4. Les apprentissages pertinents remontent
   dans la mémoire partagée du type → effet réseau
```

---

## 6. Add-ons

| Add-on | Prix |
|:---|:---:|
| Agent cloud supplémentaire | +$12/mo *(Enterprise : +$9/mo)* |
| Seat Nexus supplémentaire | +$9/seat/mo |
| Tokens supplémentaires | +$5 / 500K tokens |
| Utilisateur supplémentaire (Team) | +$5/user/mo |
| Nœud Nexus Clone supplémentaire | +$19/node/mo |
| Nœud Nexus Runtime supplémentaire | +$39/node/mo |

---

## 7. Conditions Générales

- Tous les prix sont en **USD**, hors taxes applicables.
- **Facturation mensuelle** par défaut. Engagement annuel = **2 mois offerts**.
- **BYOK** (Bring Your Own Key) est **toujours gratuit** sur tous les plans.
- **Fair use** : la politique de burst sur les seats Nexus est soumise à un usage raisonnable. Un usage récurrent au-delà des limites entraîne une invitation à upgrader.
- Les plans Enterprise sont personnalisables sur demande.

---

## 8. Contact Commercial

| | |
|:---|:---|
| **Entreprise** | Starbox Group SA |
| **Siège** | Genève, Suisse |
| **Site** | [vutler.ai](https://vutler.ai) |
| **Email** | contact@starbox-group.com |

---

*Document approuvé par Alex Lopez, CEO — Starbox Group SA*  
*Date : 8 mars 2026*  
*Référence : VUTLER-PRICING-v1-2026-03-08*
