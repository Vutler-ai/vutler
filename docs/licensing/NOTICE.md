# Vutler Third-Party License Attribution

**Document Version:** 1.0  
**Effective Date:** 2026-02-23  
**Organization:** Starbox Group GmbH

---

## Overview

This document acknowledges and provides attribution for third-party software components included in Vutler (Community Edition and Enterprise Edition). Vutler respects open-source licenses and complies with all attribution and distribution requirements.

---

## Primary Foundation: Rocket.Chat

### License
**MIT License**

### Copyright
Copyright (c) 2016-2026 Rocket.Chat Contributors

### Terms
Rocket.Chat is distributed under the MIT License, which permits:
- ✅ Commercial use
- ✅ Modification
- ✅ Distribution
- ✅ Private use

Subject to:
- ⚠️ License and copyright notice must be included with any distribution

### Attribution
Vutler is forked from Rocket.Chat and builds upon its foundation for open-source team communication. Vutler contributors extend and customize Rocket.Chat's platform for AI agent orchestration.

### Full License Text

```
MIT License

Copyright (c) 2016-2026 Rocket.Chat Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Repository
- **GitHub:** https://github.com/RocketChat/Rocket.Chat
- **Website:** https://rocket.chat/

---

## Core Dependencies

### Node.js Runtime
**License:** MIT  
**Repository:** https://github.com/nodejs/node  
**Used for:** JavaScript runtime environment

### Express.js
**License:** MIT  
**Repository:** https://github.com/expressjs/express  
**Used for:** HTTP server framework

### MongoDB Node Driver
**License:** Apache 2.0  
**Repository:** https://github.com/mongodb/node-mongodb-native  
**Used for:** Database connectivity

### JWT (jsonwebtoken)
**License:** MIT  
**Repository:** https://github.com/auth0/node-jsonwebtoken  
**Used for:** License key validation, authentication tokens

### WebSocket Library
**License:** MIT  
**Repository:** https://github.com/websockets/ws  
**Used for:** Real-time bi-directional communication

### TypeScript
**License:** Apache 2.0  
**Repository:** https://github.com/microsoft/TypeScript  
**Used for:** Type-safe JavaScript development

---

## Enterprise Edition (EE) Dependencies

### Advanced LLM Router
**Built with:**
- OpenAI API client (MIT)
- Anthropic SDK (MIT)
- Google Generative AI SDK (Apache 2.0)

### End-to-End Encryption
**Dependencies:**
- crypto-js (MIT) — Encryption utilities
- TweetNaCl.js (Unlicense/MIT) — Cryptographic operations
- libsodium.js (MIT) — Libsodium wrapper for advanced crypto

### Multi-Tenancy
**Dependencies:**
- mongoose (MIT) — MongoDB ORM
- passport (MIT) — Authentication framework

### Cloud Code Execution
**Dependencies:**
- esprima (BSD) — JavaScript parser
- estraverse (BSD) — AST traversal
- vm2 (MIT) — Secure VM execution (for sandboxing)

### Analytics Dashboard
**Dependencies:**
- recharts (MIT) — React chart library
- date-fns (MIT) — Date utilities
- lodash (MIT) — Utility functions

### SSO/SAML Integration
**Dependencies:**
- passport-oauth2 (MIT) — OAuth 2.0 strategy
- passport-saml (MIT) — SAML strategy
- passport-openidconnect (MIT) — OpenID Connect strategy
- xml2js (MIT) — XML parsing

### Advanced Connectors
**SAP Integration:**
- sap-connector-lib (proprietary under partner agreement)

**Salesforce Integration:**
- jsforce (MIT) — Salesforce API client

**Microsoft 365 Integration:**
- @microsoft/microsoft-graph-client (Apache 2.0) — Microsoft Graph API
- @azure/identity (MIT) — Azure authentication
- @azure/storage-blob (MIT) — Azure storage

---

## Community Edition (CE) Dependencies

### Standard Connectors
- **Slack:** @slack/web-api (MIT)
- **GitHub:** @octokit/rest (MIT)
- **HTTP:** axios (MIT)
- **Webhooks:** express-webhook (MIT)

### Calendar Integration
- **iCal Support:** ical.js (Mozilla Public License 2.0)
- **Date Parsing:** date-fns (MIT)

### Task Management
- **State Management:** immer (MIT)

---

## Development Dependencies

### Testing
- Jest (MIT) — Testing framework
- Supertest (MIT) — HTTP assertion library
- Sinon (BSD) — Mocking and stubbing

### Code Quality
- ESLint (MIT) — Linting
- Prettier (MIT) — Code formatting
- TypeScript ESLint (MIT/Apache 2.0) — TypeScript linting

### Build & Deployment
- Webpack (MIT) — Module bundler
- Babel (MIT) — JavaScript transpiler
- Docker (Apache 2.0) — Containerization

---

## License Compatibility Matrix

| License | CE? | EE? | Notes |
|---------|-----|-----|-------|
| MIT | ✅ | ✅ | Highly compatible with Apache 2.0 and commercial |
| Apache 2.0 | ✅ | ✅ | Explicit patent grants; compatible with MIT |
| BSD | ✅ | ✅ | Similar to MIT; permissive |
| Unlicense | ✅ | ✅ | Public domain equivalent |
| MPL 2.0 | ✅ | ✅ | File-level copyleft; compatible |
| ISC | ✅ | ✅ | Functionally equivalent to MIT |
| LGPL | ✅ | ⚠️ | Weak copyleft; requires attribution |
| GPL v2/v3 | ❌ | ❌ | Strict copyleft; not compatible |
| AGPL | ❌ | ❌ | Network copyleft; not used |

---

## License Compliance Statements

### Rocket.Chat Attribution (Required)

```
This product includes software developed by Rocket.Chat Contributors.
The Rocket.Chat platform is licensed under the MIT License.
See https://github.com/RocketChat/Rocket.Chat for the full source and license.

