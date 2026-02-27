# Product Brief — Agents On-Premise (Hybrid Deploy)

**Produit :** Vutler Hybrid Agents
**Auteur :** Luna 🧪, Product Manager
**Date :** 27 février 2026
**Version :** 1.0
**Statut :** Draft pour review

---

## 1. Executive Summary

Vutler Hybrid Agents permet de déployer des agents IA directement dans l'infrastructure d'un client (on-premise) tout en maintenant une synchronisation sécurisée avec le cloud Vutler. L'agent tourne localement, accède aux systèmes internes du client (ERP, CRM, bases de données, fichiers) sans jamais exposer ces données au cloud. Seuls les résultats, rapports et métriques remontent via un tunnel chiffré.

**Proposition de valeur :** La puissance des agents Vutler, la sécurité du on-premise, la visibilité du cloud.

**Marché cible :** PME suisses, enterprises, MSPs (Managed Service Providers) qui ne peuvent pas envoyer leurs données dans le cloud mais veulent bénéficier de l'automatisation IA.

---

## 2. Problem Statement

### Le problème

Les entreprises suisses — particulièrement dans la finance, la santé et l'industrie — ont des **contraintes réglementaires et sécuritaires** qui empêchent l'envoi de données sensibles vers des services cloud. Résultat :

- **Pas d'accès aux outils IA modernes** pour automatiser leurs processus internes
- **Coût élevé** d'intégrations custom pour chaque système interne
- **Manque de visibilité** centralisée pour les MSPs qui gèrent plusieurs clients
- **Données silotées** : les systèmes internes (SAP, AD, bases métier) restent inaccessibles aux outils d'automatisation

### Pourquoi maintenant ?

- La demande d'agents IA explose, mais les solutions SaaS-only ne passent pas les audits de sécurité
- La LPD (Loi sur la Protection des Données suisse) renforce les exigences de localisation
- Les technologies de tunneling sécurisé (Tailscale, Cloudflare Tunnel) rendent le hybrid deploy accessible

---

## 3. Target Users

### 3.1 PME suisses (10-250 employés)
- Fiduciaires, cabinets comptables, bureaux d'ingénieurs
- Ont un ERP/CRM mais pas d'équipe IT dédiée
- Veulent automatiser sans complexité

### 3.2 Enterprises (250+ employés)
- Banques, assurances, pharma, industrie
- Contraintes réglementaires fortes (FINMA, Swissmedic)
- Équipe IT capable de gérer un déploiement Docker
- Budget conséquent, besoin de compliance

### 3.3 MSPs (Managed Service Providers)
- Gèrent l'IT de 10-100 clients
- Besoin d'un dashboard centralisé pour tous les agents déployés
- Facturation par client/agent
- Veulent une offre "agent IA managé" à revendre

### 3.4 Persona principal : Marc, IT Manager chez une fiduciaire
> "Je veux automatiser l'extraction de données depuis notre ERP pour générer des rapports mensuels, mais je ne peux pas envoyer les données comptables de nos clients dans le cloud."

---

## 4. User Stories

| # | Rôle | Story | Priorité |
|---|------|-------|----------|
| US-01 | IT Admin | Je veux déployer un agent Vutler en une commande Docker pour qu'il tourne sur notre serveur local | P0 |
| US-02 | IT Admin | Je veux que l'agent se connecte automatiquement au cloud Vutler via un tunnel sécurisé sans ouvrir de ports sur mon firewall | P0 |
| US-03 | Manager | Je veux voir tous mes agents déployés et leur statut sur un dashboard cloud | P0 |
| US-04 | Manager | Je veux recevoir les rapports générés par l'agent local directement dans Vutler cloud | P0 |
| US-05 | IT Admin | Je veux configurer l'agent depuis le cloud (missions, schedule, permissions) sans toucher au serveur | P1 |
| US-06 | MSP | Je veux déployer et gérer des agents chez plusieurs clients depuis une console unique | P1 |
| US-07 | Compliance | Je veux garantir que seuls les résumés/rapports remontent au cloud, jamais les données brutes | P0 |
| US-08 | Manager | Je veux que l'agent se connecte à notre SAP pour extraire automatiquement les données de facturation | P1 |
| US-09 | IT Admin | Je veux recevoir une alerte si un agent est offline depuis plus de 5 minutes | P1 |
| US-10 | Manager | Je veux planifier des audits récurrents que l'agent exécute localement et dont les résultats remontent au cloud | P1 |
| US-11 | IT Admin | Je veux mettre à jour l'agent automatiquement depuis le cloud sans intervention manuelle | P2 |
| US-12 | MSP | Je veux facturer mes clients par agent déployé avec un rapport d'utilisation mensuel | P2 |
| US-13 | Dev | Je veux créer des plugins/connecteurs custom pour les systèmes internes de mon entreprise | P2 |
| US-14 | IT Admin | Je veux que l'agent fonctionne même si la connexion cloud est temporairement coupée (mode offline) | P1 |

