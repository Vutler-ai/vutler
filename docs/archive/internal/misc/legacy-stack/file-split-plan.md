# Vutler Codebase Split Plan: Community Edition vs Enterprise Edition

**Version:** 1.0  
**Date:** 2026-02-23  
**Objective:** Define which source code files/directories are included in CE (Apache 2.0) vs EE (Commercial License)

---

## Overview

Vutler adopts a **single codebase, conditional feature loading** approach:

- **Single Docker image** — One binary for both CE and EE
- **License key determines features** — `VUTLER_LICENSE_KEY` activates EE components
- **Graceful degradation** — Missing EE features fall back to CE or logged warnings
- **Directory structure** — `packages/ce/` and `packages/ee/` clearly separate codebases

```
vutler/
├── packages/
│   ├── core/              # Shared core (Apache 2.0)
│   ├── ce/                # Community Edition (Apache 2.0)
│   ├── ee/                # Enterprise Edition (Commercial)
│   └── license/           # License validation (shared)
├── docker/
│   ├── Dockerfile         # Single image for both
│   ├── docker-compose.yml
│   └── entrypoint.sh
├── docs/
│   ├── licensing/         # License documentation
│   └── ...
└── tests/
    ├── ce/
    └── ee/
```

---

## File Split: Detailed Mapping

### 1. Core Packages (Apache 2.0 - Shared)

These foundational components are used by both CE and EE and are licensed under Apache 2.0:

```
packages/core/
├── runtime/
│   ├── agent-executor.js         ✅ Apache 2.0
│   ├── agent-lifecycle.js        ✅ Apache 2.0
│   ├── message-bus.js            ✅ Apache 2.0
│   └── websocket-server.js       ✅ Apache 2.0
├── api/
│   ├── agent-api.js              ✅ Apache 2.0
│   ├── chat-api.js               ✅ Apache 2.0
│   ├── channel-api.js            ✅ Apache 2.0
│   ├── middleware/
│   │   ├── auth.js               ✅ Apache 2.0 (basic auth only)
│   │   └── rate-limit.js         ✅ Apache 2.0 (basic limits)
│   └── routes.js                 ✅ Apache 2.0
├── utils/
│   ├── logger.js                 ✅ Apache 2.0
│   ├── config.js                 ✅ Apache 2.0
│   ├── error-handler.js          ✅ Apache 2.0
│   └── db-connection.js          ✅ Apache 2.0 (base connection)
├── models/
│   ├── agent.model.js            ✅ Apache 2.0
│   ├── user.model.js             ✅ Apache 2.0
│   ├── chat.model.js             ✅ Apache 2.0
│   └── channel.model.js          ✅ Apache 2.0
└── types/
    └── index.d.ts                ✅ Apache 2.0
```

### 2. Community Edition (Apache 2.0)

These are core Vutler features available to all users:

