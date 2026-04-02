# Production Rollback From Rollback Note

## Goal

Roll back production to the images that were running before the last clean-artifact deploy.

This runbook assumes deployment happened through:
- [production-deploy-clean-artifact.md](/Users/alopez/Devs/Vutler/docs/runbooks/production-deploy-clean-artifact.md)
- [scripts/deploy-clean-artifact.sh](/Users/alopez/Devs/Vutler/scripts/deploy-clean-artifact.sh)

That flow writes a rollback note on the VPS:

```bash
/tmp/vutler-deploy-<commit>/rollback.env
```

## What the rollback note contains

Each `rollback.env` stores:
- the deployed commit
- the deploy directory
- the previous API image ID
- the previous frontend image ID

That means rollback does not depend on `/home/ubuntu/vutler` and does not require rebuilding anything.

## Fast Path

From your local machine:

```bash
./scripts/rollback-clean-artifact.sh
```

Default behavior:
- finds the newest `/tmp/vutler-deploy-*/rollback.env` on the VPS
- restarts `vutler-api` on the previous image
- restarts `vutler-frontend` on the previous image when available
- runs the smoke test from the recorded deploy directory
- refreshes `/home/ubuntu/vutler-deploy/current-release.env` after a successful rollback

Useful flags:
- `--rollback-note <path>` to target a specific rollback note
- `--api-only` to roll back only the API
- `--skip-smoke` to defer smoke intentionally

## Recommended Sequence

1. Confirm you are rolling back the right release.

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "ls -1dt /tmp/vutler-deploy-*/rollback.env | head -3"
```

2. Run the rollback.

```bash
./scripts/rollback-clean-artifact.sh
```

3. Verify health.

Expected:
- `vutler-api` healthy
- `vutler-frontend` healthy
- smoke test passes

Recommended follow-up:

```bash
./scripts/production-state-audit.sh --strict
```

## Hard Rules

- Do not rebuild from `/home/ubuntu/vutler` during rollback.
- Do not use `git checkout` or `git pull` on the VPS as a rollback mechanism.
- Do not edit the running container filesystem in place.
- If the previous image is missing from the VPS, stop and investigate instead of improvising a manual rollback.

## Output

The rollback script writes a rollback record on the VPS:

```bash
/tmp/vutler-rollback-<timestamp>.env
```

This record captures:
- the rollback time
- the source rollback note used
- the image IDs rolled back from
- the image IDs rolled back to

## Failure Cases

If rollback fails:
- inspect `docker ps`
- inspect `docker logs vutler-api --tail 300`
- inspect `docker logs vutler-frontend --tail 300`
- confirm the image IDs in `rollback.env` still exist locally:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180 \
  "cat /tmp/vutler-deploy-<commit>/rollback.env && docker images --no-trunc | head -20"
```

If the previous image was pruned, rollback is no longer a simple image switch. At that point, redeploy the desired Git commit through the clean-artifact deploy flow instead.
