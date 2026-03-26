# Vutler Platform

> AI Agent Management Platform by [Starbox Group](https://starbox-group.com/)

Vutler is a production-grade platform for creating, deploying, and orchestrating AI agents that interact through chat, email, webhooks, and custom integrations. Built with Node.js, PostgreSQL, and designed for multi-tenant enterprise environments.

**Homepage:** [vutler.ai](https://vutler.ai)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ ([download](https://nodejs.org/))
- **PostgreSQL** 15+ ([setup guide](https://www.postgresql.org/download/))
- **Redis** 7+ (optional, for caching/pub-sub)
- **npm** 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/alopez3006/vutler-platform.git
cd vutler-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env  # Then edit with your settings

# Run migrations (if applicable)
npm run db:migrate

# Start development server
npm run dev

# Or start production
npm start
```

**Health check:**
```bash
curl http://localhost:3001/api/v1/health
```

---

## 📋 Core Features

### Agent Runtime
- **Multi-agent orchestration** with intelligent routing
- **LLM support**: OpenAI, Anthropic, MiniMax
- **Tool framework**: extensible system for custom tools
- **Memory integration**: Snipara for persistent context

### Communication Channels
- **Chat**: Deep Rocket.Chat integration with DDP protocol
- **Email**: Inbound/outbound processing (IMAP/SMTP)
- **Webhooks**: HTTP event handlers for custom integrations
- **Real-time**: WebSocket + Socket.io for live updates

### Enterprise Features
- **Multi-tenant**: Workspace-based data isolation & RBAC
- **VDrive**: Encrypted file storage with chat integration
- **Billing**: Stripe integration for subscription management
- **Security**: JWT auth, rate limiting, HTTPS, OWASP compliance
- **Compliance**: GDPR, data retention policies

---

## 🛠 Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 20+ |
| **API** | Express.js 4.x |
| **Databases** | PostgreSQL 15+ (primary), MongoDB (Rocket.Chat), Redis (cache) |
| **Real-time** | WebSocket (DDP), Socket.io |
| **Container** | Docker + Docker Compose |
| **Proxy** | Nginx |
| **Process** | PM2 (production) |
| **Auth** | JWT, OAuth2 |
| **Payments** | Stripe API |

### Key Dependencies
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.0",
  "mongodb": "^6.0.0",
  "jsonwebtoken": "^9.0.3",
  "stripe": "^20.4.1",
  "axios": "^1.6.0",
  "ws": "^8.19.0",
  "helmet": "^8.1.0",
  "express-rate-limit": "^8.3.0"
}
```

---

## 📁 Project Structure

```
vutler-platform/
├── index.js                 # Main API server
├── agents.js               # Agent runtime & orchestration
├── agentRuntime.js         # Agent execution engine
├── auth.js                 # Authentication & JWT
├── chat-api.js             # Rocket.Chat integration
├── drive.html              # VDrive frontend
├── webhooks/               # Webhook handlers
├── tests/                  # Test suite
│   ├── llm-router.test.js
│   ├── agent-identity.test.js
│   ├── chat.test.js
│   └── drive-api.test.js
├── package.json
├── vutler-nginx.conf       # Nginx configuration
├── Dockerfile
├── .env                    # Environment variables
└── AGENTS.md              # Developer guide
```

---

## 🔧 Configuration

### Environment Variables

**Core:**
```bash
NODE_ENV=production              # development | production
PORT=3001
API_URL=https://api.vutler.ai

DATABASE_URL=postgresql://...    # PostgreSQL connection string
REDIS_URL=redis://...            # Redis connection (optional)
MONGODB_URI=mongodb://...        # MongoDB for Rocket.Chat
```

**Authentication:**
```bash
AUTH_SECRET=your-jwt-secret
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
```

**Integrations:**
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINMAX_API_KEY=...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

ROCKET_CHAT_URL=https://chat.example.com
ROCKET_CHAT_USER=vutler-bot
ROCKET_CHAT_PASSWORD=...
```

**Email:**
```bash
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=alex@vutler.com
IMAP_PASSWORD=...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

**Storage (AWS S3/R2):**
```bash
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=vutler-files
```

See `.env.example` for complete reference.

---

## 🚦 Development

### Scripts

```bash
# Development with auto-reload
npm run dev

# Run all tests
npm test

# Test specific module
npm run test:llm         # LLM router
npm run test:agent       # Agent identity
npm run test:chat        # Chat integration
npm run test:drive       # VDrive API
npm run test:email-send  # Email sending
npm run test:email-recv  # Email receiving

# Watch tests
npm run test:watch

# Linting
npm run lint
npm run format
```

### API Endpoints

**Health & Status:**
```
GET  /api/v1/health
GET  /api/v1/status
```

**Agents:**
```
GET    /api/v1/agents              # List agents
POST   /api/v1/agents              # Create agent
GET    /api/v1/agents/:id          # Get agent details
PUT    /api/v1/agents/:id          # Update agent
DELETE /api/v1/agents/:id          # Delete agent
POST   /api/v1/agents/:id/invoke   # Execute agent
```

**Messages & Chat:**
```
POST   /api/v1/messages             # Send message
GET    /api/v1/messages             # Get message history
POST   /api/v1/chat/webhook         # Incoming webhook
```

**VDrive (File Storage):**
```
POST   /api/v1/vdrive/upload        # Upload file
GET    /api/v1/vdrive/:fileId       # Download file
DELETE /api/v1/vdrive/:fileId       # Delete file
GET    /api/v1/vdrive/list          # List files
```

**Billing:**
```
POST   /api/v1/billing/checkout     # Stripe checkout session
GET    /api/v1/billing/usage        # Usage stats
```

**Webhooks:**
```
POST   /api/webhooks/stripe         # Stripe events
POST   /api/webhooks/rocket-chat    # Rocket.Chat events
```

---

## 🐳 Docker Deployment

### Local Docker Setup

```bash
# Build image
docker build -t vutler-api:latest .

# Run container
docker run -d \
  --name vutler-api \
  -p 3001:3001 \
  --env-file .env \
  vutler-api:latest

# View logs
docker logs -f vutler-api

# Stop container
docker stop vutler-api
```

### Production (VPS)

**Deploy from main branch:**
```bash
cd /home/ubuntu/vutler
git pull origin main
./scripts/deploy-api.sh
```

**Via Docker Compose:**
```bash
docker-compose up -d
```

---

## 🔐 Security

### Best Practices
- ✅ **HTTPS only** in production
- ✅ **JWT validation** on all protected endpoints
- ✅ **Rate limiting** (express-rate-limit)
- ✅ **CORS** properly configured
- ✅ **Helmet** security headers
- ✅ **Input validation** (express-validator, Zod)
- ✅ **SQL injection prevention** (parameterized queries)
- ✅ **OWASP Top 10 compliance**

### Authentication

Default JWT structure:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "workspace": "workspace-id",
  "iat": 1234567890,
  "exp": 1234654290
}
```

### Rate Limiting

- **Public endpoints**: 100 req/min
- **API endpoints**: 1000 req/min per user
- **WebSocket**: 50 messages/min

---

## 📊 Monitoring & Logging

### Health Check
```bash
curl http://localhost:3001/api/v1/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 3600,
  "postgres": "connected",
  "redis": "connected",
  "timestamp": "2024-03-26T10:00:00Z"
}
```

### Logs
- **Console**: Development mode
- **File**: `/var/log/vutler/api.log` (production)
- **Format**: JSON for structured logging

---

## 🤝 Contributing

We welcome contributions from the community!

### Before You Start
1. Read [AGENTS.md](./AGENTS.md) — comprehensive developer guide
2. Check [CODING_STANDARDS.md](./CODING_STANDARDS.md) — code style
3. Review open issues & PRs

### Workflow
```bash
# 1. Create feature branch from `dev`
git checkout -b feature/your-feature dev

# 2. Make changes
npm run format   # Format code
npm run lint     # Check linting

# 3. Test thoroughly
npm test

# 4. Push & create PR
git push origin feature/your-feature
```

**Branch naming:**
- `feature/` — new features
- `fix/` — bug fixes
- `docs/` — documentation
- `test/` — tests
- `refactor/` — refactoring

---

## 📦 Release & Versioning

Follows **Semantic Versioning** (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes (v2.0.0)
- **MINOR**: New features, backward compatible (v1.1.0)
- **PATCH**: Bug fixes (v1.0.1)

**Release process:**
```bash
npm version patch|minor|major
git push origin main --tags
# GitHub Actions deploys automatically
```

---

## 🆘 Support & Contact

### Documentation
- **Full Docs**: [AGENTS.md](./AGENTS.md)
- **Standards**: [CODING_STANDARDS.md](./CODING_STANDARDS.md)
- **Security**: [SECURITY.md](./SECURITY.md)

### Get Help
- **Issues**: [GitHub Issues](https://github.com/alopez3006/vutler-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/alopez3006/vutler-platform/discussions)
- **Email**: support@vutler.ai
- **Slack**: [Vutler Community](https://slack.vutler.ai)

### Reporting Bugs
```bash
# Include in your report:
1. Node.js version (node --version)
2. Steps to reproduce
3. Expected vs. actual behavior
4. Error logs (no sensitive data!)
5. Environment (dev/prod)
```

---

## 📄 License

**MIT License** — See [LICENSE](./LICENSE) for full text.

You are free to use, modify, and distribute this software with attribution.

---

## 🎯 Roadmap

- [ ] **v2.0** — GraphQL API
- [ ] **Agents v2** — Enhanced memory system
- [ ] **Mobile app** — iOS/Android
- [ ] **Open API** — Third-party integrations
- [ ] **Custom models** — Fine-tuned agent training

See [roadmap.md](./roadmap.md) for details.

---

## 👥 Team

**Vutler** is developed by **Starbox Group** with contributions from the open-source community.

- **CEO**: Alex Lopez
- **CTO**: [Victor Kravtsov](https://github.com/vkravtsov)
- **Lead Dev**: [Andrea Giordano](https://github.com/agiordano)

---

## 💬 Acknowledgments

Built with ❤️ using:
- [Express.js](https://expressjs.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Rocket.Chat](https://rocket.chat/)
- [OpenAI](https://openai.com/), [Anthropic](https://anthropic.com/), [MiniMax](https://www.minimaxi.com/)

---

## 📞 Quick Links

- 🌐 **Website**: https://vutler.ai
- 📧 **Email**: contact@vutler.ai
- 🐙 **GitHub**: https://github.com/alopez3006/vutler-platform
- 💼 **Company**: https://starbox-group.com/

---

**Last updated**: March 26, 2024
**Status**: 🟢 Production Ready
