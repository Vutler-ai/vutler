# Agent Email Delivery Regression Runbook

## Goal

Use this runbook when an agent appears to have a provisioned email identity but cannot actually send mail from chat, or when Vutler reports a successful send while the message never reaches the recipient.

This runbook covers the outbound delivery path verified in production on April 6, 2026.

## Typical Symptoms

- Nora can send, but Jarvis or another agent with an email identity appears unable to send.
- A direct chat order such as `send this email to ...` produces a timeout, a draft, or a refusal instead of a real send.
- The chat runtime reports success, but the recipient never receives the email.
- API logs show one of these patterns:
  - `connect ECONNREFUSED 127.0.0.1:8082`
  - `Failed to send via Postal`
  - `Postal request timed out`
- Postal logs show one of these patterns:
  - `Please authenticate first`
  - `recipient is on the suppression list, holding`
  - `There is an issue connecting with your hostname: postal-mariadb`

## Expected Runtime Contract

These invariants should stay true in production:

1. `direct send intent + explicit recipient + effective email capability => send_email immediately as the requested agent identity`
2. A direct send from a DM must not require `contacts` lookup when the address is already present.
3. A direct send from a DM must not be delegated to another agent when the requested agent can execute `send_email`.
4. `vutler-api` must reach Postal through the internal service alias, not `localhost`.
5. Postal must be attached to both:
   - `postal2_postal-net` for MariaDB and RabbitMQ
   - `vutler_vutler-network` for `vutler-api -> postal-web`
6. Postal relay auth must be active for the Brevo relay.

## Current Production Expectations

Inside `vutler-api`, these env vars must resolve to the internal Postal web service:

```bash
POSTAL_API_URL=http://postal-web:5000
POSTAL_INTERNAL_API_URL=http://postal-web:5000
POSTAL_HOST=mail.vutler.ai
```

These values are now normalized automatically by:

- [deploy-api.sh](/Users/alopez/Devs/Vutler/scripts/deploy-api.sh)
- [deploy-clean-artifact.sh](/Users/alopez/Devs/Vutler/scripts/deploy-clean-artifact.sh)
- [rollback-clean-artifact.sh](/Users/alopez/Devs/Vutler/scripts/rollback-clean-artifact.sh)

The production state audit also warns if `POSTAL_API_URL` regresses to `localhost:8082`:

- [production-state-audit.sh](/Users/alopez/Devs/Vutler/scripts/production-state-audit.sh)

## Root Causes Verified On April 6, 2026

The incident was caused by a combination of failures:

1. `vutler-api` still had `POSTAL_API_URL=http://localhost:8082`, which points back to the API container instead of Postal.
2. Postal relay auth needed the SMTP auth overlay, otherwise Brevo replied with `Please authenticate first`.
3. The first hotfix run of the Postal overlay was started under the wrong Compose project, so `postal-web` and `postal-worker` landed on the wrong network and could not resolve `postal-mariadb`.
4. The recipient address could also be stuck in Postal suppressions, which masks later fixes.

## Detection

### 1. Check production health and audit state

```bash
cd /Users/alopez/Devs/Vutler
./scripts/production-state-audit.sh --strict
```

Expected:

- `warnings=0`
- `failures=0`
- no warning about `POSTAL_API_URL`

### 2. Inspect Postal env in `vutler-api`

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | \
   egrep '^(POSTAL_API_URL|POSTAL_INTERNAL_API_URL|POSTAL_HOST)=' || true"
```

Expected:

```text
POSTAL_API_URL=http://postal-web:5000
POSTAL_INTERNAL_API_URL=http://postal-web:5000
POSTAL_HOST=mail.vutler.ai
```

### 3. Probe Postal HTTP API from inside `vutler-api`

This verifies the API path before the chat runtime is involved.

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  'docker exec vutler-api sh -lc '\''curl -sS -m 15 -o /tmp/postal.out -w "%{http_code}\n" \
    -H "Host: mail.vutler.ai" \
    -H "X-Server-API-Key: $POSTAL_API_KEY" \
    -H "Content-Type: application/json" \
    --data-binary @- http://postal-web:5000/api/v1/send/message <<\"JSON\"
{"to":["alopez.nevicom@gmail.com"],"from":"jarvis@starbox-group.com","subject":"Postal probe","plain_body":"probe"}
JSON
echo BODY_START
cat /tmp/postal.out
echo BODY_END'\'''
```

Expected:

- HTTP status `200`
- body contains `"status":"success"`
- body contains a Postal `message_id`

If this fails, stop and fix Postal before debugging chat orchestration.