```
packages/ce/
├── agent-builder/
│   ├── index.js                  ✅ Apache 2.0
│   ├── builder-ui.js             ✅ Apache 2.0
│   ├── workflow-engine.js        ✅ Apache 2.0 (basic)
│   ├── node-types/
│   │   ├── trigger.js            ✅ Apache 2.0
│   │   ├── condition.js          ✅ Apache 2.0
│   │   ├── action.js             ✅ Apache 2.0
│   │   └── webhook.js            ✅ Apache 2.0
│   └── validators.js             ✅ Apache 2.0
├── chat/
│   ├── index.js                  ✅ Apache 2.0
│   ├── message-handler.js        ✅ Apache 2.0
│   ├── rich-messages.js          ✅ Apache 2.0
│   └── reactions.js              ✅ Apache 2.0
├── channels/
│   ├── index.js                  ✅ Apache 2.0
│   ├── channel-manager.js        ✅ Apache 2.0
│   ├── channel-permissions.js    ✅ Apache 2.0 (basic)
│   └── channel-events.js         ✅ Apache 2.0
├── calendar/
│   ├── index.js                  ✅ Apache 2.0
│   ├── basic-calendar.js         ✅ Apache 2.0
│   ├── event-manager.js          ✅ Apache 2.0
│   └── ical-support.js           ✅ Apache 2.0
├── tasks/
│   ├── index.js                  ✅ Apache 2.0
│   ├── task-manager.js           ✅ Apache 2.0
│   ├── task-states.js            ✅ Apache 2.0
│   └── task-notifications.js     ✅ Apache 2.0
├── marketplace/
│   ├── index.js                  ✅ Apache 2.0
│   ├── agent-discovery.js        ✅ Apache 2.0
│   └── rating-system.js          ✅ Apache 2.0
├── connectors/
│   ├── index.js                  ✅ Apache 2.0
│   ├── webhook-connector.js      ✅ Apache 2.0
│   ├── slack-basic.js            ✅ Apache 2.0
│   ├── github-basic.js           ✅ Apache 2.0
│   ├── http-connector.js         ✅ Apache 2.0
│   └── standard-connectors.json  ✅ Apache 2.0
└── monitoring/
    ├── basic-metrics.js          ✅ Apache 2.0
    └── agent-logs.js             ✅ Apache 2.0
```

### 3. Enterprise Edition (Commercial License)

These advanced features are exclusive to EE and require a valid license key:

```
packages/ee/
├── multi-tenancy/
│   ├── index.js                  ❌ Commercial
│   ├── tenant-manager.js         ❌ Commercial
│   ├── tenant-isolation.js       ❌ Commercial
│   ├── tenant-quotas.js          ❌ Commercial
│   ├── billing-integration.js    ❌ Commercial
│   └── branding-engine.js        ❌ Commercial
├── llm-router-advanced/
│   ├── index.js                  ❌ Commercial
│   ├── model-selector.js         ❌ Commercial
│   ├── cost-optimizer.js         ❌ Commercial
│   ├── request-batching.js       ❌ Commercial
│   ├── fallback-strategy.js      ❌ Commercial
│   ├── cache-layer.js            ❌ Commercial
│   ├── model-registry/
│   │   ├── gpt4.js               ❌ Commercial
│   │   ├── claude-enterprise.js  ❌ Commercial
│   │   ├── gemini-enterprise.js  ❌ Commercial
│   │   └── proprietary-models.js ❌ Commercial
│   └── monitoring.js             ❌ Commercial
├── e2e-encryption/
│   ├── index.js                  ❌ Commercial
│   ├── message-encryption.js     ❌ Commercial
│   ├── key-management.js         ❌ Commercial
│   ├── kms-integration.js        ❌ Commercial
│   ├── database-encryption.js    ❌ Commercial
│   └── tls-config.js             ❌ Commercial
├── vdrive/
│   ├── index.js                  ❌ Commercial
│   ├── virtual-filesystem.js     ❌ Commercial
│   ├── file-persistence.js       ❌ Commercial
│   ├── versioning.js             ❌ Commercial
│   └── sync-engine.js            ❌ Commercial
├── connectors/
│   ├── index.js                  ❌ Commercial
│   ├── sap-connector.js          ❌ Commercial
│   ├── oracle-connector.js       ❌ Commercial
│   ├── salesforce-connector.js   ❌ Commercial
│   ├── hubspot-connector.js      ❌ Commercial
│   ├── ms365-connector.js        ❌ Commercial
│   ├── teams-connector.js        ❌ Commercial
│   ├── sharepoint-connector.js   ❌ Commercial
│   ├── okta-connector.js         ❌ Commercial
│   ├── azure-ad-connector.js     ❌ Commercial
│   └── custom-connector-sdk.js   ❌ Commercial
├── cloud-code/
│   ├── index.js                  ❌ Commercial
│   ├── function-runtime.js       ❌ Commercial
│   ├── sandbox.js                ❌ Commercial
│   ├── python-executor.js        ❌ Commercial
│   ├── js-executor.js            ❌ Commercial
│   ├── go-executor.js            ❌ Commercial
│   ├── audit-logging.js          ❌ Commercial
│   └── resource-limits.js        ❌ Commercial
├── analytics/
│   ├── index.js                  ❌ Commercial
│   ├── dashboard-api.js          ❌ Commercial
│   ├── performance-metrics.js    ❌ Commercial
│   ├── llm-usage-analytics.js    ❌ Commercial
│   ├── user-engagement.js        ❌ Commercial
│   ├── cost-tracking.js          ❌ Commercial
│   ├── export-reports.js         ❌ Commercial
│   └── visualization.js          ❌ Commercial
├── sso-saml/
│   ├── index.js                  ❌ Commercial
│   ├── oauth-provider.js         ❌ Commercial
│   ├── openid-connect.js         ❌ Commercial
│   ├── saml-provider.js          ❌ Commercial
│   ├── azure-ad-integration.js   ❌ Commercial
│   ├── okta-integration.js       ❌ Commercial
│   └── custom-oidc.js            ❌ Commercial
├── audit-logs/
│   ├── index.js                  ❌ Commercial
│   ├── event-logger.js           ❌ Commercial
│   ├── immutable-storage.js      ❌ Commercial
│   ├── compliance-export.js      ❌ Commercial
│   ├── soc2-reporter.js          ❌ Commercial
│   ├── hipaa-compliance.js       ❌ Commercial
│   └── gdpr-tools.js             ❌ Commercial
└── backup/
    ├── index.js                  ❌ Commercial
    ├── snapshot-manager.js       ❌ Commercial
    ├── cross-region-replication.js ❌ Commercial
    ├── point-in-time-recovery.js ❌ Commercial
    ├── disaster-recovery.js      ❌ Commercial
    └── scheduled-backups.js      ❌ Commercial
```

