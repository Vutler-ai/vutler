# 🔍 Vutler Production Audit — 2026-02-20

**Audité par :** Mike (Lead Engineer, Starbox Group)  
**Date :** 2026-02-20 00:06 GMT+1  
**VPS :** 83.228.222.180 (ov-364ef1)  
**Uptime :** 2 jours, 12h42  
**Load Average :** 0.13, 0.10, 0.09 (excellent)

---

## 📊 Résumé Exécutif

**Status Global :** ⚠️ **OPÉRATIONNEL avec bugs critiques**

### 🚨 Problèmes Critiques Identifiés

1. **❌ PostgreSQL mal configuré** — Base configurée avec credentials `vaultbrix` au lieu de `vutler`
2. **⚠️ Firewall désactivé** — ufw status: inactive (ports exposés sans protection)
3. **⚠️ Endpoint /api/v1/templates** — Retourne 0 templates alors que la DB en contient 3 (PostgreSQL) et 2 (MongoDB)
4. **⚠️ Erreur SQL dans logs** — `column "rc_username" does not exist` (2026-02-17 20:19:57)

### ✅ Points Positifs

- Tous les containers tournent (11/11)
- Certificats SSL valides (87 jours restants)
- Performance excellente (18% RAM, load < 0.2)
- Landing pages accessibles et fonctionnelles
- API health endpoint répond correctement

---

## 🐳 1. Services Docker

**Status :** ✅ **TOUS OPÉRATIONNELS**

| Container | Status | Ports | Health |
|-----------|--------|-------|--------|
| vutler-api | Up ~1h | 3001:3001 | ✅ healthy |
| vutler-rocketchat | Up ~1h | 3000:3000 | ✅ healthy |
| vutler-postgres | Up ~1h | 5432 (interne) | ✅ healthy |
| vutler-mongo | Up ~1h | 27017 (interne) | ✅ healthy |
| vutler-redis | Up ~1h | 6379 (interne) | ✅ healthy |
| vutler-mailhog | Up ~1h | 1025, 8025 | - |
| postal-web | Up ~1h | 8082:5000 | - |
| postal-smtp | Up ~1h | 25, 587 | - |
| postal-worker | Up ~1h | - | - |
| postal-rabbitmq | Up ~1h | 5672 (interne) | - |
| postal-mariadb | Up ~1h | 3306 (interne) | - |

**Utilisation Ressources :**

| Container | CPU | Mémoire |
|-----------|-----|---------|
| vutler-rocketchat | 0.92% | 639.7 MiB (le plus gourmand) |
| vutler-mongo | 1.20% | 117.9 MiB |
| postal-worker | 0.00% | 147.1 MiB |
| postal-web | 0.01% | 140.5 MiB |
| postal-smtp | 0.00% | 135.3 MiB |
| postal-rabbitmq | 0.45% | 110.5 MiB |
| postal-mariadb | 0.03% | 89.34 MiB |
| vutler-api | 0.15% | 50.31 MiB |
| vutler-postgres | 0.00% | 21.75 MiB |
| vutler-redis | 0.42% | 3.816 MiB |
| vutler-mailhog | 0.00% | 2.297 MiB |

---

## 🚀 2. Rocket.Chat

**Status :** ✅ **OPÉRATIONNEL**

- **URL :** https://app.vutler.ai
- **HTTP Response :** 200 OK
- **Version :** Commit 2ca98764a0
- **MongoDB Engine :** WiredTiger
- **Site URL configuré :** https://app.vutler.ai ✅
- **ServiceBroker :** Démarré avec 2 services (512ms)
- **Matrix Service :** Enregistré et démarré
- **EventService :** No old staged events found (clean)

**Logs récents :** Aucune erreur, système stable.

---

## ⚙️ 3. API Vutler

**Status :** ⚠️ **OPÉRATIONNEL avec bugs**

