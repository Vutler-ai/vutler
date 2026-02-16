# Vutler - Rocket.Chat fork with AI agent extensions
# Multi-stage build to compile TypeScript and create production image

# ============================================================================
# Stage 1: Build Rocket.Chat with Vutler modifications
# ============================================================================
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git python3 make g++ bash

# Set working directory
WORKDIR /app

# Copy Rocket.Chat source
COPY app/package.json app/yarn.lock ./
COPY app/.yarnrc.yml app/.yarn ./.yarn

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy all source code
COPY app/ ./

# Copy custom Vutler extensions
COPY app/custom /app/custom

# Build Rocket.Chat
ENV NODE_ENV=production
RUN yarn build

# ============================================================================
# Stage 2: Production runtime
# ============================================================================
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache bash curl

# Create app user
RUN addgroup -g 65533 -S rocketchat && \
    adduser -u 65533 -S -G rocketchat rocketchat

WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=rocketchat:rocketchat /app/apps/meteor/.meteor /app/.meteor
COPY --from=builder --chown=rocketchat:rocketchat /app/apps/meteor/.build /app/.build
COPY --from=builder --chown=rocketchat:rocketchat /app/node_modules /app/node_modules
COPY --from=builder --chown=rocketchat:rocketchat /app/custom /app/custom

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD curl -f http://localhost:3000/api/info || exit 1

# Switch to non-root user
USER rocketchat

# Start Rocket.Chat
CMD ["node", ".build/bundle/main.js"]
