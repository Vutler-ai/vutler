# Vutler Platform

Vutler is an AI agent management platform by Starbox Group.

## Stack
- Node.js (Express API)
- PostgreSQL
- Redis
- MongoDB (legacy/runtime integrations)
- Docker

## Repository
- GitHub: `alopez3006/vutler-platform`
- Main branches: `main`, `dev`

## Quick start
```bash
npm install
npm run start
```

## Tests
```bash
npm test
```

## Deployment (VPS)
Typical deployment is done from the VPS checkout:
```bash
cd /home/ubuntu/vutler
git pull origin main
/home/ubuntu/vutler/scripts/deploy-api.sh
```

## Health check
```bash
curl http://127.0.0.1:3001/api/v1/health
```
