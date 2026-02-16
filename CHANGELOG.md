# Changelog

All notable changes to Vutler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-02-16

### Added - Sprint 1

#### Infrastructure (S1.1)
- Docker Compose setup with Vutler app, MongoDB, and Redis
- Complete environment configuration (.env.example)
- Health checks for all services
- Automated MongoDB replica set initialization
- Comprehensive README with setup instructions

#### Agent Identity API (S1.2)
- `POST /api/v1/agents` - Create AI agents with API key generation
- `GET /api/v1/agents` - List all agents
- `GET /api/v1/agents/:id` - Get agent details
- API key authentication (SHA-256 hashed)
- Extended Rocket.Chat user model with `type: 'agent'`
- Unit tests for agent identity functionality

#### Email Send API (S1.3)
- `POST /api/v1/email/send` - Send emails via SMTP
- `GET /api/v1/email/sent` - Get sent email history
- SMTP integration with nodemailer
- Rate limiting (10 emails/minute per agent)
- Support for CC, BCC, reply-to headers
- Email tracking in MongoDB
- Unit tests for email sending and rate limiting

#### Email Receive API (S1.4)
- `GET /api/v1/email/inbox` - Get received emails
- `PATCH /api/v1/email/inbox/:id/read` - Mark emails as read
- IMAP polling service (configurable interval)
- Automatic email storage and agent matching
- Webhook push notifications for new emails
- Duplicate email prevention
- Unit tests for IMAP functionality

#### Chat API (S1.5)
- `POST /api/v1/chat/send` - Send messages to channels as agents
- `GET /api/v1/chat/channels` - List available channels
- `GET /api/v1/chat/messages` - Get channel message history
- Messages display with agent avatar and name
- Support for attachments and emoji
- Unit tests for chat functionality

#### Developer Environment (S1.7)
- Complete .env.example with all configuration options
- Docker healthchecks for all services
- Comprehensive test suite (33 tests, all passing)
- Test runner script (run-all.sh)
- Architecture documentation
- API reference documentation
- Contributing guidelines

### Security
- API key-based authentication with SHA-256 hashing
- Keys shown only once on creation
- Per-agent authorization (agents can only access their own data)
- Rate limiting to prevent abuse
- Input validation on all endpoints

### Documentation
- Complete API reference with examples
- Architecture overview and diagrams
- Docker setup and deployment guide
- Environment variable reference
- Testing guide

## Statistics - Sprint 1

- **Story Points**: 19 SP
- **Features**: 5 major features
- **API Endpoints**: 11 endpoints
- **Tests**: 33 unit tests (100% passing)
- **Lines of Code**: ~2,500 LOC (custom code)
- **Duration**: 1 sprint

---

[1.0.0]: https://github.com/vutler/vutler/releases/tag/v1.0.0
