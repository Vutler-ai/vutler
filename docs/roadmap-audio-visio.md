# 🎙️ Vutler — Roadmap Audio/Visio

> **Product Manager:** Luna 🧪
> **Date:** 2026-02-24
> **Version:** 1.0
> **Status:** Draft

---

## 📋 Résumé Exécutif

Ajout de capacités audio aux agents Vutler en 3 phases :

| Epic | Priorité | Story Points | Timeline estimée |
|------|----------|-------------|-----------------|
| 1 — Whisper STT | 🔴 HIGH | **34 SP** | Sprints 1-3 (6 sem) |
| 2 — Chatterbox TTS | 🟡 MEDIUM | **42 SP** | Sprints 4-7 (8 sem) |
| 3 — Audio Conferencing | 🟢 LOW | **55 SP** | Sprints 8-13 (12 sem) |
| **Total** | | **131 SP** | **~26 semaines** |

Vélocité estimée : **~10 SP/sprint** (sprints de 2 semaines, équipe de 2-3 devs)

---

## 🔧 Stack Technique

| Composant | Technologie | Licence |
|-----------|------------|---------|
| STT | OpenAI Whisper API (cloud) / whisper.cpp (self-hosted) | Propriétaire / MIT |
| TTS | Chatterbox (resemble-ai/chatterbox) | Apache 2.0 |
| Conferencing | Jitsi Meet (intégré RC) + WebRTC/SIP | Apache 2.0 |
| Backend | Rocket.Chat server (Meteor/Node.js) | AGPL |
| Agent Runtime | Vutler Agent Runtime | AGPL |
| Audio processing | FFmpeg | LGPL |

---

## Epic 1: Whisper STT — Audio Message Transcription 🔴 HIGH

**Objectif :** Transcrire automatiquement les messages audio pour que les agents puissent les comprendre.