Modifications and extensions by Starbox Group GmbH (Vutler) are licensed under:
- Apache License 2.0 (Community Edition)
- Commercial License (Enterprise Edition)
```

### Included with Distributions

When distributing Vutler (CE or EE):

1. **Include full text of:**
   - LICENSE-APACHE-2.0 (for CE)
   - LICENSE-COMMERCIAL.md (for EE)
   - This NOTICE.md file

2. **Acknowledge in README:**
   ```markdown
   ## Acknowledgments

   Vutler is built on the foundation of Rocket.Chat (MIT License).
   
   See NOTICE.md for complete third-party attribution.
   ```

3. **In Docker image:**
   ```dockerfile
   COPY docs/licensing/LICENSE-APACHE-2.0 /app/LICENSE
   COPY docs/licensing/NOTICE.md /app/NOTICE.md
   ```

---

## How Third-Party Licenses Are Included

### Community Edition (Apache 2.0)
All dependencies are licensed under permissive licenses (MIT, Apache 2.0, BSD, etc.). These licenses are compatible with Apache 2.0 and allow:
- ✅ Commercial use of CE
- ✅ Distribution of CE
- ✅ Modification of CE

**Exception:** If a CE dependency is GPL-licensed, it is not included. We avoid GPL dependencies to preserve permissive licensing.

### Enterprise Edition (Commercial License)
EE may include proprietary connectors and integrations:
- SAP connector (under separate partner agreement)
- Specialized enterprise extensions

**Proprietary components are not distributed standalone** and are activated only with valid enterprise license keys.

---

## Dependency Updates & Maintenance

### Community Edition
- Regular dependency updates via npm
- Security patches applied within 24 hours of public disclosure
- Quarterly major dependency updates with release notes

### Enterprise Edition
- Matched release cycle with CE
- Additional security audits of EE-specific dependencies
- Enterprise support for dependency compatibility issues

---

## Handling License Conflicts

If a new dependency introduces a GPL license:
1. ⛔ It is **rejected** for CE unless absolutely necessary
2. ⚠️ For EE, it may be accepted only for isolated, proprietary components
3. 🔄 Alternative permissive-licensed packages are preferred
4. 📋 Legal review is required before adding any restrictive licenses

---

## Third-Party Security

### Vulnerability Management
1. **Automated scanning:** npm audit, Snyk integration
2. **Alert policy:** Critical vulnerabilities trigger immediate patches
3. **Reporting:** Security issues reported to Starbox Group security team
4. **Disclosure:** Responsible disclosure for CVEs

### Dependency Vetting
- All new dependencies reviewed for license compatibility
- Security track record evaluated
- Maintenance status verified
- Community health assessed

---

## Contact & Questions

For questions regarding third-party licenses or attribution:

**Email:** legal@starboxgroup.com  
**Address:** Starbox Group GmbH, Geneva, Switzerland

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-02-23 | Initial publication |

---

## Full License Texts

### MIT License (Standard Text)
```
MIT License

Copyright (c) [year] [copyright holder]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache License 2.0
For full Apache License 2.0 text, see LICENSE-APACHE-2.0 file.

---

**This NOTICE.md file is authoritative for Vutler third-party licensing compliance.**

Last Updated: 2026-02-23

