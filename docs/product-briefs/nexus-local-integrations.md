# Product Brief: Nexus Local Integrations

**Date:** 2026-03-29
**Author:** Alejandro Lopez
**Status:** Draft

---

## Executive Summary

Permettre aux agents Vutler d'accéder aux fichiers, apps et données directement sur le PC/Mac de l'utilisateur via Nexus (agent local Node.js), au lieu de construire des intégrations cloud coûteuses (Google Drive API, OneDrive API, etc.). L'utilisateur parle à ses agents sur Vutler Cloud, et Nexus exécute les actions localement — recherche de fichiers, lecture de documents, ouverture d'apps, extraction de données structurées.

---

## Problem Statement

**User Problem:**
Les utilisateurs professionnels ont leurs fichiers, emails et données éparpillés entre leur PC et des services cloud (Google Drive, OneDrive, Dropbox). Pour qu'un agent AI puisse les aider, il faut aujourd'hui intégrer chaque service cloud individuellement via OAuth — ce qui est lent à développer, fragile à maintenir, et pose des questions de confidentialité.

**Evidence:**
- Chaque intégration cloud (Google Drive, OneDrive) nécessite ~2-4 semaines de dev + maintenance continue (token refresh, API changes, rate limits)
- 90%+ des utilisateurs de Google Drive/OneDrive ont le sync local activé — les fichiers sont déjà sur leur machine
- Les utilisateurs business manipulent des documents locaux quotidiennement (factures PDF, fichiers Excel, documents Word) sans les uploader systématiquement dans le cloud
- Les démos actuelles de Vutler ne peuvent pas montrer d'interaction concrète avec les données réelles de l'utilisateur

**Impact if Unsolved:**
- Time-to-market ralenti par la dette d'intégration cloud (OAuth, tokens, scopes par provider)
- Impossibilité de faire des démos convaincantes montrant Vutler travaillant avec les données réelles du prospect
- Perte de différenciation vs concurrents qui proposent les mêmes intégrations cloud génériques
- Données sensibles des clients transitant par nos serveurs sans nécessité

---

## Target Users

**Primary Persona — Le Dirigeant PME (5-50 personnes):**
- **Who:** CEO/COO de PME, 35-55 ans, gère opérations + finance + RH
- **Current Behavior:** Fichiers sur Google Drive sync + dossiers locaux. Passe 2h/jour à chercher des documents, compiler des données depuis Excel/PDF, répondre à des emails. Utilise 5-10 apps différentes.
- **Pain Points:**
  1. "Je sais que j'ai ce document quelque part mais impossible de le retrouver"
  2. "Compiler les frais du mois me prend une journée entière"
  3. "Je ne veux pas donner accès à tout mon Drive à un outil tiers"

**Secondary Persona — Le Solopreneur/Freelance:**
- **Who:** Indépendant ou micro-entrepreneur, tech-comfortable mais pas développeur
- **Current Behavior:** Travaille principalement depuis un seul PC/Mac. Fichiers locaux + quelques services cloud. Budget limité, sensible à la simplicité d'installation.
- **Pain Points:**
  1. "Je n'ai pas le temps de configurer des intégrations complexes"
  2. "Je veux un assistant qui voit ce que je vois sur mon écran"

---

## Value Proposition

**For** dirigeants de PME et solopreneurs
**Who** ont besoin d'un assistant AI qui travaille avec leurs données réelles
**The** Nexus Local Agent **is a** passerelle intelligente entre Vutler Cloud et le poste de travail
**That** donne aux agents AI un accès direct et sécurisé aux fichiers, apps et données locales
**Unlike** les plateformes qui nécessitent des intégrations cloud OAuth pour chaque service
**Our product** fonctionne immédiatement avec les données existantes, sans configuration par provider, et sans qu'aucune donnée ne quitte la machine sauf ce que l'agent envoie explicitement

---

## Solution Overview

### Core Features (Must-Have — MVP Démo)

1. **Recherche intelligente de fichiers** — L'agent cherche un document par description en langage naturel sur tout le PC (utilise Spotlight/mdfind sur macOS, Windows Search sur Windows). Couvre automatiquement Google Drive sync, OneDrive sync, Dropbox, et tout fichier local.
   - *"Jarvis, cherche sur mon PC le document qui parle de XYZ"*

