# Vutler Quick Start

Get Vutler running in 5 minutes.

## Prerequisites

- Docker & Docker Compose
- 8GB RAM available
- Ports 3000, 3001, 8025 available

## 1. Clone & Configure

```bash
cd /path/to/vutler

# Copy environment config
cp .env.example .env

# (Optional) Edit .env for production SMTP/IMAP
nano .env
```

## 2. Start Services

```bash
# Build and start
docker compose up --build

# Or in background
docker compose up -d --build

# Watch logs
docker compose logs -f vutler-api
```

**Wait for:**
```
✅ MongoDB connected
✅ Database indexes created
✅ Vutler APIs mounted
🎉 Vutler API listening on http://0.0.0.0:3001
```

## 3. Test the APIs

### Create an Agent

```bash
curl -X POST http://localhost:3001/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "email": "test@vutler.local",
    "description": "My first Vutler agent"
  }'
```

**Save the API key from the response!**

### List Templates

```bash
curl http://localhost:3001/api/v1/templates | jq
```

### Deploy from Template

```bash
curl -X POST http://localhost:3001/api/v1/agents/from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "template-customer-support",
    "name": "Support Bot",
    "email": "support@vutler.local"
  }' | jq
```

### Send an Email

```bash
# Replace YOUR_API_KEY with the key from agent creation
curl -X POST http://localhost:3001/api/v1/email/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Hello from Vutler",
    "body": "This is a test email!"
  }' | jq
```

### Check Mailhog (Email UI)

```bash
open http://localhost:8025
```

You should see the email you just sent!

## 4. Access Rocket.Chat UI

```bash
open http://localhost:3000
```

**First time:**
1. Create admin user
2. Setup workspace
3. Explore the Rocket.Chat interface

## 5. Run Tests

```bash
# Enter the vutler-api container
docker compose exec vutler-api sh

# Run all tests
npm test

# Or individual suite
npm run test:templates
```

## Troubleshooting

### Services Won't Start

```bash
# Check status
docker compose ps

# Check logs
docker compose logs

# Rebuild from scratch
docker compose down -v
docker compose up --build
```

### MongoDB Replica Set Error

```bash
# Manually initialize
docker compose exec mongo mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]})"

# Restart vutler-api
docker compose restart vutler-api
```

### Can't Access APIs

```bash
# Check if port is bound
curl http://localhost:3001/api/v1/health

# Check firewall/network
docker compose exec vutler-api ping mongo
```

## What's Next?

- **Create more agents** via templates or custom
- **Configure real SMTP/IMAP** for production email
- **Connect OpenClaw** for AI agent runtime
- **Build custom templates** for your use cases
- **Integrate with your apps** via the REST API

## Documentation

- `README-DOCKER.md` — Full Docker setup guide
- `sprints/SPRINT-2-COMPLETION.md` — What was built
- `.env.example` — Configuration reference
- `docs/architecture/` — Technical architecture

## Need Help?

- Check logs: `docker compose logs -f`
- Review tests: `app/custom/tests/`
- See `sprints/blockers.md` for known issues

---

**Happy building!** 🚀
