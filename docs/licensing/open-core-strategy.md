# Vutler Open Core Licensing Strategy

**Version:** 1.0  
**Date:** 2026-02-23  
**Organization:** Starbox Group GmbH  
**Jurisdiction:** Switzerland (Geneva)

---

## Executive Summary

Vutler adopts an **Open Core** licensing model to balance community adoption with sustainable enterprise monetization. The platform will be distributed as:

- **Community Edition (CE)** — Apache 2.0, free and open source
- **Enterprise Edition (EE)** — Commercial license, proprietary features

This strategy enables a thriving open-source community while funding advanced capabilities for organizations requiring enterprise-grade infrastructure, security, and support.

---

## Market Positioning

Vutler positions itself as "Office 365 for AI Agents" — a unified platform for building, deploying, and managing AI agent workforces. The Open Core model achieves:

✅ **Low barrier to entry** for developers and small teams (Community Edition)  
✅ **Path to premium** for organizations with advanced requirements (Enterprise Edition)  
✅ **Sustainable development** funding through enterprise licensing  
✅ **Trust & transparency** via open-source community engagement  

---

## Feature Split: Community Edition vs. Enterprise Edition

### Community Edition (Apache 2.0)
**Target:** Developers, small teams, self-hosted deployments, educational use

| Feature | CE | EE |
|---------|----|----|
| **Core Platform** |
| Rocket.Chat fork (base) | ✅ | ✅ |
| Agent runtime engine | ✅ | ✅ |
| Chat & messaging | ✅ | ✅ |
| Channels & workspaces | ✅ | ✅ |
| User authentication (basic) | ✅ | ✅ |
| **Agent Building** |
| Basic agent builder (no-code) | ✅ | ✅ |
| Agent marketplace | ✅ | ✅ |
| WebSocket runtime | ✅ | ✅ |
| **API & Integration** |
| REST API (basic) | ✅ | ✅ |
| Webhook support | ✅ | ✅ |
| Standard connectors | ✅ | ✅ |
| **Productivity** |
| Basic calendar integration | ✅ | ✅ |
| Basic task management | ✅ | ✅ |
| Notifications | ✅ | ✅ |
| **Developer Experience** |
| CLI tooling | ✅ | ✅ |
| Docker support | ✅ | ✅ |
| Documentation & examples | ✅ | ✅ |
| Community support (GitHub) | ✅ | ✅ |
| **Enterprise Features** |
| LLM Router (advanced) | ❌ | ✅ |
| Multi-tenancy | ❌ | ✅ |
| Quota management | ❌ | ✅ |
| End-to-end encryption | ❌ | ✅ |
| VDrive (virtual file system) | ❌ | ✅ |
| Advanced connectors (ERP, CRM, proprietary) | ❌ | ✅ |
| Cloud code execution | ❌ | ✅ |
| Analytics dashboard | ❌ | ✅ |
| SSO/SAML integration | ❌ | ✅ |
| Audit logs (enterprise-grade) | ❌ | ✅ |
| Automated backup & recovery | ❌ | ✅ |
| **Support** |
| Community forums | ✅ | ✅ |
| Priority email support | ❌ | ✅ |
| SLA guarantee (99.5%) | ❌ | ✅ |
| Dedicated account manager | ❌ | ✅ |

---

## Community Edition (CE) Details

### Scope
The Community Edition is a complete, production-ready platform for:
- Solo developers and small AI teams
- Self-hosted deployments
- Research and education
- Open-source contributors

### Included Features
1. **Agent Runtime** — Full execution engine for AI agents (Rocket.Chat fork foundation)
2. **Chat & Messaging** — Real-time team communication
3. **Basic Agent Builder** — Visual workflow designer for simple agent logic
4. **WebSocket Runtime** — Real-time bi-directional communication
5. **REST API** — Standard endpoints for agent orchestration, chat, and data
6. **Calendar & Tasks** — Basic productivity integrations
7. **Channels & Workspaces** — Team organization
8. **Webhooks & Standard Connectors** — Integration foundation

### License
- **Apache License 2.0**
- Free to use, modify, and distribute
- Source code freely available
- Community-driven development

### Support
- GitHub Issues & Discussions
- Community forums
- Open-source contributor community
- No SLA

---

## Enterprise Edition (EE) Details

### Scope
The Enterprise Edition is designed for organizations requiring:
- Multi-tenant infrastructure
- Advanced security & compliance
- High-performance AI routing
- Integrated enterprise systems
- Managed cloud hosting
- SLA guarantees

### Exclusive EE Features

#### 1. **LLM Router (Advanced)**
- Intelligent LLM selection based on task characteristics
- Cost optimization across model providers
- Request batching and caching
- Fallback strategies and retry logic
- Support for proprietary models (GPT-4, Claude, Gemini Enterprise)

#### 2. **Multi-Tenancy & Quotas**
- Isolated tenant environments
- Per-tenant resource quotas
- Usage metering and billing integration
- Custom branding per tenant
- RBAC (Role-Based Access Control)

#### 3. **End-to-End Encryption**
- Message-level encryption
- Database encryption at rest
- TLS 1.3 transport encryption
- Key management service (KMS) integration