2. **Lecture et analyse de documents** — L'agent ouvre et comprend le contenu de fichiers courants (PDF, Excel, Word, CSV, TXT, images). Extraction de texte, tableaux, données structurées.
   - *"Fais-moi une liste des frais engagés en mars pour tout le personnel"* (scanne les fichiers Excel/PDF dans un dossier)

3. **Ouverture de fichiers/apps** — L'agent peut ouvrir un fichier dans son application par défaut sur le poste local.
   - *"Ouvre-le"* après avoir trouvé le document

4. **Permissions granulaires** — L'utilisateur contrôle exactement quels dossiers et actions Nexus peut accéder. Chaque accès est loggé et visible.

### Phase 2 Features (Post-démo)

5. **Watch folders & triggers** — Nexus surveille un dossier (ex: Downloads) et déclenche un agent quand un nouveau fichier apparaît (ex: nouvelle facture PDF → extraction automatique).

6. **Clipboard integration** — L'agent réagit à ce que l'utilisateur copie. "Copie un email → l'agent le traite automatiquement."

7. **Apple Mail / Outlook local** — Lecture des emails via AppleScript (macOS) ou COM (Windows), sans OAuth, sans token, sans API cloud.

8. **Apple Calendar / Outlook Calendar local** — Lecture des événements, détection de conflits, planification.

9. **Contacts locaux** — Accès au carnet d'adresses macOS/Windows pour enrichissement CRM.

10. **Screenshot + OCR** — Capture d'écran + analyse visuelle. "Qu'est-ce que tu vois sur mon écran ?"

### Success Looks Like:
- Un prospect voit en démo son agent trouver un vrai fichier sur son PC en < 5 secondes
- L'agent compile des données depuis des fichiers Excel locaux sans configuration préalable
- Zero OAuth flow pendant l'onboarding — l'utilisateur installe Nexus et ça fonctionne
- Les fichiers ne quittent jamais la machine (seul le résumé/analyse remonte au cloud)

---

## Market Context

**Competitive Landscape:**
- **Microsoft Copilot** — Accès natif aux fichiers Microsoft, mais enfermé dans l'écosystème M365. Ne couvre pas les fichiers hors OneDrive. Pas d'agents personnalisables.
- **Google Duet AI** — Idem pour l'écosystème Google. Pas d'accès aux fichiers locaux.
- **Dust.tt / Relevance AI** — Intégrations cloud uniquement (Google Drive API, Notion API). Même problème OAuth. Pas d'accès local.
- **Open Interpreter / Aider** — Accès local mais 100% technique (CLI), pas pour des business users. Pas de cloud, pas d'agents persistants.
- **Claude Code / Cowork (Anthropic)** — Hybrid cloud+local, mais orienté développeurs et power-users. Pas d'agents business personnalisables, pas de workflow métier (vente, finance, ops).

**Gap we fill:** Claude (Cowork) propose du hybrid cloud+local, mais pour les devs. Aucun concurrent ne combine agents AI business personnalisables (vente, finance, ops) + accès natif aux fichiers/apps locaux avec une UX accessible aux non-techs. Vutler est la première plateforme hybrid pour l'automatisation business des PME.