---

## 5. Use Cases détaillés

### 5.1 Rex Client — Audits & rapports récurrents

**Scénario :** Une fiduciaire déploie un agent chez chacun de ses clients PME. L'agent accède au système comptable local, génère des rapports mensuels (bilan, P&L, TVA) et les remonte au cloud Vutler où le fiduciaire les consulte.

- Agent installé sur le serveur du client
- Connecté à la base comptable (Abacus, Sage, Banana)
- Exécution planifiée : 1er de chaque mois
- Rapport PDF généré localement, uploadé au cloud
- Données comptables brutes **jamais** transmises

### 5.2 Intégration ERP/CRM

**Scénario :** Une entreprise industrielle connecte un agent à son SAP. L'agent extrait les commandes en cours, met à jour le CRM Salesforce avec les statuts de livraison, et génère des dashboards de suivi.

- Agent avec connecteurs SAP RFC + Salesforce API
- Sync bidirectionnelle : lit SAP → écrit Salesforce
- Résumés et KPIs remontés au cloud Vutler
- Exécution en temps réel ou batch (configurable)

### 5.3 Monitoring interne

**Scénario :** Un MSP déploie un agent de monitoring chez chaque client. L'agent surveille les serveurs, services, certificats SSL, espace disque, et alerte via Vutler en cas de problème.

- Agent léger qui tourne en continu
- Checks configurables depuis le cloud
- Alertes temps réel via Vutler → WhatsApp/email
- Métriques agrégées visibles sur le dashboard MSP
- Données détaillées restent locales

### 5.4 Data processing local

**Scénario :** Un cabinet médical traite les données patients localement (anonymisation, statistiques) et ne remonte que les rapports agrégés au cloud pour le reporting cantonal.

- Données sensibles (dossiers patients) jamais transmises
- Traitement NLP/ML local pour extraction d'insights
- Seuls les résumés anonymisés remontent
- Conformité LPD et secret médical garantie

---

## 6. Architecture technique