### 4. License Management (Shared)

These are used by both CE and EE to manage licensing:

```
packages/license/
├── license-validator.js          ✅ Apache 2.0 (open-source validation)
├── feature-gates.js              ✅ Apache 2.0 (open-source gates)
├── license-key-parser.js         ✅ Apache 2.0 (JWT parsing, no secrets)
├── license-cache.js              ✅ Apache 2.0
└── license-key-gen.js            ❌ Commercial (internal tool only)
```

### 5. Configuration & Deployment

```
docker/
├── Dockerfile                    ✅ Apache 2.0
├── docker-compose.yml            ✅ Apache 2.0
├── entrypoint.sh                 ✅ Apache 2.0
└── health-check.sh               ✅ Apache 2.0

.env.example                       ✅ Apache 2.0
.env.ee.example                    ✅ Apache 2.0 (documents EE features)

package.json                       ✅ Apache 2.0
tsconfig.json                      ✅ Apache 2.0
jest.config.js                     ✅ Apache 2.0
```

### 6. Tests

```
tests/
├── ce/
│   ├── agent-builder.test.js     ✅ Apache 2.0
│   ├── chat.test.js              ✅ Apache 2.0
│   ├── channels.test.js          ✅ Apache 2.0
│   └── connectors.test.js        ✅ Apache 2.0
└── ee/
    ├── multi-tenancy.test.js     ❌ Commercial
    ├── llm-router.test.js        ❌ Commercial
    ├── e2e-encryption.test.js    ❌ Commercial
    ├── connectors-advanced.test.js ❌ Commercial
    └── analytics.test.js         ❌ Commercial
```

### 7. Documentation

```
docs/
├── README.md                      ✅ Apache 2.0
├── GETTING_STARTED.md            ✅ Apache 2.0
├── API_REFERENCE.md              ✅ Apache 2.0
├── ARCHITECTURE.md               ✅ Apache 2.0
├── licensing/
│   ├── open-core-strategy.md     ✅ Apache 2.0 (policy doc)
│   ├── LICENSE-APACHE-2.0        ✅ Apache 2.0
│   ├── LICENSE-COMMERCIAL.md     ✅ Apache 2.0 (policy doc)
│   ├── file-split-plan.md        ✅ Apache 2.0 (this doc)
│   └── NOTICE.md                 ✅ Apache 2.0
├── ee-guides/
│   ├── multi-tenancy.md          ❌ Commercial (EE features)
│   ├── llm-router-config.md      ❌ Commercial
│   ├── advanced-connectors.md    ❌ Commercial
│   └── analytics-guide.md        ❌ Commercial
└── ...
```

