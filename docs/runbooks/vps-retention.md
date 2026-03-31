# VPS Retention

## Goal

Keep the Vutler VPS build host below disk pressure by pruning stale deploy artifacts and unused local Docker images.

## Script

Use:

```bash
./scripts/vps-retention.sh
```

Default behavior:
- keep the active Docker images used by running containers
- keep the 2 most recent `vutler-api` image IDs
- keep the 2 most recent `vutler-frontend` image IDs
- keep the 2 most recent `/tmp/vutler-deploy-*` artifacts
- keep the latest frontend backup directory under `/home/ubuntu`

Overrides:

```bash
KEEP_API_IDS=3 KEEP_FRONTEND_IDS=2 KEEP_DEPLOY_DIRS=3 ./scripts/vps-retention.sh
```

## Recommended Cron

Run daily on the VPS:

```bash
17 3 * * * /home/ubuntu/bin/vutler-vps-retention.sh >> /home/ubuntu/logs/vps-retention.log 2>&1
```

## When To Run

- before large frontend or API rebuilds
- after repeated hotfix deploys
- when root disk usage approaches 80%