### 4. Check Postal worker logs

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "docker logs --since 10m \$(docker ps --format '{{.Names}} {{.Image}}' | awk '/postal-authfix:latest/ && /worker/ {print \$1; exit}') 2>&1 | tail -n 120"
```

Expected successful path:

- `Connected to ... smtp-relay.brevo.com`
- `Sending message ...`
- `Accepted by ... smtp-relay.brevo.com`

### 5. Check the Postal message and delivery rows

The MariaDB root password is read from the running container env to avoid hardcoding secrets in the command.

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  'docker exec postal-mariadb sh -lc '\''mysql -uroot -p"$MARIADB_ROOT_PASSWORD" -N -e "
USE postal-server-1;
SELECT id,status,subject,timestamp
FROM messages
ORDER BY id DESC
LIMIT 5;
SELECT id,status,details
FROM deliveries
ORDER BY id DESC
LIMIT 5;
"'\'''
```

Expected for a good send:

- `messages.status = Sent`
- `deliveries.status = Sent`
- delivery detail mentions acceptance by `smtp-relay.brevo.com`

### 6. Check for suppression

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  'docker exec postal-mariadb sh -lc '\''mysql -uroot -p"$MARIADB_ROOT_PASSWORD" -N -e "
USE postal-server-1;
SELECT address,reason,keep_until
FROM suppressions
WHERE address = \"alopez.nevicom@gmail.com\";
"'\'''
```

If a row exists, Postal will hold the message even after the rest of the pipeline is fixed.

## Chat-Side Validation

### 1. Send a direct message to the agent

Use a DM channel where the requested agent is explicit, then send a message like:

```text
Envoie maintenant cet email de test à alopez.nevicom@gmail.com.
Objet: Jarvis validation.
Corps: Bonjour, ceci est un test depuis Jarvis.
```

### 2. Check the action run for that chat message

```bash
curl -H "Authorization: Bearer <api-key>" \
  "https://app.vutler.ai/api/v1/chat/action-runs?message_id=<chat_message_id>&limit=5"
```

Expected:

- `action_key = send_email`
- `adapter = nexus`
- `status = success`
- `requested_agent_id = display_agent_id = executed_by = <requested agent>`

This is the key proof that the message was not silently delegated to another agent.

### 3. Check the chat reply

Expected reply shape:

```text
C’est envoyé.
```

And the reply metadata should identify the requested agent, not another executor.

## Recovery

### Recovery A: `POSTAL_API_URL` regressed to localhost

Symptom:

- `connect ECONNREFUSED 127.0.0.1:8082`

Fix:

1. redeploy from `origin/main` with the current deploy scripts
2. confirm `POSTAL_API_URL` and `POSTAL_INTERNAL_API_URL` both point to `http://postal-web:5000`

Canonical path:

```bash
cd /Users/alopez/Devs/Vutler
git push origin main
./scripts/deploy-clean-artifact.sh --commit origin/main
./scripts/production-state-audit.sh --strict
```

### Recovery B: Postal authfix is missing or on the wrong network

Symptoms:

- Postal web returns `500`
- worker cannot resolve `postal-mariadb`
- worker shows relay auth failures

Fix:

Use the versioned overlay in:

- [ops/postal-authfix/README.md](/Users/alopez/Devs/Vutler/ops/postal-authfix/README.md)

Canonical flow:

```bash
cd /home/ubuntu/postal
docker build -t postal-authfix:latest /home/ubuntu/postal/authfix
docker compose -p postal2 -f docker-compose.yml -f /home/ubuntu/postal/authfix/docker-compose.override.yml up -d postal-web postal-worker postal-smtp
```

Then verify:

- `postal-web` resolves `postal-mariadb`
- `vutler-api` resolves `postal-web`
- Postal probe returns `status=success`

### Recovery C: recipient is suppressed

Symptom:

- worker logs show `recipient is on the suppression list, holding`

Fix:

Inspect the suppression row first, then remove it only if the soft-fail root cause is already fixed.

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  'docker exec postal-mariadb sh -lc '\''mysql -uroot -p"$MARIADB_ROOT_PASSWORD" -e "
USE postal-server-1;
DELETE FROM suppressions
WHERE address = \"alopez.nevicom@gmail.com\";
"'\'''
```

Re-test immediately after removing suppression.

## Regression Checklist

Run this list after any email, chat runtime, Nexus tool, or Postal deployment change:

1. `npx jest --runInBand tests/skills/email-adapter.test.js tests/nexus-tools.test.js tests/llm-router.nexus-tool.test.js tests/nexus.permissions-contract.test.js`
2. `./scripts/deploy-clean-artifact.sh --commit origin/main`
3. `./scripts/production-state-audit.sh --strict`
4. Postal direct API probe from inside `vutler-api`
5. one live direct-send chat test from Jarvis
6. verify Postal worker log contains `Accepted by ... smtp-relay.brevo.com`

## Known Good Outcome

The verified good state on April 6, 2026 was:

- `vutler-api` env pointed to `http://postal-web:5000`
- Postal worker accepted the message via `smtp-relay.brevo.com:587`
- Jarvis direct-send chat run completed with `send_email`
- `requested_agent_id`, `display_agent_id`, and `executed_by` all matched Jarvis
- the message row in Postal was `Sent`

If all of those conditions hold, the Vutler outbound path is healthy again.
