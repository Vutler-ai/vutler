# Deploy Plan: Next.js Frontend Server (Option B)

## Objectif
Remplacer le service statique nginx par un serveur Next.js Node sur port 3002, proxied par nginx. Élimine les problèmes de chunks JS / build mismatch.

## Architecture Cible
```
Browser → nginx (443/SSL)
  → /api/v1/*          → Express API (3001)
  → /api/v1/* fallback → Rocket.Chat (3000)
  → /ws/chat           → Express WebSocket (3001)
  → /channel|direct... → Rocket.Chat (3000)
  → /* (catch-all)     → Next.js Server (3002) ← NEW
```

## Étapes

### 1. Dockerfile Frontend
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

### 2. Docker Compose (ajouter au stack existant)
```yaml
  vutler-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: vutler-frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3002:3002"
    environment:
      - NODE_ENV=production
      - PORT=3002
      - HOSTNAME=0.0.0.0
```

### 3. Nginx Config (simplifiée)
Remplacer toutes les locations statiques par :
```nginx
# Next.js Frontend — catch-all LAST
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 4. Assets statiques
- `/landing/` → garder dans nginx (pas servi par Next.js)
- `/sprites/` → migrer dans Next.js `/public/sprites/`
- `/favicon.svg` → dans Next.js `/public/`

### 5. Process de deploy
```bash
# Build & restart container
cd /home/ubuntu/vutler
docker compose build vutler-frontend
docker compose up -d vutler-frontend
# Nginx reload (one-time config change)
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Rollback
Si problème, remettre l'ancienne config nginx (fichiers statiques) :
```bash
sudo cp /home/ubuntu/vutler/vutler-nginx.bak /etc/nginx/sites-enabled/vutler
sudo systemctl reload nginx
docker stop vutler-frontend
```

## Avantages
- ✅ Plus de mismatch HTML/chunks JS
- ✅ Deploy = just `docker compose build && up`
- ✅ Next.js middleware, SSR, ISR disponibles
- ✅ Hot reload possible en dev
- ✅ Même process pour tous les devs

## Prérequis
- Sprint "Full Dynamic" terminé (toutes les pages connectées aux APIs)
- Docker compose mis à jour
- Nginx config testée en staging
