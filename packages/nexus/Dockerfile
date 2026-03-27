FROM node:20-alpine

# Install common tools for shell provider
RUN apk add --no-cache curl git bash

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Environment variables (override at runtime)
ENV NEXUS_TOKEN=""
ENV NEXUS_SERVER="https://app.vutler.ai"
ENV NODE_NAME="nexus-docker"
ENV NEXUS_PORT=3100

# Data directory for enterprise filesystem
RUN mkdir -p /data
VOLUME /data

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

# Entrypoint: if NEXUS_TOKEN is set, use init+start; otherwise just start
CMD ["sh", "-c", "if [ -n \"$NEXUS_TOKEN\" ]; then node bin/cli.js init \"$NEXUS_TOKEN\" && node bin/cli.js start --server \"$NEXUS_SERVER\" --port \"$NEXUS_PORT\"; else node bin/cli.js start --server \"$NEXUS_SERVER\" --port \"$NEXUS_PORT\"; fi"]
