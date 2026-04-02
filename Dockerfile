# Vutler API - AI Agent Extensions
# Lightweight Express API for agent management, email, and chat
FROM node:20-alpine
RUN apk add --no-cache curl docker-cli
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=20s \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1
CMD ["node", "index.js"]
