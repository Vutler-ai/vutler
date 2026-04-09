# Docker Data Root Migration

## Goal

Move Docker storage off the small system disk and onto the data volume.

Current production shape:
- `/` lives on `/dev/sda1` and is limited
- `/mnt/data` lives on `/dev/sdb` and has the larger capacity

## Use When

Use this when:
- Docker images and layers are pressuring `/`
- clean-artifact deploys are healthy but root disk still has limited headroom
- you want a durable move away from `/var/lib/docker`

## Rule

This migration restarts Docker.

That means:
- `vutler-api`
- `vutler-frontend`
- `vutler-sandbox-worker`

will all be interrupted during the cutover.

Do not run it in the middle of an active incident unless disk pressure already blocks deploys or service recovery.

## Inputs

Default target:

```bash
/mnt/data/docker
```

Script:

```bash
./scripts/migrate-docker-data-root.sh
```

## Procedure

### 1. Confirm current production state

From your local repo:

```bash
./scripts/production-state-audit.sh --strict
```

On the VPS, confirm current Docker root:

```bash
docker info --format '{{ .DockerRootDir }}'
```

### 2. Dry-run the migration plan

On the VPS:

```bash
cd /home/ubuntu/vutler
./scripts/migrate-docker-data-root.sh
```

Expected output:
- current Docker root
- target root
- approximate current size
- free space on the target volume

### 3. Schedule a short maintenance window

This is a Docker daemon restart.

Plan for:
- API interruption
- frontend interruption
- sandbox worker interruption

### 4. Apply the migration

On the VPS:

```bash
cd /home/ubuntu/vutler
./scripts/migrate-docker-data-root.sh --apply
```

What the script does:
- stops `docker`, `docker.socket`, and `containerd` when present
- rsyncs the current Docker root into the target root
- updates `/etc/docker/daemon.json` with `data-root`
- restarts Docker
- verifies the active Docker root
- writes a migration note under `/mnt/data/`

### 5. Validate after cutover

On the VPS:

```bash
docker info --format '{{ .DockerRootDir }}'
docker ps
```

From your local repo:

```bash
./scripts/production-state-audit.sh --strict
```

If needed, also run:

```bash
./scripts/deploy-clean-artifact.sh --commit origin/main --frontend
```

### 6. Clean the old Docker root later

Do not remove the previous Docker root immediately unless disk pressure requires it and validation is already complete.

If the cutover is stable, rerun with cleanup:

```bash
cd /home/ubuntu/vutler
./scripts/migrate-docker-data-root.sh --apply --cleanup-old-root
```

## Rollback

The script writes a note like:

```bash
/mnt/data/docker-data-root-migration-<timestamp>.env
```

That note records:
- the previous Docker root
- the target Docker root
- the Docker daemon backup file

Rollback path:
1. stop Docker
2. restore the backed up `daemon.json`
3. start Docker again
4. verify `docker info --format '{{ .DockerRootDir }}'`

If Docker fails after the move, do not delete the old root until rollback is understood.

## Hard Rules

- Do not run this during a clean-artifact deploy.
- Do not delete the old Docker root before post-cutover validation.
- Do not hand-edit `daemon.json` during the same window unless the script fails and you are explicitly rolling back.
