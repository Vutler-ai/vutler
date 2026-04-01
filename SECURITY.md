# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously at Vutler. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email us at: **security@vutler.ai**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 5 business days
- **Fix timeline:** depends on severity, typically within 30 days for critical issues

### What to Expect

1. We will acknowledge your report and begin investigation
2. We will keep you informed of our progress
3. Once fixed, we will credit you in the release notes (unless you prefer anonymity)
4. We will coordinate disclosure timing with you

### Scope

The following are in scope:
- Vutler API (`api.vutler.ai`)
- Vutler application (`app.vutler.ai`)
- This open source repository
- Authentication and authorization flaws
- Data exposure vulnerabilities
- Injection vulnerabilities

The following are **out of scope**:
- Social engineering attacks
- Denial of service attacks
- Issues in third-party dependencies (report these upstream)
- Issues already known or publicly disclosed

## Security Architecture

Vutler follows these security principles:

- **Domain separation:** strict boundary between public site (`vutler.ai`) and authenticated app (`app.vutler.ai`)
- **Server-side auth guards** on all sensitive routes
- **Encrypted secret storage** for OAuth tokens and provider credentials
- **Tenant isolation** via PostgreSQL schema separation
- **Rate limiting** on public endpoints
- **No secrets in logs** — tokens, API keys, and credentials are never logged

## Security Best Practices for Self-Hosting

If you deploy Vutler yourself:

- Always use HTTPS in production
- Rotate `JWT_SECRET` and API keys regularly
- Use [docs/runbooks/vutler-api-key-rotation.md](docs/runbooks/vutler-api-key-rotation.md) for runtime `VUTLER_API_KEY` rotation
- Keep Node.js and dependencies updated
- Use environment variables for secrets — never commit `.env` files
- Enable rate limiting in production
- Restrict database access to application servers only
- Use strong, unique passwords for all service accounts

## Production Readiness Checklist

Before a full production rollout, double-check the following items so the platform ships with the expected security posture:

- **Secrets guardrails:** `JWT_SECRET`, `POSTAL_API_KEY`, `STRIPE_ACCOUNT_ID`, `VUTLER_API_KEY` and any other credentials must be supplied via environment variables and must not use placeholder strings. The bootstrap (`index.js`) already fails in production if `JWT_SECRET` is missing or weak, so keep that gate active.
- **Provider credentials:** `tenant_vutler.llm_providers` stores raw API keys, and the `CryptoService`/Vault pipeline (see `api/providers.js`) still needs to be exercised by every runtime. Ensure workspace role segregation and never leak the unmasked key in logs or responses.
- **Runtime telemetry:** `/api/v1/runtime/status` now aggregates workspace agent statuses, uptime (since the server started), and the last restart record stored under `workspace_settings.runtime_last_restart`; `/runtime/restart` records the requesting user and reason. Continue to guard these tables so the UI shows accurate health.
- **Usage analytics:** `/api/v1/usage` is provided by `api/usage-pg.js` and normalizes `usage_logs`, `agent_executions`, and `credit_transactions`. Keep those tables trimmed and indexed so Usage dashboards stay performant.
- **Skill execution logging:** `services/skills/SkillRegistry.js` still only logs to console. Persist execution metadata once `tenant_vutler.skill_executions` is available so you can audit agent activity end-to-end.
- **Sandbox hardening:** `services/sandbox.js` now supports an isolated Docker runtime and should use it in production (`SANDBOX_RUNTIME=docker`). Keep the Docker socket provisioning explicit, preserve the timeout guard, and monitor execution volume plus stderr spikes to detect abuse.
- **SSE observability & provider health:** Codex streaming is served via `services/llmRouter.js`. Prioritize the observability dashboard (see roadmap item “Observability dashboard: streaming SSE + provider health”) so you can trace fallback rates and streaming errors before enabling large workspaces.

## Contact

- Security issues: **security@vutler.ai**
- General questions: **opensource@vutler.ai**
