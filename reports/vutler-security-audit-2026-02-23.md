# 🛡️ Vutler Security Audit Report
**Date:** 2026-02-23 | **Auditor:** Rex (Automated) | **Target:** 83.228.222.180 (app.vutler.ai)

---

## Score Global: 52/100 ⚠️

---

## Findings

### 🔴 CRITIQUE (3)

**C1 — API Key Snipara hardcodée dans le code source**
- `api/knowledge.js:37` et `api/memory.js:11` contiennent une clé API Snipara en clair
- `rlm_b23016032ec4bc37df82fcf75a2dceb0623c9f5d8d8283dd634872a88bdf9056`
- **Impact:** Compromission de la clé si le repo fuite. Violation SOC2 CC6.1
- **Fix:** Déplacer vers variable d'environnement. Rotation immédiate de la clé.

**C2 — Firewall désactivé (UFW inactive, iptables ACCEPT ALL en INPUT)**
- UFW: `Status: inactive`
- iptables INPUT policy: `ACCEPT` — aucune restriction
- Tous les ports Docker sont exposés publiquement sur 0.0.0.0
- **Impact:** Surface d'attaque maximale. Violation SOC2 CC6.6
- **Fix:** Activer UFW, whitelist 22/80/443 uniquement.

**C3 — Ports SMTP exposés publiquement (25, 587, 1025)**
- Postal SMTP écoute sur 0.0.0.0:25 et 0.0.0.0:587
- MailHog sur 0.0.0.0:1025 et 0.0.0.0:8025
- **Impact:** Relay ouvert potentiel, spam, abus. Port 3001 aussi accessible (retourne 200)
- **Fix:** Bind aux interfaces internes ou restreindre via firewall.

### 🟡 WARNING (5)

**W1 — Containers Docker tournant en root (5/11)**
- `vutler-api`, `postal-rabbitmq`, `postal-mariadb`, `vutler-postgres`, `vutler-redis`, `vutler-mongo` — User="" (= root)
- **Impact:** Escape de container = root sur l'hôte. Violation SOC2 CC6.3
- **Fix:** Définir `user:` non-root dans docker-compose.

**W2 — Aucun seccomp/AppArmor custom sur les containers**
- SecurityOpt=[] sur tous les containers
- **Impact:** Profil de sécurité par défaut uniquement
- **Fix:** Ajouter `security_opt: ["no-new-privileges:true"]` minimum.

**W3 — Fichiers backup (.bak, .backup) dans le code de production**
- 10+ fichiers .bak/.backup dans `/app/custom/` et `/app/custom/api/`
- Peuvent contenir des secrets ou du code vulnérable
- **Fix:** Supprimer les backups du déploiement, utiliser git.

**W4 — Packages système non à jour (~20+ upgradables)**
- Inclut apparmor, coreutils, cloud-init, fwupd, initramfs-tools
- Unattended-upgrades activé (bon) mais des packages en attente
- **Fix:** `sudo apt upgrade` + reboot si kernel patché.

**W5 — Port 8082 (Postal Web) et 3001 exposés publiquement**
- Port 3001 retourne HTTP 200 depuis l'extérieur
- **Impact:** Interfaces admin potentiellement accessibles
- **Fix:** Restreindre via firewall ou nginx auth.

### 🟢 INFO (5)

**I1 — SSL/TLS ✅** — Let's Encrypt, valide jusqu'au 18 mai 2026, auto-renew via certbot

**I2 — API Auth ✅** — `GET /api/v1/agents` retourne 401 sans token

**I3 — DB non exposées en externe ✅** — PostgreSQL (5432), MongoDB (27017), Redis (6379) ne sont pas accessibles depuis l'extérieur (connection refused)

**I4 — SSH correctement configuré ✅** — Password auth disabled, pubkey only, root login = prohibit-password (clé uniquement)

**I5 — Log rotation ✅** — Configuré pour nginx, rsyslog, apt, dpkg, cloud-init, certbot, ufw

---

## Résumé

| Catégorie | Status | Score |
|-----------|--------|-------|
| Ports exposés | 🔴 Trop de ports ouverts | 3/15 |
| Docker security | 🟡 Root users, no seccomp | 6/15 |
| Secrets in code | 🔴 API key hardcodée | 0/15 |
| SSL/TLS | 🟢 Let's Encrypt OK | 15/15 |
| API Auth | 🟢 401 sans token | 10/10 |
| DB access | 🟢 Non exposé | 10/10 |
| SSH config | 🟢 Key-only, no root | 8/10 |
| Firewall | 🔴 Désactivé | 0/10 |
| Updates | 🟡 Packages en attente | 5/5 |
| Logs | 🟢 Rotation OK | 5/5 |
| **TOTAL** | | **52/100** |

---

## Top 5 Recommandations Prioritaires

1. **🔴 IMMÉDIAT** — Déplacer la clé Snipara dans `.env` + rotation de la clé
2. **🔴 IMMÉDIAT** — Activer UFW: `ufw allow 22,80,443/tcp && ufw enable`
3. **🔴 URGENT** — Restreindre les ports SMTP/MailHog/3001/8082 au réseau interne
4. **🟡 CETTE SEMAINE** — Ajouter `user: 1000:1000` aux containers Docker tournant en root
5. **🟡 CETTE SEMAINE** — Nettoyer les fichiers .bak du code de production + `apt upgrade`

---

*Rex Security Agent — Starbox Group — Audit automatisé*
