# Security Notes

## GitGuardian Alert (2026-02-28)
- **Commit**: c7d977f (private repo alopez3006/vutler)
- **Secret**: `vutler-jwt-secret-2026` hardcoded in 3 patch files
- **Status**: Removed from current code. Still in git history on private repo.
- **Action before public push**: Run `git filter-repo --invert-paths --path patches/auth-jwt-login.js --path patches/jwt-auth.js --path patches/middleware-auth.js` OR do a fresh `git init` for the public repo Vutler-ai/vutler.
- **Current auth**: JWT_SECRET passed via env var in docker-compose.yml
