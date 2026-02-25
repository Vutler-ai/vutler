# Jarvis Session Backup - Feb 19, 2026

Session `4ecde8ae-320a-4400-8651-359f9aec7798` was reset due to 429 rate limit on long context (142k/200k tokens).

---

## Pending Queries / Open Tasks

### 1. Email Setup (Postal)
- Postal email server is live on VPS
- DNS configured for `mail.vutler.ai` and `starbox-group.com`
- **TODO:** Finish shared mailboxes (legal, terms, sales, etc.)
- **TODO:** Create `alex@starbox-group.com` with login credentials
- **TODO:** Create email signatures (like before)
- **TODO:** Migrate emails from old setup

### 2. Synology NAS / Drive
- NAS RS816 ordered (Marvell Armada 385, 2x4TB) - **user says it's now UP**
- **TODO:** Configure Synology NAS as KDrive replacement
- **TODO:** Integrate with agents for file storage

### 3. Agent Integration on Vutler
- All bots should be logged into Vutler chat with their own names (not user's name)
- **TODO:** Fix bot names/identities on Vutler
- **TODO:** Set up agents on Vutler platform

### 4. MiniMax M2.5 Backup
- MiniMax API key was provided as backup
- **TODO:** Verify MiniMax integration is working after gateway restart

### 5. Vutler App Bugs (from last session)
- Logo not appearing
- Sign-in redirects to ChatRocket instead of proper page
- Redirections need review
- Main page not PWA-compliant
- `/admin` redirects to `/home`
- Onboarding wizard deployed but needs testing

### 6. Sprint Status
- Completed through Sprint 11 (Mike + Philip)
- Sprint focus areas remaining:
  - Dashboard admin (copy from vaultbrix repo `Alopez3006/vaultbrix`)
  - `status.vaultbrix.com` copy for SLA status page
  - GDPR, cookies, terms, legal compliance
  - Integrations & automations (Google Drive, Office 365, plugins)
  - Mobile app (roadmap item)
  - Maintenance/debug agent for admin consoles
  - SOC2 procedures, pen tests for Vaultbrix

### 7. Snipara
- Snipara swarm integration in sprints
- `rlm_inject` parameter fix needed
- Enterprise API key and login URLs configured
- Rate limit was reset
- **TODO:** Add APIs for creating workspaces, projects, and keys
- **TODO:** Improve shared memory features

### 8. Pricing Study
- Luna completed pricing study
- Free tier: 1 agent BYOLLM, 100 queries + web page access
- **TODO:** Finalize pricing tiers

### 9. Architecture
- ADR-001 created for unified architecture (RC/Vaultbrix/Snipara)
- Vaultbrix PostgreSQL migration done
- **TODO:** Wire internal IPs between Vaultbrix and Vutler (same Infomaniak VPS network)

### 10. WhatsApp / Connectivity
- WhatsApp gateway had reconnection issues
- Multiple connectivity tests on Feb 19
- User was testing "hello" messages before session reset

---

## Infrastructure Summary
- **VPS:** Ubuntu 24.04 at 83.228.222.180 (Infomaniak)
- **Domains:** app.vutler.ai, vutler.ai, starbox-group.com, mail.vutler.ai
- **Services:** Rocket.Chat (rebranded as Vutler), Postal email, Vaultbrix DB
- **NAS:** Synology RS816 (now up, needs config)
- **Tailscale:** Connected via macbook-pro-de-lopez

---

*Session cleared to resolve 429 rate limit error on long-context Opus requests.*