**Dépendances :** Aucune (point d'entrée)

### User Stories

#### STT-1 · Intégration Whisper API — 5 SP
> **As a** developer,
> **I want** a Whisper API service module in the Vutler backend,
> **So that** I can send audio files and receive text transcriptions.

**Acceptance Criteria:**
- Module service avec client Whisper API (OpenAI)
- Support whisper-1 et futurs modèles
- Gestion erreurs, retry avec backoff exponentiel
- Tests unitaires avec mocks

#### STT-2 · Hook automatique upload audio → transcription — 8 SP
> **As a** user,
> **I want** my audio messages to be automatically transcribed when I send them,
> **So that** I don't have to type what I said.

**Acceptance Criteria:**
- Hook sur `afterFileUpload` détecte les fichiers audio
- Déclenche transcription async (job queue)
- Stocke le résultat lié au message original
- Ne bloque pas l'envoi du message

#### STT-3 · Support multi-formats audio — 3 SP
> **As a** user,
> **I want** to send audio in any common format (ogg, mp3, m4a, wav, webm),
> **So that** transcription works regardless of my device.

**Acceptance Criteria:**
- Détection MIME type fiable
- Conversion via FFmpeg si nécessaire (→ format optimal pour Whisper)
- Rejet gracieux des formats non supportés avec message explicite

#### STT-4 · Affichage transcription dans l'UI — 5 SP
> **As a** user,
> **I want** to see the transcription displayed below my audio message,
> **So that** I can verify what was understood.

**Acceptance Criteria:**
- Transcription affichée sous le player audio (collapsible)
- Indicateur "Transcribing..." pendant le traitement
- Bouton copier la transcription
- Responsive mobile

#### STT-5 · Transcription comme contexte agent — 5 SP
> **As an** agent,
> **I want** to receive the audio transcription as text context,
> **So that** I can understand and respond to voice messages.

**Acceptance Criteria:**
- Le message envoyé à l'Agent Runtime inclut la transcription
- Si transcription pas encore prête → attente avec timeout
- Fallback : notification "audio message received, transcription pending"

#### STT-6 · Configuration admin STT — 5 SP
> **As an** admin,
> **I want** to configure Whisper STT settings (enable/disable, model, API key),
> **So that** I control costs and behavior.

**Acceptance Criteria:**
- Page admin : toggle on/off, choix modèle (whisper-1, etc.)
- Champ API key (chiffré)
- Option self-hosted vs cloud
- Langue par défaut / auto-detect
- Limite taille fichier configurable

#### STT-7 · Détection de langue automatique — 3 SP
> **As a** user,
> **I want** the system to automatically detect the language of my audio,
> **So that** transcription works in any language without configuration.

**Acceptance Criteria:**
- Utilise le language detection de Whisper
- Affiche la langue détectée
- Override possible par l'utilisateur

**Total Epic 1 : 34 SP**

---

## Epic 2: Chatterbox TTS — Agent Voice Personalities 🟡 MEDIUM

**Objectif :** Donner une voix unique à chaque agent pour des réponses audio naturelles.

**Dépendances :** Epic 1 (STT nécessaire pour le flow complet audio-in → audio-out)

### User Stories

#### TTS-1 · Intégration Chatterbox TTS — 8 SP
> **As a** developer,
> **I want** a Chatterbox TTS service running alongside Vutler,
> **So that** agents can convert text responses to speech.

**Acceptance Criteria:**
- Service Chatterbox déployé (Docker)
- API interne : texte → audio (wav/ogg)
- Queue de génération avec priorités
- Health check et monitoring
- GPU support optionnel (CPU fallback)

#### TTS-2 · Voice profile par agent — 5 SP
> **As a** builder,
> **I want** to assign a voice profile to each agent in the Agent Builder,
> **So that** each agent has a distinct voice personality.

**Acceptance Criteria:**
- Dropdown voix dans Agent Builder
- Preview audio (bouton "écouter")
- Paramètres : pitch, speed, style
- Sauvegarde dans la config agent

#### TTS-3 · Toggle "répondre en audio" par agent — 3 SP
> **As a** builder,
> **I want** to enable/disable audio responses per agent,
> **So that** only relevant agents respond with voice.

**Acceptance Criteria:**
- Toggle dans Agent Builder
- Modes : "always audio", "audio when user sends audio", "text only"
- Override possible par l'utilisateur dans le chat

#### TTS-4 · Génération et envoi de messages audio — 8 SP
> **As a** user,
> **I want** the agent to respond with an audio message in the chat,
> **So that** I can listen to responses hands-free.

**Acceptance Criteria:**
- Réponse agent → TTS → fichier audio → message audio dans RC
- Player audio standard RC
- Transcription texte incluse (accessibility)
- Latence < 5s pour réponses courtes (< 100 mots)

#### TTS-5 · Voice cloning — upload sample — 8 SP
> **As a** builder,
> **I want** to upload a voice sample to create a custom voice for my agent,
> **So that** the agent sounds exactly how I want.

**Acceptance Criteria:**
- Upload 10-30s d'audio sample
- Chatterbox voice cloning pipeline
- Preview avant validation
- Stockage sécurisé des voice models
- Avertissement légal / consent

#### TTS-6 · Bibliothèque de voix par défaut — 5 SP
> **As a** builder,
> **I want** a library of 5-10 default voices to choose from,
> **So that** I can quickly give my agent a voice without cloning.

**Acceptance Criteria:**
- 5-10 voix variées (genre, âge, ton)
- Noms et descriptions clairs
- Preview pour chaque voix
- Incluses dans le déploiement par défaut

#### TTS-7 · Configuration admin TTS — 5 SP
> **As an** admin,
> **I want** to manage TTS settings globally,
> **So that** I control resource usage and available voices.

**Acceptance Criteria:**
- Enable/disable TTS globalement
- Enable/disable per agent
- Gestion des voix custom (supprimer, limiter)
- Limites : max audio length, rate limiting
- Monitoring usage GPU/CPU

**Total Epic 2 : 42 SP**

---

## Epic 3: Agent Audio Conferencing 🟢 LOW

**Objectif :** Permettre aux agents de participer à des conférences audio en temps réel.

**Dépendances :** Epic 1 (STT) + Epic 2 (TTS) requis

### User Stories

#### CONF-1 · Bridge Jitsi ↔ Agent Runtime — 8 SP
> **As a** developer,
> **I want** a bridge between Jitsi Meet and the Agent Runtime,
> **So that** agents can connect to audio conferences.

**Acceptance Criteria:**
- Service bridge Jitsi ↔ Agent Runtime
- Connection via Jitsi external API ou lib-jitsi-meet
- Audio stream bidirectionnel
- Gestion connexion/déconnexion propre

#### CONF-2 · Agent rejoint une conf audio-only — 8 SP
> **As a** user,
> **I want** to invite an agent to join my audio conference,
> **So that** the agent can participate in real-time discussions.

**Acceptance Criteria:**
- Commande `/invite-agent @agentname` dans la conf
- Agent rejoint en audio-only (pas de vidéo)
- Nom de l'agent affiché dans la liste des participants
- Agent peut être retiré de la conf

#### CONF-3 · Pipeline real-time STT → LLM → TTS — 13 SP
> **As a** user,
> **I want** the agent to listen, think, and respond in real-time during a conference,
> **So that** the conversation flows naturally.

**Acceptance Criteria:**
- Audio stream → chunks → Whisper STT (streaming si possible)
- Transcription → LLM (Agent Runtime)
- Réponse LLM → Chatterbox TTS → audio stream retour
- Latence totale < 3s (objectif), < 5s (acceptable)
- Buffer audio pour fluidité

#### CONF-4 · Turn-taking et détection fin de parole — 8 SP
> **As a** user,
> **I want** the agent to wait until I finish speaking before responding,
> **So that** it doesn't interrupt me.

**Acceptance Criteria:**
- VAD (Voice Activity Detection) pour détecter fin de parole
- Silence threshold configurable (default 1.5s)
- L'agent ne commence pas à parler si quelqu'un parle
- Interruption gracieuse si l'utilisateur reprend la parole

#### CONF-5 · Multi-agent en conférence — 5 SP
> **As a** user,
> **I want** multiple agents in the same conference,
> **So that** I can have a multi-expert discussion.

**Acceptance Criteria:**
- Jusqu'à 3 agents simultanés par conf
- Chaque agent a sa voix distincte
- Coordination : un seul agent parle à la fois
- Round-robin ou "raise hand" logic

#### CONF-6 · UI — agents dans la room — 3 SP
> **As a** user,
> **I want** to see which agents are in the conference room,
> **So that** I know who's listening.

**Acceptance Criteria:**
- Avatar agent dans la liste participants Jitsi
- Badge "AI Agent" distinctif
- Status : listening / thinking / speaking

#### CONF-7 · Indicateur "agent is thinking" — 3 SP
> **As a** user,
> **I want** to see when an agent is processing my question,
> **So that** I know it heard me and is working on a response.

**Acceptance Criteria:**
- Indicateur visuel dans l'UI Jitsi (animation)
- Indicateur audio optionnel (subtle sound)
- Timeout : si > 10s → notification "still thinking"

#### CONF-8 · Fallback texte si audio fail — 3 SP
> **As a** user,
> **I want** the agent to fall back to text chat if audio fails,
> **So that** I still get a response.

**Acceptance Criteria:**
- Détection failure TTS / audio stream
- Envoi réponse en texte dans le chat de la room
- Notification "Audio unavailable, responding in text"
- Auto-retry audio après recovery

#### CONF-9 · Configuration conférence agents — 4 SP
> **As an** admin,
> **I want** to configure which agents can join conferences,
> **So that** I control resource usage and access.

**Acceptance Criteria:**
- Permission "can join conferences" par agent
- Limite max agents par conf (global)
- Enable/disable conferencing globalement
- Monitoring : agents actifs en conf, durée, usage

**Total Epic 3 : 55 SP**

---

## 📊 Dependencies

```
Epic 1 (Whisper STT)
  └──→ Epic 2 (Chatterbox TTS)  [STT nécessaire pour flow audio complet]
         └──→ Epic 3 (Conferencing)  [STT + TTS requis]

STT-1 → STT-2 → STT-5 (service → hook → agent context)
STT-3 (parallel avec STT-2)
STT-4 (parallel avec STT-2, besoin STT-2 pour données)
STT-6 (parallel)
STT-7 (parallel)

TTS-1 → TTS-4 (service → génération messages)
TTS-2, TTS-3 (parallel, après TTS-1)
TTS-5 (après TTS-1, complexe)
TTS-6 (parallel avec TTS-1)

CONF-1 → CONF-2 → CONF-3 (bridge → join → pipeline)
CONF-4 (après CONF-3)
CONF-5 (après CONF-3)
CONF-6, CONF-7 (parallel, après CONF-2)
CONF-8 (après CONF-3)
CONF-9 (parallel)
```

---

## 🗓️ Sprint Planning

| Sprint | Semaines | Stories | SP |
|--------|----------|---------|-----|
| **Sprint 1** | S1-2 | STT-1, STT-3 | 8 |
| **Sprint 2** | S3-4 | STT-2, STT-7 | 11 |
| **Sprint 3** | S5-6 | STT-4, STT-5, STT-6 | 15 |
| *— Release Phase 1 —* | | | **34** |
| **Sprint 4** | S7-8 | TTS-1 | 8 |
| **Sprint 5** | S9-10 | TTS-2, TTS-3, TTS-6 | 13 |
| **Sprint 6** | S11-12 | TTS-4, TTS-7 | 13 |
| **Sprint 7** | S13-14 | TTS-5 + polish | 8 |
| *— Release Phase 2 —* | | | **42** |
| **Sprint 8** | S15-16 | CONF-1, CONF-9 | 12 |
| **Sprint 9** | S17-18 | CONF-2, CONF-6 | 11 |
| **Sprint 10** | S19-20 | CONF-3 | 13 |
| **Sprint 11** | S21-22 | CONF-4, CONF-7 | 11 |
| **Sprint 12** | S23-24 | CONF-5, CONF-8 | 8 |
| **Sprint 13** | S25-26 | Integration testing + polish | — |
| *— Release Phase 3 —* | | | **55** |

---

## ⚠️ Risques Techniques

| # | Risque | Impact | Probabilité | Mitigation |
|---|--------|--------|-------------|-----------|
| R1 | Latence Whisper API en pic | Transcription lente → mauvaise UX | Moyenne | Queue async, cache, option self-hosted whisper.cpp |
| R2 | Coûts API Whisper élevés | Budget dépassé | Moyenne | Monitoring usage, limites admin, option self-hosted |
| R3 | Qualité Chatterbox insuffisante | Voix robotique → adoption faible | Moyenne | Benchmarks early, fallback vers autre TTS (Piper, Coqui) |
| R4 | GPU nécessaire pour Chatterbox | Coût infra élevé | Haute | CPU fallback (plus lent), GPU cloud on-demand |
| R5 | Latence pipeline real-time conf | > 5s = conversation impossible | Haute | Whisper streaming, optimisation pipeline, pre-buffering |
| R6 | Intégration Jitsi complexe | API Jitsi pas prévue pour bots audio | Haute | POC early (Sprint 8), alternative : SIP gateway |
| R7 | Turn-taking imprécis | Agent interrompt ou ne répond pas | Moyenne | VAD tuning, threshold configurable, user feedback loop |
| R8 | Formats audio incompatibles | Certains devices envoient des formats exotiques | Faible | FFmpeg conversion, whitelist formats supportés |
| R9 | Legal — voice cloning | Problèmes de consent / deepfake | Moyenne | Avertissement obligatoire, consent checkbox, audit log |

---

## 🎯 Métriques de Succès

| Métrique | Cible Phase 1 | Cible Phase 2 | Cible Phase 3 |
|----------|--------------|--------------|--------------|
| Transcription accuracy | > 95% (EN/FR) | — | — |
| Transcription latency | < 3s (30s audio) | — | — |
| TTS naturalness (MOS) | — | > 3.5/5 | — |
| TTS latency | — | < 5s (100 mots) | — |
| Conference round-trip | — | — | < 5s |
| Agent adoption rate | — | — | > 30% agents avec voice |

---

*Document généré par Luna 🧪 — Vutler Product Management*
*Dernière mise à jour : 2026-02-24*