---

## Feature Gate Implementation

### License Validation at Startup

```javascript
// packages/license/index.js
import { validateLicense } from './license-validator.js';
import { FeatureGates } from './feature-gates.js';

export async function initializeLicense() {
  const licenseKey = process.env.VUTLER_LICENSE_KEY;
  
  let license = null;
  if (licenseKey) {
    try {
      license = await validateLicense(licenseKey);
      console.log(`✅ Enterprise License activated for ${license.org_id}`);
    } catch (err) {
      console.warn(`⚠️  License validation failed: ${err.message}`);
      console.log(`📦 Reverting to Community Edition`);
      license = null;
    }
  } else {
    console.log(`📦 Running Community Edition (no license key)`);
  }
  
  return new FeatureGates(license);
}
```

### Feature Gates in Code

```javascript
// packages/license/feature-gates.js
export class FeatureGates {
  constructor(license) {
    this.license = license;
  }

  isEnabled(feature) {
    return this.license && this.license.features.includes(feature);
  }

  requireFeature(feature) {
    if (!this.isEnabled(feature)) {
      throw new Error(
        `Feature '${feature}' requires Enterprise Edition. ` +
        `Set VUTLER_LICENSE_KEY environment variable to activate.`
      );
    }
  }
}

// Usage in app initialization
import { initializeLicense } from 'packages/license';

const gates = await initializeLicense();

// Conditionally load EE components
if (gates.isEnabled('multi-tenancy')) {
  const { TenancyManager } = await import('packages/ee/multi-tenancy');
  app.use(new TenancyManager(gates));
}

if (gates.isEnabled('advanced_llm_router')) {
  const { AdvancedRouter } = await import('packages/ee/llm-router-advanced');
  app.use(new AdvancedRouter(gates));
}

// CE components always load
import { BasicAgentBuilder } from 'packages/ce/agent-builder';
app.use(new BasicAgentBuilder());
```

---

## Build & Deployment Strategy

### Single Docker Image

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .

# Install dependencies for both CE and EE
RUN npm install

# Build both
RUN npm run build

# At runtime, license key determines what activates
ENV VUTLER_LICENSE_KEY=""
EXPOSE 3000

CMD ["npm", "start"]
```

### Docker Compose Examples

**Community Edition (Self-Hosted):**
```yaml
services:
  vutler-ce:
    image: vutler:latest
    environment:
      # No VUTLER_LICENSE_KEY = Community Edition
      VUTLER_DB: mongodb://mongo:27017/vutler
    ports:
      - "3000:3000"
```

**Enterprise Edition (Licensed):**
```yaml
services:
  vutler-ee:
    image: vutler:latest
    environment:
      VUTLER_LICENSE_KEY: "eyJhbGc..."  # Valid EE license key
      VUTLER_DB: mongodb://mongo:27017/vutler
      # EE features auto-activate
    ports:
      - "3000:3000"
```

---

## Dependency Management

### package.json Structure

```json
{
  "name": "vutler",
  "version": "1.0.0",
  "dependencies": {
    // Core (Apache 2.0)
    "express": "^4.x",
    "websocket": "^1.x",
    "mongodb": "^5.x",
    "jsonwebtoken": "^9.x"
  },
  "devDependencies": {
    "jest": "^29.x",
    "typescript": "^5.x"
  },
  "workspaces": [
    "packages/core",
    "packages/ce",
    "packages/ee",
    "packages/license"
  ]
}
```

---

## License Header Application

### Script to Add Headers

```bash
#!/bin/bash
# apply-headers.sh

