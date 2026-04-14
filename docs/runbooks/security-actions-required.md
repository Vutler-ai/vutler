# Security Actions Required

## Goal

Track the manual credential rotations and historical cleanup actions that followed the exposed-secret incident.

This runbook is historical and operational. It intentionally references legacy systems only where they were part of the incident surface.

## Use When

Use this runbook when:
- rotating credentials after a confirmed exposure
- checking which manual rotations are still pending
- confirming which code paths were already cleaned up

## Immediate Manual Actions

### Stripe API Key Rotation

URL:
- [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)

Required action:
- rotate the current live Stripe secret key
- update the rotated value in `/home/ubuntu/vutler/.env` on the VPS

Historical exposure note:
- the exact leaked value was removed from tracked documentation and must stay out of Git history

### Google OAuth Credentials Rotation

Legacy Rocket.Chat OAuth credentials:
- exposed client ID: removed from tracked documentation
- exposed secret: removed from tracked documentation
- action: rotate in Google Cloud Console and remove any remaining dependency on the legacy path

OpenClaw extension OAuth credentials:
- exposed client ID: removed from tracked documentation
- exposed secret: removed from tracked documentation
- action: rotate in Google Cloud Console and update the corresponding `.env` value

## Completed Cleanup

Code already cleaned:
- `sniparaWebhook.js` hardcoded secret removed
- `index.ts` in OpenClaw moved base64 secrets to env variables
- `docker-compose.yml` now uses environment variables

Security commits:
- `0ca23474` remove hardcoded webhook secret from `sniparaWebhook.js`
- `b9e57e54` remove hardcoded Google OAuth secrets from OpenClaw extension

## Historical Git Risk

Observed:
- push was blocked by GitHub Push Protection
- secrets were present in repository history, including commit `6869f726...`

Required follow-up:
- clean Git history if retention policy requires it
- or use GitHub exemption flow only when cleanup is formally accepted

## Validation

Final security scan status at the time of this note:
- no residual secret found in current code
- secrets moved to environment variables
- `.env` remains protected by `.gitignore`

Validation checklist after each rotation:
- confirm the old credential is revoked
- confirm the new credential is stored only in the intended env source
- confirm runtime still boots with the rotated secret
- confirm no hardcoded copy remains in the repo or deployment scripts

## Hard Rules

- Do not treat code cleanup as credential rotation.
- Do not keep exposed credentials active after the replacement is available.
- Do not reintroduce secrets into tracked files, test fixtures, or deployment notes.
