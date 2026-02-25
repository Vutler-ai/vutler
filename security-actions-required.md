# ACTIONS SÉCURITÉ REQUISES - ROTATION CLÉS API

## 🔴 ACTIONS MANUELLES URGENTES

### 1. Stripe API Key Rotation
- **URL:** https://dashboard.stripe.com/apikeys
- **Action:** Rotater la clé `STRIPE_WEBHOOK_SECRET` actuelle
- **Valeur exposée:** `[REDACTED_WEBHOOK_SECRET]`
- **Après rotation:** Mettre à jour la valeur dans `/home/ubuntu/vutler/.env` sur le VPS

### 2. Google OAuth Credentials Rotation
**RocketChat OAuth (MongoDB):**
- **Client ID exposé:** `[REDACTED_GOOGLE_CLIENT_ID]`
- **Secret exposé:** `[REDACTED_GOOGLE_CLIENT_SECRET]`
- **Action:** Rotater dans Google Cloud Console et mettre à jour via MongoDB

**OpenClaw Extension OAuth:**
- **Client ID exposé:** `[REDACTED_GOOGLE_CLIENT_ID]`
- **Secret exposé:** `[REDACTED_GOOGLE_CLIENT_SECRET]`
- **Action:** Rotater dans Google Cloud Console et mettre à jour `.env`

## ✅ ACTIONS DÉJÀ EFFECTUÉES

### Code nettoyé :
1. **sniparaWebhook.js** - Secret hardcodé supprimé
2. **index.ts (OpenClaw)** - Secrets base64 remplacés par variables env
3. **docker-compose.yml** - Variable `SNIPARA_WEBHOOK_SECRET` ajoutée

### Commits de sécurité :
- `0ca23474`: Remove hardcoded webhook secret from sniparaWebhook.js
- `b9e57e54`: Remove hardcoded Google OAuth secrets from OpenClaw extension

## ⚠️ PROBLÈME HISTORIQUE GIT
- Push bloqué par GitHub Push Protection
- Secrets présents dans l'historique (commit 6869f726...)
- **Recommandation:** Nettoyer l'historique Git ou utiliser les URLs de dérogation GitHub

## 🔍 SCAN DE SÉCURITÉ FINAL
- ✅ Aucun secret résiduel trouvé dans le code actuel
- ✅ Tous les secrets sont maintenant dans les variables d'environnement
- ✅ Fichier `.env` protégé par `.gitignore`