# Apply CE header to all CE files
find packages/ce -type f \( -name "*.js" -o -name "*.ts" \) -exec sh -c '
  if ! head -n 1 "$1" | grep -q "Copyright"; then
    cat docs/licensing/CE-LICENSE-HEADER.txt "$1" > "$1.tmp"
    mv "$1.tmp" "$1"
  fi
' _ {} \;

# Apply EE header to all EE files
find packages/ee -type f \( -name "*.js" -o -name "*.ts" \) -exec sh -c '
  if ! head -n 1 "$1" | grep -q "Copyright"; then
    cat docs/licensing/EE-LICENSE-HEADER.txt "$1" > "$1.tmp"
    mv "$1.tmp" "$1"
  fi
' _ {} \;

# Apply CE header to core files
find packages/core packages/license -type f \( -name "*.js" -o -name "*.ts" \) -exec sh -c '
  if ! head -n 1 "$1" | grep -q "Copyright"; then
    cat docs/licensing/CE-LICENSE-HEADER.txt "$1" > "$1.tmp"
    mv "$1.tmp" "$1"
  fi
' _ {} \;
```

---

## Migration Path: Adding New Features

When adding new features:

1. **Determine tier:** CE or EE?
2. **Create file in appropriate directory:**
   - CE features → `packages/ce/feature-name/`
   - EE features → `packages/ee/feature-name/`
3. **Add license header:**
   - Use `CE-LICENSE-HEADER.txt` for CE
   - Use `EE-LICENSE-HEADER.txt` for EE
4. **Register with feature gates:**
   - For EE features, add feature flag to `feature-gates.js`
5. **Add import guard:**
   ```javascript
   // In app initialization
   if (gates.isEnabled('new_ee_feature')) {
     const { NewEEFeature } = await import('packages/ee/new-feature');
     app.use(new NewEEFeature(gates));
   }
   ```
6. **Test both scenarios:**
   - Test with and without license key

---

## Compliance Checklist

- [ ] All CE files have `CE-LICENSE-HEADER.txt` comment block
- [ ] All EE files have `EE-LICENSE-HEADER.txt` comment block
- [ ] `LICENSE-APACHE-2.0` file is in repository root
- [ ] `LICENSE-COMMERCIAL.md` is in docs/licensing/
- [ ] `NOTICE.md` includes all third-party attributions
- [ ] Feature gates prevent EE feature loading without valid license
- [ ] Docker image includes both CE and EE code (features gate at runtime)
- [ ] Documentation clearly marks EE-only features
- [ ] GitHub repository includes Apache 2.0 license in root
- [ ] CI/CD validates license headers on commit

---

## Summary Table

| Component | License | Location | Accessible |
|-----------|---------|----------|-----------|
| Core runtime | Apache 2.0 | `packages/core/` | CE + EE |
| Chat, channels | Apache 2.0 | `packages/ce/` | CE + EE |
| Agent builder | Apache 2.0 | `packages/ce/` | CE + EE |
| Marketplace | Apache 2.0 | `packages/ce/` | CE + EE |
| Multi-tenancy | Commercial | `packages/ee/` | EE only |
| Advanced LLM Router | Commercial | `packages/ee/` | EE only |
| E2E Encryption | Commercial | `packages/ee/` | EE only |
| VDrive | Commercial | `packages/ee/` | EE only |
| Advanced connectors | Commercial | `packages/ee/` | EE only |
| Cloud code | Commercial | `packages/ee/` | EE only |
| Analytics | Commercial | `packages/ee/` | EE only |
| SSO/SAML | Commercial | `packages/ee/` | EE only |
| Audit logs | Commercial | `packages/ee/` | EE only |
| Backup/recovery | Commercial | `packages/ee/` | EE only |

---

**Next Steps:**
1. Apply this plan to the codebase
2. Add license headers to all source files
3. Implement feature gates in application initialization
4. Test CE and EE modes with and without valid license keys
5. Update CI/CD to validate compliance