#### 4. **VDrive + Advanced Connectors**
- Virtual file system for agent state persistence
- Enterprise connector ecosystem:
  - SAP, Oracle, Salesforce, HubSpot
  - Microsoft 365 (Teams, Outlook, SharePoint)
  - Slack, Google Workspace
  - Custom proprietary systems

#### 5. **Cloud Code Execution**
- Serverless function runtime (agent-triggered)
- Python, JavaScript, Go support
- Isolated execution sandboxes
- Audit logging

#### 6. **Analytics Dashboard**
- Real-time agent performance metrics
- LLM usage analytics
- User engagement dashboards
- Cost tracking per tenant

#### 7. **SSO/SAML Integration**
- OAuth 2.0, OpenID Connect
- SAML 2.0 support
- Azure AD integration
- Okta integration
- Custom identity providers

#### 8. **Enterprise Audit Logs**
- Comprehensive activity logging
- Immutable audit trail
- Compliance exports (SOC 2, HIPAA-ready)
- Regulatory reporting

#### 9. **Automated Backup & Recovery**
- Hourly snapshots
- Cross-region replication
- Point-in-time recovery (30-day retention)
- Disaster recovery SLA

#### 10. **Priority Support**
- Dedicated account manager
- Phone/email support (4-hour response SLA)
- Quarterly business reviews
- Custom feature roadmap consultation

---

## Licensing Model: How License Keys Activate EE Features

### License Key System

**Architecture:**
```
[License Key] → [Validation Service] → [Feature Gates] → [EE Components]
    ↓
 Signed JWT
 Contains:
 - org_id
 - tier (starter/professional/enterprise)
 - features (list)
 - expiry_date
 - usage_limits (optional)
```

### Activation Flow

1. **Initial Setup**
   - Administrator provides `VUTLER_LICENSE_KEY` environment variable
   - License key is validated during server startup
   - Invalid or expired keys trigger CE-only mode with warning

2. **Runtime Feature Gates**
   ```javascript
   if (isFeatureEnabled('multi-tenancy')) {
     loadTenantService();
   } else {
     loadSingleTenantService();
   }
   ```

3. **License Validation**
   - Keys are cryptographically signed by Starbox Group
   - Validated against expiration and scope
   - Periodic re-validation (daily) for subscription freshness
   - Graceful degradation if validation fails (CE mode)

### License Key Contents (Example)

```json
{
  "org_id": "acme-corp-2026",
  "customer_name": "ACME Corporation",
  "tier": "enterprise",
  "features": [
    "multi-tenancy",
    "e2e_encryption",
    "advanced_llm_router",
    "vdrive",
    "cloud_code_execution",
    "analytics_dashboard",
    "sso_saml",
    "enterprise_audit_logs",
    "automated_backup",
    "priority_support"
  ],
  "issued_at": "2026-01-01",
  "expires_at": "2027-01-01",
  "max_tenants": 100,
  "max_agents": 1000,
  "support_tier": "priority"
}
```

### Enforcement Strategy

- **No crippling.** CE remains fully functional; EE features are disabled, not blocked
- **Transparent.** Licenses are validated clearly; errors are logged
- **Flexible.** Trial licenses and POC licenses are supported
- **Fair.** Exceeding usage limits triggers warnings, not hard stops

---

## Pricing Tiers

### Community Edition (Free)
- **Cost:** €0
- **Model:** Self-hosted
- **Infrastructure:** Your own servers
- **Support:** Community (GitHub, forums)
- **SLA:** None
- **Target:** Developers, startups, open-source projects

### Hosted Community Edition (Starter)
- **Cost:** $99/month
- **Included:**
  - Managed hosting (AWS)
  - Up to 10 agents
  - Up to 50 team members
  - 10 GB storage
  - Daily backups
- **Model:** Multi-tenant shared infrastructure
- **Support:** Email (48-hour response)

### Hosted Enterprise Lite (Professional)
- **Cost:** $349/month
- **Included:**
  - All CE features
  - LLM Router (advanced)
  - SSO/SAML
  - Analytics dashboard
  - Up to 100 agents
  - Up to 500 team members
  - 500 GB storage
  - Hourly backups
  - Priority email support (24-hour SLA)

### On-Premise Enterprise (Enterprise)
- **Cost:** CHF 10,000–50,000/year (scale-based)
- **Included:**
  - All EE features (unlimited)
  - Multi-tenancy & custom branding
  - E2E encryption & VDrive
  - Advanced connectors
  - Cloud code execution
  - Enterprise audit logs
  - Automated backup with disaster recovery
  - Dedicated account manager
  - Phone & email support (4-hour SLA)
  - Custom SLA negotiation
  - Quarterly business reviews

---

## Dual-License Strategy: Single Codebase

### Implementation Approach

**Single Docker image, conditional feature loading:**

```dockerfile
FROM node:20-alpine

# Copy entire codebase
COPY . /app

# At startup, load license and conditionally enable features
ENV VUTLER_LICENSE_KEY=""

RUN npm install
RUN npm run build

CMD ["npm", "start"]
```