### Endpoints Testés

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/` | ✅ 200 | `{"service":"Vutler API","version":"1.0.0"}` |
| `/api/v1/health` | ✅ 200 | PostgreSQL OK (1ms latency) |
| `/api/v1/agents` | 🔒 Auth required | X-Auth-Token & X-User-Id requis (normal) |
| `/api/v1/templates` | ⚠️ 200 (0 items) | **BUG** : Retourne 0 templates alors que DB en contient 3 (PG) / 2 (Mongo) |

### Health Check Response

```json
{
  "status": "healthy",
  "service": "vutler-api",
  "version": "6.0.0",
  "timestamp": "2026-02-19T23:08:38.799Z",
  "uptime_s": 3738,
  "memory_mb": 91,
  "postgres": {
    "ok": true,
    "latency_ms": 1,
    "version": "PostgreSQL 16.12",
    "server_time": "2026-02-19T23:08:38.798Z"
  }
}
```

### Configuration Problème

**❌ CRITIQUE :** API configurée avec anciennes credentials Vaultbrix

```bash
POSTGRES_URL=postgresql://vaultbrix:vaultbrix_secret@postgres:5432/vaultbrix
```

**Devrait être :**
```bash
POSTGRES_URL=postgresql://vutler_user:vutler_password@postgres:5432/vutler_db
```

---

## 🗄️ 4. PostgreSQL

**Status :** ❌ **CONFIGURATION INCORRECTE**

### Problème Majeur

Base de données créée avec credentials **Vaultbrix** au lieu de **Vutler** :

```
POSTGRES_USER=vaultbrix
POSTGRES_PASSWORD=vaultbrix_secret
POSTGRES_DB=vaultbrix
```

### Tables (14 au lieu de 9 mentionnées)

```sql
agent_context
agent_email_configs
agent_llm_configs
agent_model_assignments
agent_rc_channels
agent_tools
audit_logs
connect_message_log
shared_channels
templates (3 rows)
token_usage
workspace_llm_providers
workspace_partners
workspace_settings
```

### Erreurs dans les logs

```
2026-02-17 19:21:25 FATAL: role "vutler" does not exist
2026-02-17 20:19:57 ERROR: column "rc_username" does not exist at character 8
STATEMENT: SELECT rc_username, model FROM agent_llm_configs;
```

**Action requise :** Migration des credentials ou rebuild du container avec bonnes variables d'environnement.

---

## 📦 5. MongoDB

**Status :** ✅ **OPÉRATIONNEL**

- **Database :** vutler
- **Collections :** 93 collections (dont Rocket.Chat + agent_templates + vutler_rate_limits)
- **Users :** 13 documents
- **Rooms :** 16 documents
- **Agent Templates :** 2 documents

### Collections Clés

```javascript
users (13)
rocketchat_room (16)
agent_templates (2)
vutler_rate_limits
rocketchat_message
rocketchat_subscription
rocketchat_settings
// + 86 autres collections RC
```

**Pas d'erreurs dans les logs récents.**

---

## 🔴 6. Redis

**Status :** ✅ **OPÉRATIONNEL**

- **Ping :** PONG ✅
- **Mémoire utilisée :** 988.12K
- **Max Memory :** 0 (unlimited)
- **Policy :** noeviction
- **CPU :** 0.42%
- **RAM :** 3.816 MiB

**Très faible utilisation, fonctionne normalement.**

---

## 🔐 7. Nginx & SSL

**Status :** ✅ **OPÉRATIONNEL**

### Certificats SSL (Let's Encrypt)

| Domain | Type | Expiration | Jours restants | Status |
|--------|------|------------|----------------|--------|
| app.vutler.ai | ECDSA | 2026-05-18 | 87 jours | ✅ VALID |
| mail.vutler.ai | ECDSA | 2026-05-18 | 87 jours | ✅ VALID |
| vutler.ai (+ www) | ECDSA | 2026-05-18 | 87 jours | ✅ VALID |

**Note :** Configuration Nginx non trouvée dans `/etc/nginx/sites-enabled` ou `/etc/nginx/conf.d`. Possible configuration custom ailleurs.

---

## 📧 8. Postal (Email)

**Status :** ✅ **OPÉRATIONNEL**

Tous les services Postal tournent :

- postal-web (8082:5000)
- postal-smtp (25, 587)
- postal-worker
- postal-rabbitmq
- postal-mariadb

### Logs récents

**Sécurité ✅** — Blocage automatique de tentatives d'intrusion :

```
36.83.112.197 - GET /phpinfo.php → 403
36.83.112.197 - GET /.env/.env.bak → 403
36.83.112.197 - GET /.aws/credentials → 403
79.124.40.174 - GET /actuator/gateway/routes → 403
```

**Relais Brevo :** À tester manuellement (pas de test d'envoi effectué).

---

## 💾 9. Disques

**Status :** ✅ **BON**

| Partition | Taille | Utilisé | Libre | % | Point de montage |
|-----------|--------|---------|-------|---|------------------|
| /dev/sda1 | 19G | 9.6G | 8.8G | 53% | / |
| /dev/sda16 | 881M | 112M | 707M | 14% | /boot |
| /dev/sda15 | 105M | 6.2M | 99M | 6% | /boot/efi |
| /dev/sdb | 246G | 466M | 233G | 1% | /mnt/data |

**Excellent :** 95% d'espace libre sur /mnt/data.

---

## 📜 10. Logs — Erreurs Récentes

### vutler-postgres

```
2026-02-17 19:21:25 FATAL: role "vutler" does not exist
2026-02-17 20:19:57 ERROR: column "rc_username" does not exist
2026-02-19 23:07:05 FATAL: role "vutler_user" does not exist
2026-02-19 23:07:16 FATAL: role "postgres" does not exist
```

### vutler-api

Aucune erreur dans les 100 dernières lignes. Health checks toutes les 30s (200 OK).

### vutler-rocketchat

Aucune erreur détectée. Système stable.

### vutler-mongo, vutler-redis, postal-*

Aucune erreur détectée.

---

## 🔒 11. Sécurité

**Status :** ⚠️ **FIREWALL DÉSACTIVÉ**

### Ports Exposés

| Port | Service | Exposition |
|------|---------|------------|
| 22 | SSH | 0.0.0.0 (public) |
| 25 | SMTP (Postal) | 0.0.0.0 (public) |
| 80 | HTTP (Nginx) | 0.0.0.0 (public) |
| 443 | HTTPS (Nginx) | 0.0.0.0 (public) |
| 587 | SMTP Submission | 0.0.0.0 (public) |
| 1025 | MailHog SMTP | 0.0.0.0 (public) ⚠️ |
| 3000 | Rocket.Chat | 0.0.0.0 (public) ⚠️ |
| 3001 | Vutler API | 0.0.0.0 (public) ⚠️ |
| 8025 | MailHog UI | 0.0.0.0 (public) ⚠️ |
| 8082 | Postal Web | 0.0.0.0 (public) ⚠️ |

### Problèmes

1. **❌ UFW désactivé** — `sudo ufw status` → inactive
2. **⚠️ Ports de dev exposés** — MailHog (1025, 8025) ne devrait pas être public
3. **⚠️ API/RC exposés directement** — Devraient passer uniquement par Nginx (80/443)

**Recommandation :** Activer ufw et restreindre l'accès :

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 25/tcp
sudo ufw allow 587/tcp
sudo ufw enable
```

