# Chat Runtime Retry Loop Incident Runbook

## Goal

Use this runbook when chat message processing enters a retry loop, especially after SQL/schema mismatches such as:

- `column "attachments" does not exist`
- repeated `processing_attempts` growth on the same message
- terminal failures that continue to be retried

This runbook is written for the current Vutler production environment on `app.vutler.ai` as verified on April 1, 2026.

## Symptoms

- An agent or Jarvis replies with a message like:
  - `Je n'ai pas pu traiter ce message apres 51 tentative(s)...`
  - or much higher counts such as `149`, `158`, or more
- `tenant_vutler.chat_messages.processing_attempts` keeps increasing for the same message
- logs show repeated SQL or provider failures for the same chat message

## Current Production Targets

- VPS: `83.228.222.180`
- SSH user: `ubuntu`
- SSH key: `~/.ssh/vps-ssh-key.pem`
- API container: `vutler-api`
- DB host currently reached through the API container `DATABASE_URL`

Base SSH command:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180
```

## 1. Detection

Check API health:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' vutler-api && \
   curl -fsS http://127.0.0.1:3001/api/v1/health"
```

Check recent API logs for repeated chat failures:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker logs --since 15m vutler-api 2>&1 | \
   grep -Ei 'attachments|processing_attempts|Je n.ai pas pu traiter|chatruntime|column .* does not exist' || true"
```

Check message state in PostgreSQL:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "DATABASE_URL=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1); \
   psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"SELECT \
     COUNT(*) FILTER (WHERE processing_state = 'failed') AS failed_count, \
     COUNT(*) FILTER (WHERE processing_attempts >= 5) AS attempts_ge_5, \
     MAX(processing_attempts) AS max_attempts \
   FROM tenant_vutler.chat_messages \
   WHERE created_at > NOW() - INTERVAL '7 days';\""
```

List the worst recent messages:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "DATABASE_URL=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1); \
   psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"SELECT \
     id, sender_name, processing_state, processing_attempts, last_error, created_at \
   FROM tenant_vutler.chat_messages \
   WHERE created_at > NOW() - INTERVAL '7 days' \
     AND (processing_state = 'failed' OR processing_attempts >= 5) \
   ORDER BY created_at DESC \
   LIMIT 20;\""
```

## 2. Containment

Goal: stop the loop before further saturation.

Preferred containment:

1. Fix the direct cause if it is a schema mismatch.
2. Ensure terminal failures are no longer retryable.
3. Restart `vutler-api` after the hotfix if runtime code was updated.

If immediate containment is needed before a code patch is ready, force old failed rows out of retry state:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "DATABASE_URL=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1); \
   psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"UPDATE tenant_vutler.chat_messages \
   SET processing_state = 'processed', \
       processed_at = NOW(), \
       next_retry_at = NULL \
   WHERE processing_state = 'failed' \
     AND processing_attempts >= 5;\""
```

Use this only as an emergency stopgap. It prevents further retries but does not fix the root cause.

## 3. Schema Remediation

If logs show `column "attachments" does not exist`, verify the column first:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "DATABASE_URL=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1); \
   psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"SELECT table_schema, table_name, column_name \
   FROM information_schema.columns \
   WHERE table_schema = 'tenant_vutler' \
     AND table_name = 'chat_messages' \
     AND column_name IN ('client_message_id', 'attachments') \
   ORDER BY column_name;\""
```

Apply the migration if missing:

```bash
cd /Users/alopez/Devs/Vutler
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres" \
  < scripts/migrations/20260401_chat_messages_attachments.sql
```

Confirm the table shape:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker exec supabase-db psql -U postgres -d postgres -c '\\d tenant_vutler.chat_messages'"
```

## 4. Runtime Hotfix

If retries continue past the terminal threshold, patch `app/custom/services/chatRuntime.js` so terminal failures stop being retryable.

Required behavior:

- non-terminal failures:
  - `processing_state = 'failed'`
  - `processed_at = NULL`
  - `next_retry_at = backoff timestamp`
- terminal failures:
  - `processing_state = 'processed'`
  - `processed_at = NOW()`
  - `next_retry_at = NULL`

The key SQL should look like:

```sql
SET processing_state = CASE WHEN $5 THEN 'processed' ELSE 'failed' END,
    processed_at = CASE WHEN $5 THEN NOW() ELSE NULL END
```

Hotfix flow already validated in production:

```bash
scp -i ~/.ssh/vps-ssh-key.pem \
  /local/path/to/chatRuntime.js \
  ubuntu@83.228.222.180:/home/ubuntu/vutler/app/custom/services/chatRuntime.js

ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 '
  set -e
  node --check /home/ubuntu/vutler/app/custom/services/chatRuntime.js
  cat /home/ubuntu/vutler/app/custom/services/chatRuntime.js | \
    docker exec -i vutler-api sh -lc "cat > /app/app/custom/services/chatRuntime.js"
  docker exec vutler-api node --check /app/app/custom/services/chatRuntime.js
  docker restart vutler-api >/dev/null
  until curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null; do sleep 2; done
  docker inspect -f "{{.State.Health.Status}}" vutler-api
'
```

## 5. Recovery

After migration and runtime patch:

1. confirm API health
2. confirm no new schema errors in logs
3. confirm no `failed` rows remain for the incident window
4. confirm high-attempt historical rows are now `processed`

Health:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' vutler-api && \
   curl -fsS http://127.0.0.1:3001/api/v1/health"
```

Logs:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker logs --since 15m vutler-api 2>&1 | \
   grep -Ei 'column .* does not exist|attachments|Je n.ai pas pu traiter' || true"
```

DB state:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "DATABASE_URL=\$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1); \
   psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -c \"SELECT \
     COUNT(*) FILTER (WHERE processing_state = 'failed') AS failed_count, \
     COUNT(*) FILTER (WHERE processing_attempts >= 5) AS attempts_ge_5, \
     MAX(processing_attempts) AS max_attempts \
   FROM tenant_vutler.chat_messages \
   WHERE created_at > NOW() - INTERVAL '7 days';\""
```

Expected result after a good recovery:

- `failed_count = 0`
- no new `column "attachments" does not exist` in recent logs
- old high-attempt rows may still exist historically, but they should be `processed`, not `failed`

## 6. Replay Policy

Do not replay blindly.

Replay only if:

- the root cause is fixed
- the row is still actionable
- replay will not duplicate side effects

For this specific incident, historical rows that already reached `processed` after terminal failure should usually be left as-is unless the user explicitly asks for the message to be retried.

## 7. Notes From the April 1, 2026 Incident

Verified production outcome:

- DB migration applied for `attachments` and `client_message_id`
- runtime hotfix deployed to `vutler-api`
- API returned to `healthy`
- no remaining `failed` chat messages in the 7-day inspection window
- historical high-attempt rows remained visible for audit, but in `processed` state

## 8. Follow-up Work

- Add an explicit DLQ state for chat processing instead of overloading `processed`
- Add a metric or alert on `processing_attempts >= 5`
- Log the exact chat message ID and root cause on every terminal failure
- Add a targeted smoke test that exercises a terminal chat failure path in production-like staging