**At runtime:**
```bash
docker run \
  -e VUTLER_LICENSE_KEY="eyJhbGc..." \
  -p 3000:3000 \
  vutler:latest
```

### Code Organization

```
packages/
├── core/              # Shared utilities, base classes (Apache 2.0)
│   ├── runtime/
│   ├── api/
│   └── utils/
├── ce/                # Community Edition (Apache 2.0)
│   ├── agent-builder/
│   ├── chat/
│   ├── calendar/
│   └── tasks/
├── ee/                # Enterprise Edition (Commercial)
│   ├── multi-tenancy/
│   ├── llm-router-advanced/
│   ├── e2e-encryption/
│   ├── vdrive/
│   ├── connectors/
│   ├── cloud-code/
│   ├── analytics/
│   ├── sso-saml/
│   ├── audit-logs/
│   └── backup/
└── license/           # License validation (shared)
    ├── validator.js
    ├── feature-gates.js
    └── license-key-gen.js (internal tool)
```

### Feature Gate System

```javascript
// core/license/feature-gates.js
export class FeatureGates {
  constructor(licenseKey) {
    this.license = validateLicense(licenseKey);
  }

  isEnabled(feature) {
    return this.license.features.includes(feature);
  }

  requireFeature(feature) {
    if (!this.isEnabled(feature)) {
      throw new Error(`Feature '${feature}' requires Enterprise Edition`);
    }
  }
}

// Usage in ee/multi-tenancy/index.js
export function loadTenancyService(gates) {
  gates.requireFeature('multi-tenancy');
  // Load EE multi-tenancy logic
}
```

---

## Governance & Maintenance

### Community Edition
- **Repository:** Public on GitHub
- **License:** Apache 2.0
- **Contributions:** Accepted via standard pull request process
- **Release Cycle:** Semantic versioning, quarterly major releases
- **Maintenance:** 2 years LTS per version

### Enterprise Edition
- **Repository:** Private GitHub (behind authentication)
- **License:** Commercial (proprietary)
- **Contributions:** Internal Starbox Group + trusted partners only
- **Release Cycle:** Coordinated with CE releases
- **Maintenance:** SLA-backed support

---

## Migration Path: CE → EE

Organizations starting with CE can seamlessly upgrade to EE:

1. **Trial License**
   - 14-day EE trial (no credit card)
   - Full feature access
   - Automatic downgrade after trial

2. **Licensing**
   - Purchase license via Starbox Group sales
   - Receive license key
   - Set `VUTLER_LICENSE_KEY` environment variable
   - Restart service → EE features enabled

3. **Data Continuity**
   - No data migration required
   - All CE data remains intact
   - EE features layer on top

---

## Compliance & Regulations

### Data Protection
- **GDPR Ready:** Data processing agreements available
- **CCPA Compliant:** User data export & deletion tools
- **HIPAA-eligible:** E2E encryption + audit logs (with Business Associate Agreement)

### Audit & Compliance
- **SOC 2 Type II** (Enterprise Edition customers)
- **ISO 27001** roadmap
- **Immutable audit logs** for regulatory compliance

---

## Roadmap & Feature Evolution

### Near-term (Q1-Q2 2026)
- Community Edition stabilization
- Initial Enterprise Edition launch (multi-tenancy, SSO)
- License key infrastructure

### Mid-term (Q3-Q4 2026)
- Advanced LLM Router optimization
- VDrive connectors expansion
- Analytics v1.0

### Long-term (2027+)
- AI-native compliance tooling
- Industry-specific templates (finance, healthcare, legal)
- Global marketplace for pre-built agents

---

## Support & Engagement

### Community Edition Users
- **GitHub Issues:** Primary support channel
- **Community Forums:** Peer-to-peer discussion
- **Discord Server:** Real-time chat with maintainers
- **Monthly Webinars:** Feature updates & best practices
- **User Advocacy:** Recognition program for contributors

### Enterprise Edition Customers
- **Dedicated Slack:** Direct line to support team
- **Priority Phone Support:** 4-hour response SLA
- **Quarterly Business Reviews:** Strategic alignment
- **Custom Roadmap:** Feature prioritization
- **Executive Briefings:** C-level strategy sessions

---

## License Compliance & Attribution

### License Headers
All source code includes appropriate headers:

**CE Files:**
```
// Copyright 2026 Starbox Group GmbH
// Licensed under Apache License 2.0
// See LICENSE-APACHE-2.0 for details
```

**EE Files:**
```
// Copyright 2026 Starbox Group GmbH
// Licensed under the Vutler Enterprise License
// See LICENSE-COMMERCIAL.md for details
// This file is NOT open source
```

### Third-Party Attribution
- **Rocket.Chat:** MIT License (base fork)
- See `NOTICE.md` for complete attribution

---

## Decision & Sign-Off

**Approved by:** Starbox Group GmbH, Legal & Product Leadership  
**Effective Date:** 2026-02-23  
**Next Review:** 2026-08-23

This strategy balances open-source community values with commercial sustainability, positioning Vutler for rapid adoption and long-term viability.