Puis modifier docker-compose pour ne pas exposer 3000, 3001, 8025, 8082 sur 0.0.0.0 (les garder internes uniquement).

---

## ⚡ 12. Performance

**Status :** ✅ **EXCELLENTE**

### Système

- **Load Average :** 0.63, 0.25, 0.14 (très bas)
- **CPU :** 97.7% idle
- **RAM :** 2.2 GiB / 11.7 GiB utilisés (18%)
- **Swap :** 0B (pas utilisé)

### Top Consumers

1. **RocketChat :** 639.7 MiB
2. **Postal Worker :** 147.1 MiB
3. **Postal Web :** 140.5 MiB
4. **Postal SMTP :** 135.3 MiB
5. **MongoDB :** 117.9 MiB

**Total Docker :** ~1.5 GiB

---

## 🌐 13. Landing Pages

**Status :** ✅ **OPÉRATIONNELLES**

### vutler.ai

- **HTTP 200** ✅
- Page "Coming Soon" avec design moderne
- Gradient animations, badge "Coming 2026"

### app.vutler.ai/landing

- **HTTP 200** (après redirect 301) ✅
- Landing page complète avec :
  - Navigation
  - Hero section
  - Features, How it works, Pricing, Contact
  - Open Graph meta tags
  - Liens vers app.vutler.ai (Sign In / Get Started)

