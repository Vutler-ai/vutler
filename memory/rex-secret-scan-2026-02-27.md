# 🛡️ Rex Secret Scan Report — 2026-02-27

## Summary
**Scan target:** `/Users/lopez/.openclaw/workspace/projects/vutler/`
**Status:** 🔴 CRITICAL secrets found in executable code

---

## 🔴 CRITICAL — Hardcoded Secrets in Code (.js)

### 1. JWT Secret (STABLE_SECRET)
- **Files:**
  - `patches/auth.js:9` — `const STABLE_SECRET = 'vutler-jwt-stable-ba6d997aacce3db5...'`
  - `sprint-15/auth-middleware-fix.js:14` — same secret
  - `sprint-15/auth-middleware.js:9` — same secret
  - `sprint-15/jwt-auth-patch.js:11` — fallback with same secret
- **Risk:** CRITICAL — Anyone with this secret can forge JWT tokens
- **Fix:** Replace with `process.env.JWT_SECRET` (no fallback!)

### 2. Postal API Key (aa91f11a...)
- **Files:**
  - `sprint-15/emails.js:9` — `const POSTAL_KEY = 'aa91f11a58ea9771d5036ed6429073f709a716bf'`
  - `sprint-15/automation-executor.js:95` — same key in header
- **Risk:** CRITICAL — Email service API key exposed
- **Fix:** Replace with `process.env.POSTAL_API_KEY`

### 3. NAS Password (Roxanne1212**#)
- **Files:**
  - `patches/chat.js.backup:56` — `const NAS_PASS = 'Roxanne1212**#'`
  - `patches/chat.js.patched:116` — same
  - `sprint-15/chat-backend/chat.js:56` — same
- **Risk:** CRITICAL — NAS password exposed, personal credential
- **Fix:** Replace with `process.env.NAS_PASSWORD`

---

## 🟡 MEDIUM — Secrets in Documentation/Config (.md, .yaml)

### 4. Anthropic API Key pattern (sk-ant-api03-...)
- **Files:**
  - `sprint-14-fix/PATCH_SUMMARY.md:162`
  - `sprint-14-fix/DEPLOYMENT.md:63,66`
  - `sprint-14-fix/CHECKLIST.md:126`
- **Risk:** MEDIUM — Truncated/placeholder in docs, but pattern reveals key prefix
- **Fix:** Replace with `$ANTHROPIC_API_KEY` placeholder

### 5. Synapse Shared Secrets (homeserver.yaml)
- **File:** `app/ee/packages/federation-matrix/docker-compose/hs1/homeserver.yaml:24-27`
  - `registration_shared_secret`, `macaroon_secret_key`, `form_secret`
- **Risk:** MEDIUM — Test/dev federation config, but real secrets
- **Fix:** Use env substitution or keep only in `.env`

### 6. Docker Compose temp_secret
- **File:** `app/ee/packages/federation-matrix/docker-compose.test.yml:100`
  - `OVERWRITE_SETTING_Cloud_Workspace_Client_Secret: temp_secret`
- **Risk:** LOW — Clearly a test placeholder

---

## ✅ OK — Non-secret References

- `password` keyword in test fixtures (`.spec.ts`) — test data like `password: 'random'`, `password: '1'` — acceptable
- `password` in HISTORY.md — changelog entries, not actual secrets
- `secret` in type definitions (`.ts`) — interface fields, not values
- Account service password handling code — business logic, not hardcoded values

---

## Deliverables Created

1. ✅ **Pre-commit hook:** `.githooks/pre-commit` — scans staged files for 15+ secret patterns
2. ✅ **Updated `.gitignore`** — added .env, .secrets/, *.pem, node_modules/, .next/, etc.
3. ✅ **This report**

## Recommended .env.example Additions

```env
# Add these to .env.example (values are placeholders)
JWT_SECRET=generate-with-openssl-rand-hex-64
POSTAL_API_KEY=your-postal-api-key
NAS_PASSWORD=your-nas-password
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

## Next Steps

1. **URGENT:** Remove hardcoded secrets from the 3 critical files listed above
2. **Activate hook:** `cd projects/vutler && git config core.hooksPath .githooks`
3. **Rotate compromised credentials:** JWT secret, Postal key, NAS password
4. Consider running `git filter-branch` or BFG to remove secrets from git history
