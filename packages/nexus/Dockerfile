FROM node:20-bookworm-slim AS deps

WORKDIR /app/packages/nexus

COPY packages/nexus/package.json packages/nexus/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3100 \
    NEXUS_SERVER=https://app.vutler.ai \
    NEXUS_MODE=enterprise \
    NEXUS_TYPE=docker

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client bash python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/packages/nexus

COPY --from=deps /app/packages/nexus/node_modules ./node_modules
COPY packages/nexus ./

RUN useradd --create-home --uid 10001 --shell /bin/bash nexus \
  && mkdir -p /home/nexus/.vutler /data \
  && chown -R nexus:nexus /app /home/nexus /data

USER nexus

VOLUME ["/home/nexus/.vutler", "/data"]

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/health || exit 1

CMD ["sh", "-lc", "exec node bin/cli.js start --port \"${NEXUS_PORT:-${PORT:-3100}}\" --type \"${NEXUS_TYPE:-docker}\""]