### app.vutler.ai (Rocket.Chat)

- **HTTP 200** ✅
- Rocket.Chat interface accessible
- Configured Site_Url: https://app.vutler.ai

---

## 📋 Actions Recommandées

### 🚨 Urgentes (Sprint 7)

1. **Fixer PostgreSQL credentials**
   - Créer utilisateur `vutler_user` avec bon mot de passe
   - Migrer DB `vaultbrix` → `vutler_db` OU rebuild container avec bonnes env vars
   - Mettre à jour `POSTGRES_URL` dans vutler-api

2. **Activer le firewall**
   - Configurer ufw
   - Restreindre ports 3000, 3001, 8025, 8082 en interne uniquement

3. **Fixer l'endpoint /api/v1/templates**
   - Debugger pourquoi il retourne 0 templates
   - Vérifier la query et la connexion à la bonne DB

4. **Corriger l'erreur SQL `rc_username`**
   - Vérifier le schéma de `agent_llm_configs`
   - Mettre à jour la query ou ajouter la colonne manquante

### ⚠️ Importantes (Sprint 8)

5. **Sécuriser MailHog**
   - Désactiver en production OU restreindre l'accès (IP whitelist)

6. **Review Nginx config**
   - Localiser et documenter la config
   - S'assurer que tout le trafic passe par le reverse proxy

7. **Monitoring & Alerting**
   - Mettre en place un monitoring (Uptime Kuma, Prometheus, etc.)
   - Alertes sur erreurs critiques (DB down, disk full, etc.)

### 📝 Nice-to-Have

8. **Documentation infrastructure**
   - Architecture diagram
   - Procédures de déploiement
   - Disaster recovery plan

9. **Backup automatisé**
   - PostgreSQL dumps quotidiens
   - MongoDB dumps quotidiens
   - Stockage off-site (S3, etc.)

10. **Optimisation**
    - Review RAM allocation containers
    - Logs rotation policy
    - Cache tuning (Redis, Nginx)

---

## 🏁 Conclusion

La production Vutler est **opérationnelle** mais nécessite des **corrections urgentes** avant une utilisation en production réelle :

- ❌ **PostgreSQL mal configuré** (vaultbrix au lieu de vutler) — BLOQUANT
- ⚠️ **Firewall désactivé** — SÉCURITÉ
- ⚠️ **Bugs API** (templates, rc_username) — FONCTIONNALITÉ

Les **performances sont excellentes** (18% RAM, load < 1) et les **certificats SSL sont valides**.

**Prochaine étape :** Fixer les 4 problèmes critiques (PostgreSQL, firewall, templates, rc_username) pour stabiliser la production avant le sprint 8.

---

**Rapport généré le :** 2026-02-20 00:08:49 UTC  
**Par :** Mike (Lead Engineer, Starbox Group)  
**Durée d'audit :** ~2 minutes  
**Fichier :** `/Users/lopez/.openclaw/workspace/projects/vutler/audit/production-audit-2026-02-20.md`
