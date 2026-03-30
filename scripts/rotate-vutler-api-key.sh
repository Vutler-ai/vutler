#!/usr/bin/env bash
set -euo pipefail

SCHEMA="tenant_vutler"
DEFAULT_WORKSPACE_ID="00000000-0000-0000-0000-000000000001"
CONTAINER_NAME="${VUTLER_API_CONTAINER:-vutler-api}"
ENV_FILE="${VUTLER_API_ENV_FILE:-/home/ubuntu/vutler/.env}"
WORKSPACE_ID="${VUTLER_WORKSPACE_ID:-$DEFAULT_WORKSPACE_ID}"
KEY_NAME="${VUTLER_API_KEY_NAME:-vutler-api-runtime}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

read_env_value() {
  local file_content=$1
  local key=$2
  printf '%s\n' "$file_content" | sed -n "s/^${key}=//p" | head -1
}

require_cmd docker
require_cmd psql
require_cmd openssl
require_cmd sha256sum

API_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
DATABASE_URL="${DATABASE_URL:-$(read_env_value "$API_ENV" "DATABASE_URL")}"
CURRENT_KEY="${CURRENT_KEY:-$(read_env_value "$API_ENV" "VUTLER_API_KEY")}"

if [ -z "$DATABASE_URL" ] && [ -f "$ENV_FILE" ]; then
  FILE_ENV="$(cat "$ENV_FILE")"
  DATABASE_URL="$(read_env_value "$FILE_ENV" "DATABASE_URL")"
  if [ -z "$CURRENT_KEY" ]; then
    CURRENT_KEY="$(read_env_value "$FILE_ENV" "VUTLER_API_KEY")"
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is missing. Export it or ensure it exists in $CONTAINER_NAME or $ENV_FILE."
  exit 1
fi

NEW_KEY="vutler_$(openssl rand -hex 24)"
NEW_HASH="$(printf '%s' "$NEW_KEY" | sha256sum | awk '{print $1}')"
NEW_PREFIX="$(printf '%s' "$NEW_KEY" | cut -c1-14)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v workspace_id="$WORKSPACE_ID" \
  -v key_name="$KEY_NAME" \
  -v key_prefix="$NEW_PREFIX" \
  -v key_hash="$NEW_HASH" <<'SQL'
INSERT INTO tenant_vutler.workspace_api_keys (
  workspace_id,
  created_by_user_id,
  name,
  key_prefix,
  key_hash
) VALUES (
  :'workspace_id',
  NULL,
  :'key_name',
  :'key_prefix',
  :'key_hash'
);
SQL

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  grep -v '^VUTLER_API_KEY=' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  printf 'VUTLER_API_KEY=%s\n' "$NEW_KEY" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi

echo "New VUTLER_API_KEY created and written to $ENV_FILE"
echo "workspace_id: $WORKSPACE_ID"
echo "name: $KEY_NAME"
echo "key_prefix: $NEW_PREFIX"
echo "secret: $NEW_KEY"

if [ -n "$CURRENT_KEY" ]; then
  OLD_HASH="$(printf '%s' "$CURRENT_KEY" | sha256sum | awk '{print $1}')"
  echo
  echo "Current key was detected. Revoke it only after deploy + smoke pass:"
  echo "psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"UPDATE ${SCHEMA}.workspace_api_keys SET revoked_at = NOW(), updated_at = NOW() WHERE workspace_id = '${WORKSPACE_ID}' AND key_hash = '${OLD_HASH}' AND revoked_at IS NULL;\""
fi

echo
echo "Recommended next steps:"
echo "1. ./scripts/deploy-api.sh"
echo "2. ./scripts/smoke-test.sh"
echo "3. Revoke the previous key only after the smoke test passes."