```
┌─────────────────────────────────────────────────────┐
│                   VUTLER CLOUD                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Dashboard │  │ Config   │  │ Rapport/Data      │  │
│  │ (monitoring│  │ Manager  │  │ Storage (S3)      │  │
│  │  agents)  │  │          │  │                   │  │
│  └─────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│        │              │                 │             │
│  ┌─────┴──────────────┴─────────────────┴──────────┐  │
│  │           Agent Gateway (API + WebSocket)        │  │
│  │           - Auth mTLS / JWT                      │  │
│  │           - Config push                          │  │
│  │           - Data ingestion                       │  │
│  └──────────────────────┬──────────────────────────┘  │
└─────────────────────────┼──────────────────────────────┘
                          │ Tunnel chiffré
                          │ (WireGuard / Cloudflare style)
                          │ Outbound-only (pas de port ouvert)
                          │
┌─────────────────────────┼──────────────────────────────┐
│  CLIENT NETWORK         │                              │
│                         │                              │
│  ┌──────────────────────┴───────────────────────────┐  │
│  │            VUTLER AGENT (Docker / Binary)         │  │
│  │                                                   │  │
│  │  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │  │
│  │  │ Scheduler │  │ Connector │  │ Data Filter  │  │  │
│  │  │ (cron)    │  │ Plugins   │  │ (ce qui      │  │  │
│  │  │           │  │ SAP/CRM/  │  │  remonte)    │  │  │
│  │  │           │  │ DB/Files  │  │              │  │  │
│  │  └───────────┘  └─────┬─────┘  └──────────────┘  │  │
│  │                       │                           │  │
│  └───────────────────────┼───────────────────────────┘  │
│                          │                              │
│  ┌───────────┐  ┌────────┴────────┐  ┌──────────────┐  │
│  │ SAP / ERP │  │ Base de données │  │ File Server  │  │
│  └───────────┘  └─────────────────┘  └──────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Composants clés

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| Agent Runtime | Go binary / Docker | Exécution des tâches localement |
| Tunnel | WireGuard (libp2p) | Connexion sécurisée outbound-only |
| Config Sync | gRPC bidirectionnel | Push config cloud → agent, push data agent → cloud |
| Connector Plugins | SDK Python/JS | Intégration aux systèmes locaux (SAP, DB, fichiers) |
| Data Filter | Rules engine | Contrôle strict de ce qui remonte au cloud |
| Agent Gateway | Go + WebSocket | Point d'entrée cloud pour tous les agents |
| Dashboard | React (Vutler UI) | Monitoring et gestion centralisée |

### Flux de données

1. **Déploiement** : `docker run vutler/agent --token=XXX` ou `curl install.vutler.ch | sh`
2. **Connexion** : L'agent initie une connexion sortante vers le cloud (pas de port entrant)
3. **Config** : Le cloud pousse la configuration (missions, schedule, permissions)
4. **Exécution** : L'agent exécute les tâches localement, accède aux systèmes internes
5. **Remontée** : Seuls les résultats filtrés (rapports, métriques, alertes) sont envoyés au cloud
6. **Monitoring** : Heartbeat toutes les 30s, métriques de santé, logs d'exécution

---

## 7. Security Model

### Principes

| Principe | Implémentation |
|----------|----------------|
| **Zero Trust** | Chaque agent a un certificat unique, rotation automatique |
| **Outbound-only** | Aucun port ouvert sur le réseau client |
| **Data minimization** | Seules les données explicitement autorisées remontent |
| **Encryption** | TLS 1.3 + WireGuard pour le tunnel |
| **Auth** | mTLS entre agent et cloud + JWT pour l'API |
| **Audit trail** | Chaque donnée remontée est loggée avec timestamp et hash |

### Data Filter Rules

```yaml
# Exemple de config Data Filter
data_filter:
  allow:
    - type: report
      format: [pdf, json]
      max_size: 10MB
    - type: metric
      fields: [cpu, memory, disk, custom.*]
    - type: alert
      severity: [warning, critical]
  deny:
    - type: raw_data
    - type: pii
    - pattern: "*.patient.*"
    - pattern: "*.salary.*"
