# Vutler Nexus - Tâches Additionnelles

**Date:** 2026-03-01 20:36  
**Owner:** Jarvis

---

## 🎯 Nouvelles Tâches

### Task 1: Nexus & Setup Buttons Visual State
**Issue:** Boutons Nexus et Setup doivent "s'allumer" quand configurés

**Current:** Boutons statiques sans indication de statut

**Target:** 
- Bouton Nexus: Badge vert "Connected" si Nexus actif, gris "Not configured" sinon
- Bouton Setup: Badge "Complete" si workspace initialisé, "Pending" sinon

**Implementation:**
- Frontend: Check Nexus status via `/api/v1/nexus/status`
- Frontend: Check Setup status via `/api/v1/setup/status`
- UI: Badge component avec états (success, warning, inactive)

**Files:**
- `/home/ubuntu/vutler/frontend/src/components/sidebar.tsx` (ou layout)
- `/home/ubuntu/vutler/app/custom/api/nexus-api.js` (add `/status` endpoint)
- `/home/ubuntu/vutler/app/custom/api/setup.js` (add `/status` endpoint)

**Acceptance:**
- [ ] Nexus button affiche badge vert si instance connectée
- [ ] Setup button affiche badge vert si workspace configuré
- [ ] Badges update en real-time (WebSocket ou polling)

---

### Task 2: Configuration Nexus sur MacBook Pro Remote (Jarvis)
**Goal:** Installer et configurer @vutler/nexus sur le MacBook Pro d'Alex (remote) pour Jarvis

**Architecture:**
- **Mac actuel (local):** OpenClaw tourne ici (ce Mac)
- **MacBook Pro (remote):** Nexus Jarvis tourne là-bas
- **Connexion:** Via Tailscale

**Steps:**

**1. Vérifier Tailscale**
```bash
# Sur Mac local (où OpenClaw tourne)
tailscale status | grep macbook
# Note l'IP Tailscale du MacBook Pro (ex: 100.x.x.x)
```

**2. SSH vers MacBook Pro via Tailscale**
```bash
# Depuis Mac local
ssh alex@100.x.x.x  # IP Tailscale du MacBook Pro
# ou
ssh alex@macbook-pro.tail<hash>.ts.net
```

**3. Installation Nexus sur MacBook Pro**
```bash
# Sur MacBook Pro (via SSH Tailscale)
cd ~
npm install -g @vutler/nexus
# ou
npx @vutler/nexus@latest init
```

**2. Configuration**
```bash
# Generate pairing token from Vutler cloud
# Via UI: Settings → Nexus → Add Instance → Get Token

# On Mac
vutler-nexus pair --token <TOKEN_FROM_CLOUD>
```

**3. Config file (`~/.vutler/config.json`)**
```json
{
  "workspaceId": "alex-workspace-id",
  "nexusId": "jarvis-nexus-mac",
  "tunnelUrl": "wss://app.vutler.ai/nexus/tunnel",
  "llmProviders": {
    "openrouter": {
      "apiKey": "sk-or-v1-...",
      "defaultModel": "google/gemini-2.0-flash-thinking-exp:free"
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "defaultModel": "claude-opus-4"
    }
  },
  "agents": [
    {
      "id": "jarvis",
      "name": "Jarvis",
      "model": "google/gemini-2.0-flash-thinking-exp:free",
      "role": "coordinator"
    }
  ]
}
```

**4. Start Nexus**
```bash
vutler-nexus start --daemon
```

**5. Verify Connection**
```bash
vutler-nexus status
# Should show: ✅ Connected to app.vutler.ai
```

**6. Integration avec OpenClaw**
- OpenClaw continue à tourner sur Mac
- Jarvis agent dans Vutler Nexus prend le relais progressivement
- Dual-mode: OpenClaw + Vutler Nexus en parallèle d'abord
- Migration progressive des agents

**Acceptance:**
- [ ] Nexus installé sur Mac d'Alex
- [ ] Paired avec workspace Vutler cloud
- [ ] Jarvis agent créé et opérationnel
- [ ] OpenRouter configuré (Gemini 2.0 Flash)
- [ ] Connexion visible dans Vutler UI (badge vert)

---

## 📅 Timeline

**Task 1 (Buttons UI):** 
- Priority: P1 (bundle avec bug fixes)
- Effort: 2-3 SP
- Owner: Mike (Kimi K2.5)

**Task 2 (Nexus Mac Setup):**
- Priority: P1 (après stabilisation)
- Effort: 1h (config manuelle Jarvis)
- Owner: Jarvis (je le fais moi-même)

---

## 🔗 Dependencies

**Task 1 depends on:**
- Bug #2 fix (Nexus Registration) ✅ Done
- Bug #3 fix (Setup Token) ✅ Done

**Task 2 depends on:**
- Task 1 complete (Nexus status endpoint)
- Nexus package published to npm
- Cloud tunnel server running on VPS

---

## 📝 Notes

**Nexus Architecture:**
```
Alex's Mac (Nexus)
    ↓ WebSocket tunnel
app.vutler.ai (Cloud)
    ↓ API calls
OpenRouter / Anthropic / etc.
```

**Benefits:**
- Jarvis runs locally → no cloud compute cost
- Uses OpenRouter credits → Alex controls budget
- Data stays local → privacy
- Can work offline (local models later)

**OpenClaw Migration Path:**
- Phase 1: Dual run (OpenClaw + Vutler Nexus)
- Phase 2: Critical agents migrate to Vutler
- Phase 3: OpenClaw sunset, Vutler only
