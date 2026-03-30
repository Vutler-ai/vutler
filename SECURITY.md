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

## Contact

- Security issues: **security@vutler.ai**
- General questions: **opensource@vutler.ai**