```

### Compliance

- **LPD** : Données personnelles traitées localement uniquement
- **FINMA** : Audit trail complet, chiffrement bout en bout
- **ISO 27001** : Compatible avec les exigences de sécurité enterprise
- **SOC 2** : Prévu pour la phase 3

---

## 8. Pricing Model

### Par agent déployé

| Plan | Prix/mois/agent | Inclus |
|------|----------------|--------|
| **Starter** | CHF 49 | 1 agent, 5 missions/jour, 1 GB remontée, support email |
| **Pro** | CHF 149 | Agents illimités*, 50 missions/jour/agent, 10 GB, support prioritaire |
| **Enterprise** | Sur devis | Custom, SLA 99.9%, support dédié, audit compliance |
| **MSP** | CHF 99/agent | Volume discount dès 10 agents, dashboard multi-tenant, white-label |

*\* Fair use policy*

### Add-ons

| Add-on | Prix |
|--------|------|
| Connecteur SAP | CHF 50/mois |
| Connecteur Salesforce | CHF 30/mois |
| Connecteur custom (SDK) | Gratuit (self-service) |
| Stockage cloud additionnel | CHF 5/GB/mois |
| SLA 99.99% | +30% |

---

## 9. MVP Scope (2 semaines)

### Semaine 1 — Agent Core

| Jour | Tâche | Owner |
|------|-------|-------|
| L-M | Agent binary Go : runtime, heartbeat, config receiver | Backend |
| M-J | Tunnel outbound (WebSocket + TLS) vers Agent Gateway | Backend |
| J-V | Agent Gateway cloud : auth, config push, data ingestion | Backend |
| V | Script d'installation one-liner + Docker image | DevOps |

### Semaine 2 — Dashboard + Use Case

| Jour | Tâche | Owner |
|------|-------|-------|
| L-M | Dashboard cloud : liste agents, statut, logs | Frontend |
| M-J | Connecteur fichier/DB (SQLite, PostgreSQL) | Backend |
| J | Data Filter basique (allow/deny par type) | Backend |
| V | Use case demo : audit fichier local → rapport PDF cloud | Tous |

### MVP = ce qu'on livre

- ✅ Agent Docker déployable en une commande
- ✅ Tunnel sécurisé outbound-only
- ✅ Config push depuis le cloud
- ✅ Remontée de rapports/fichiers
- ✅ Dashboard basique (liste agents + statut)
- ✅ 1 connecteur (fichier/DB)
- ✅ Data filter basique

### MVP ≠ ce qu'on ne livre pas encore

- ❌ Auto-update de l'agent
- ❌ Connecteurs SAP/Salesforce
- ❌ Multi-tenant MSP
- ❌ Mode offline complet
- ❌ SDK plugins custom

---

## 10. Phases de rollout

### Phase 1 — MVP (Mars 2026)
- Agent core + tunnel + dashboard
- 3 beta-testeurs (clients existants Vutler)
- Use case : audit fichiers + rapports

### Phase 2 — Connecteurs (Avril 2026)
- Connecteurs ERP : SAP, Abacus, Banana
- Connecteurs CRM : Salesforce, HubSpot
- Connecteur DB : PostgreSQL, MySQL, MSSQL
- SDK pour connecteurs custom
- Mode offline (queue locale)

### Phase 3 — Enterprise & MSP (Mai-Juin 2026)
- Multi-tenant dashboard pour MSPs
- White-label
- SLA enterprise + audit compliance
- Auto-update des agents
- Marketplace de connecteurs

### Phase 4 — Scale (Q3 2026)
- Agent mesh (agents qui communiquent entre eux)
- Edge computing (ML local)
- Certification SOC 2
- Expansion DACH (Allemagne, Autriche)

---

## 11. Risques et mitigations

| # | Risque | Impact | Probabilité | Mitigation |
|---|--------|--------|-------------|------------|
| R1 | Complexité de déploiement chez le client | Haut | Moyen | One-liner install, Docker, doc claire, support onboarding |
| R2 | Problèmes réseau/firewall bloquant le tunnel | Haut | Moyen | Fallback HTTPS polling, mode WebSocket standard (port 443) |
| R3 | Fuite de données sensibles via l'agent | Critique | Faible | Data Filter strict, audit trail, revue de sécurité, pen-test |
| R4 | Agent offline prolongé (panne serveur client) | Moyen | Moyen | Queue locale, retry automatique, alertes admin |
| R5 | Adoption lente (marché conservateur) | Haut | Moyen | POC gratuit 30 jours, case studies, partenariats MSPs |
| R6 | Concurrence (Datadog, n8n self-hosted) | Moyen | Moyen | Focus sur la valeur IA + simplicité suisse |
| R7 | Maintenance multi-versions d'agents | Moyen | Haut | Auto-update, support N-1 uniquement, semver strict |
| R8 | Charge support onboarding | Moyen | Haut | Self-service install, vidéos tuto, FAQ, chatbot |

---

## 12. Métriques de succès

### North Star Metric
**Nombre d'agents actifs déployés** (heartbeat dans les dernières 24h)

### KPIs

| Métrique | Cible MVP (M+1) | Cible M+3 | Cible M+6 |
|----------|-----------------|-----------|-----------|
| Agents déployés | 10 | 50 | 200 |
| Clients avec agent | 3 | 15 | 50 |
| Uptime agents | 95% | 99% | 99.5% |
| Temps d'installation | < 15 min | < 10 min | < 5 min |
| Rapports générés/jour | 10 | 100 | 500 |
| MRR agents | CHF 500 | CHF 5'000 | CHF 25'000 |
| NPS | > 30 | > 40 | > 50 |
| Churn mensuel | < 15% | < 10% | < 5% |

### Métriques qualitatives
- Feedback beta-testeurs (NPS + interviews)
- Temps moyen de résolution d'un ticket onboarding
- Nombre de connecteurs custom créés par la communauté

---

## Annexe — Inspirations & références

| Produit | Ce qu'on reprend |
|---------|-----------------|
| **Datadog Agent** | Modèle agent local + dashboard cloud, auto-discovery |
| **Tailscale** | Tunnel mesh sécurisé, zero-config, outbound-only |
| **Cloudflare Tunnel** | Pas de port ouvert, installation simple |
| **Augment Context Connectors** | Indexation multi-sources, plugins extensibles |
| **Portainer** | Gestion de containers à distance, UI simple |

---

*Document généré par Luna 🧪 — Vutler Product Management*
*Prêt pour review lundi 1er mars 2026*
