# Vutler Docker Setup

Run Vutler (Rocket.Chat + AI agents) with Docker Compose.

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start services
docker compose up

# 3. Access Vutler
open http://localhost:3000

# 4. View email test UI (Mailhog)
open http://localhost:8025
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Vutler (Rocket.Chat + AI Agents)       │
│  Port: 3000                             │
│  - Core Rocket.Chat features            │
│  - Custom Agent APIs (/api/v1/agents)   │
│  - Email send/receive                   │
│  - IMAP poller (background)             │
└─────────────────────────────────────────┘
            │
            ├── MongoDB (Replica Set)
            │   Port: 27017
            │   - User data
            │   - Agent data
            │   - Email inbox/sent
            │
            ├── Redis
            │   Port: 6379
            │   - Rate limiting
            │   - Session cache
            │
            └── Mailhog (Dev SMTP)
                SMTP: 1025
                Web UI: 8025
                - Catch outbound emails
                - Test email sending
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| **vutler** | 3000 | Main application |
| **mongo** | 27017 | MongoDB replica set |
| **redis** | 6379 | Cache & rate limiter |
| **mailhog** | 8025 (UI), 1025 (SMTP) | Email testing |

## Environment Variables

See `.env.example` for all configuration options.

### Required on First Run

```bash
# Admin user (created automatically)
ADMIN_USERNAME=admin
ADMIN_PASS=changeme
ADMIN_EMAIL=admin@vutler.local
```

### Email Configuration

**For local testing** (default):
```bash
SMTP_HOST=mailhog
SMTP_PORT=1025
```

**For production** (example with Infomaniak):
```bash
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

### IMAP (Email Receive)

```bash
IMAP_HOST=mail.infomaniak.com
IMAP_PORT=993
IMAP_USER=your-email@example.com
IMAP_PASS=your-password
IMAP_TLS=true
IMAP_POLL_INTERVAL=5
```

Leave empty to disable IMAP polling.

## Build & Run

### Development Mode

```bash
# Build and start in foreground
docker compose up --build

# Or in background
docker compose up -d --build

# View logs
docker compose logs -f vutler
```

### Production Mode

```bash
# Pull/build images
docker compose build

# Start in background
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

## Troubleshooting

### MongoDB Replica Set Init Failed

```bash
# Check mongo logs
docker compose logs mongo

# Manually init replica set
docker compose exec mongo mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]})"
```

### Vutler Won't Start

```bash
# Check dependencies are healthy
docker compose ps

# Rebuild from scratch
docker compose down -v
docker compose up --build
```

### Can't Access UI

```bash
# Check healthcheck
docker compose ps vutler

# Check if port is bound
curl http://localhost:3000/api/info

# View detailed logs
docker compose logs -f vutler
```

### Email Not Sending

```bash
# Check SMTP config in .env
cat .env | grep SMTP

# Check Mailhog UI (local dev)
open http://localhost:8025

# View Vutler logs
docker compose logs vutler | grep -i smtp
```

## Data Persistence

Data is stored in `./data/`:
- `./data/db` — MongoDB data
- `./data/redis` — Redis persistence
- `./data/uploads` — Uploaded files

**Backup:**
```bash
tar -czf vutler-backup-$(date +%Y%m%d).tar.gz data/
```

**Restore:**
```bash
docker compose down
tar -xzf vutler-backup-YYYYMMDD.tar.gz
docker compose up -d
```

## API Endpoints

### Vutler Custom APIs

```bash
# Create agent
curl -X POST http://localhost:3000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"Support Bot","email":"support@vutler.local"}'

# List agents
curl -H "Authorization: Bearer vutler_YOUR_API_KEY" \
  http://localhost:3000/api/v1/agents

# Send email
curl -X POST http://localhost:3000/api/v1/email/send \
  -H "Authorization: Bearer vutler_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"user@example.com","subject":"Hello","body":"Test email"}'
```

### Rocket.Chat Standard APIs

See: https://developer.rocket.chat/reference/api/rest-api

## Development

### Rebuild After Code Changes

```bash
# Stop services
docker compose down

# Rebuild and start
docker compose up --build
```

### Access MongoDB Shell

```bash
docker compose exec mongo mongosh vutler
```

### Access Redis CLI

```bash
docker compose exec redis redis-cli
```

### View All Logs

```bash
docker compose logs -f
```

## Next Steps

1. Create your first admin user at http://localhost:3000
2. Create an AI agent via API
3. Send a test email to Mailhog
4. Configure IMAP for real email receive (production)

## Support

See `/docs/architecture/` for technical details.