**Market Opportunity:**
- Le marché des AI assistants pour PME est en explosion (TAM $15B+ d'ici 2028)
- La fatigue des intégrations OAuth est réelle — chaque nouveau SaaS = un nouveau flux d'auth à maintenir
- Le RGPD et la sensibilité privacy poussent vers des solutions "data stays local"
- Les utilisateurs macOS représentent 25-30% du marché business, avec des outils natifs sous-exploités (Spotlight, AppleScript)

---

## Strategic Fit

**Business Goals:**
- **Démos convaincantes** — Montrer Vutler travaillant avec les données réelles du prospect, pas une sandbox vide
- **Time-to-market** — Shipper des intégrations "fichiers" sans les 2-4 semaines par provider cloud
- **Différenciation** — Positionnement "privacy-first + local-first" unique sur le marché
- **Réduction de la dette technique** — Moins d'intégrations cloud à maintenir = plus de bande passante pour le core product

**Why Now:**
- Les démos approchent et il faut montrer de la valeur concrète
- Nexus existe déjà avec filesystem + shell + WebSocket polling + agent routing — les fondations sont là
- Les LLMs sont assez bons pour faire de l'extraction de données depuis des documents (PDF, Excel) localement
- Le timing marché est parfait : post-hype AI, les prospects veulent voir des résultats concrets, pas des promesses d'intégration

---

## Existing Foundation (Nexus Audit)

### Ce qui existe déjà

| Composant | Status | Détail |
|-----------|--------|--------|
| Runtime Node.js local | ✅ Fait | `packages/nexus/` — process autonome |
| Communication cloud | ✅ Fait | HTTP polling toutes les 10s vers Vutler API |
| Agent routing | ✅ Fait | Dispatch par regex + fallback, multi-agent |
| FilesystemProvider | ⚠️ Basique | read/write/list/stat/delete — pas de recherche récursive ni glob |
| ShellProvider | ✅ Fait | exec sync/async avec whitelist/blacklist |
| CLI (`vutler-nexus`) | ✅ Fait | init/start/dev/status/logs/agents |
| Dashboard local | ✅ Fait | Port 3100, health + status + agents |
| LLM local (Ollama) | ✅ Fait | Fallback Ollama → OpenAI → Cloud |
| Snipara memory | ✅ Fait | Auto-recall/store par agent |

### Ce qu'il faut construire

| Composant | Priorité | Effort estimé |
|-----------|----------|---------------|
| SearchProvider (Spotlight/Windows Search) | P0 | ~3 jours |
| FilesystemProvider v2 (glob, recursive, binary read) | P0 | ~2 jours |
| DocumentReader (PDF, Excel, Word, CSV) | P0 | ~3 jours |
| AppLauncher (open file in default app) | P0 | ~1 jour |
| Permission system (folder ACLs, action whitelist) | P0 | ~2 jours |
| Cloud ↔ Nexus task protocol for local actions | P0 | ~2 jours |
| Installer cross-platform (macOS .dmg + Windows .exe) | P1 | ~5 jours |
| WatchProvider (chokidar file watcher) | P1 | ~2 jours |
| ClipboardProvider | P1 | ~1 jour |
| AppleScriptProvider (Mail, Calendar, Contacts) | P1 | ~4 jours |
| WindowsAutomationProvider (COM/PowerShell) | P1 | ~4 jours |
| ScreenshotProvider + OCR | P2 | ~3 jours |

---

## Constraints & Assumptions

**Constraints:**
- macOS et Windows doivent être supportés dès le MVP (les démos peuvent être sur l'un ou l'autre)
- Nexus doit être installable par un non-dev (pas de `npm install` en CLI)
- Les fichiers ne doivent JAMAIS transiter intégralement vers le cloud — seuls les résumés/extractions remontent
- Le ShellProvider existant utilise `execSync` avec parsing naïf des arguments — à sécuriser
- Pas de budget infra supplémentaire — tout tourne sur le PC de l'utilisateur

**Key Assumptions:**
- Les prospects de démo auront un Mac ou PC avec des fichiers réels accessibles
- Google Drive / OneDrive sync local est activé chez 90%+ des utilisateurs cibles
- `mdfind` (Spotlight) sur macOS et `Windows Search` couvrent suffisamment de formats pour la recherche full-text
- Les bibliothèques Node.js pour parser PDF/Excel/Word (pdf-parse, xlsx, mammoth) sont assez fiables pour un MVP
- L'utilisateur acceptera d'installer une app desktop (comme Slack, Notion, etc.)

---

## Next Steps

1. **Valider le brief** — Review avec l'équipe, ajuster le scope MVP — Alejandro — immédiat
2. **Architecture technique** — Spec détaillée des providers, protocol cloud↔nexus, security model — Claude/Dev — post-validation
3. **Spike technique** — Prototype SearchProvider + DocumentReader sur macOS — Dev — 3 jours
4. **Installer MVP** — Electron wrapper ou pkg pour distribution .dmg/.exe — Dev — 5 jours
5. **Scénario de démo** — Scripting du parcours démo end-to-end — Alejandro — en parallèle du dev

**Decision Needed By:** 2026-04-02 (pour tenir un planning démo Q2)
