# Rex Security Upgrade — Backlog

**Agent:** Rex 🦖
**Current:** VPS health checks, uptime monitoring, basic security scoring
**Goal:** Full cybersecurity agent — infra monitoring + offensive/defensive security

## New Capabilities (from NVISO cyber-security-llm-agents)

### Phase 1 — Detection & Monitoring
- EDR detection (identify security tools running on endpoints)
- Log analysis (parse nginx/docker/auth logs for anomalies)
- Port scan detection (monitor open ports, flag changes)
- SSL certificate monitoring (expiry alerts)
- Docker container security audit (CVE scanning)

### Phase 2 — Vulnerability Assessment
- Dependency vulnerability scanning (npm audit, pip audit)
- GitHub repo security scanning (secrets in code, SAST)
- Network exposure audit (what's publicly accessible)
- Password policy enforcement

### Phase 3 — Purple Team Automation
- Automated penetration testing (safe, internal)
- Detection engineering CI/CD (test detection rules)
- Incident response playbooks
- Security report generation (weekly digest)

## Source
- https://github.com/NVISOsecurity/cyber-security-llm-agents (AutoGen-based)
- Adapt patterns to OpenClaw agent format

## Priority
P2 — After Sprint 7 (Next.js) and Sprint 8 (n8n)
