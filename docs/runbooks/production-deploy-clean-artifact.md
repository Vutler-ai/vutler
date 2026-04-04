# Production Deploy From Clean Artifact

## Goal

Deploy production from an exact pushed commit without rebuilding from a dirty VPS checkout.

This is the preferred production path when:
- the VPS repo has local changes
- the runtime was manually patched on the host
- the deploy must match a specific pushed commit exactly

## Use When

Use this runbook when:
- deploying API or frontend from `origin/main`
- replacing a drifted VPS checkout with a clean artifact
- validating whether live code can be safely replaced by the target commit

## Rule

Do not treat the VPS checkout as the source of truth for production builds.

Source of truth:
- local Git repo
- pushed commit on `origin/main`

Production build source:
- a tar archive exported from the exact commit to deploy

## Why

The VPS checkout at `/home/ubuntu/vutler` can drift from Git:
- modified tracked files
- untracked files
- local hotfixes
- stale scripts

The running container can also drift from `origin/main`:
- tracked files present in Git but missing from the live container
- tracked files that differ between the live container and the target commit

This does not automatically block deployment. It means production is not an exact match of the commit you want to ship, so you must decide whether the drift is:
- expected lag that will be replaced by the next clean deploy
- a live-only hotfix that must be preserved first

## Fast Path

Run the full flow from your local machine:

```bash
./scripts/deploy-clean-artifact.sh --commit origin/main
```

Useful flags:
- `--frontend` to rebuild and restart `vutler-frontend`
- `--audit-only` to run the live-container parity audit without deploying
- `--skip-smoke` to defer the smoke test intentionally
- `--keep-tmp` to keep local audit artifacts for inspection

Rollback references:
- [production-rollback-clean-artifact.md](/Users/alopez/Devs/Vutler/docs/runbooks/production-rollback-clean-artifact.md)
- [rollback-clean-artifact.sh](/Users/alopez/Devs/Vutler/scripts/rollback-clean-artifact.sh)

The script:
- compares the target commit to the live `vutler-api` container
- exports the exact commit as a tarball
- copies it to the VPS
- rebuilds `vutler-api`
- optionally rebuilds `vutler-frontend`
- runs `./scripts/smoke-test.sh` unless told not to
- updates `/home/ubuntu/vutler-deploy/current-release.env` after a successful promotion

## Procedure

### 1. Push the exact commit first

Local:

```bash
git push origin main
git rev-parse --short HEAD
```

If you work through feature branches:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only <your-branch>
git push origin main
git rev-parse --short HEAD
```

Deploy only a pushed commit already present on `origin/main`.

### 2. Run parity audit when drift is plausible

Use this when:
- the VPS was manually patched before
- recent merges were messy
- you suspect production contains code not present on `main`

Compare the target commit to the live API container, not to `/home/ubuntu/vutler`.

Local:

```bash
git fetch origin
COMMIT=$(git rev-parse origin/main)
git archive "$COMMIT" | tar -xf - -C /tmp/vutler-main
```

VPS:

```bash
docker cp vutler-api:/app/. /tmp/vutler-api-live
```

Interpretation:
- a few missing or different files usually means production is behind `main`
- if the differing files are exactly the files you are about to deploy, continue
- if the differing files look like emergency prod hotfixes not present in Git, stop and capture them first

### 3. Apply the decision rule for drift

If parity audit shows drift:
- if the live drift is understood and disposable, deploy the clean artifact from `origin/main`
- if the live drift contains unknown business logic, export those files, review them locally, and either commit them or intentionally discard them

Do not try to "merge from the VPS checkout".

### 4. Export a clean tarball locally

```bash
git archive --format=tar <commit> -o /tmp/vutler-deploy-<commit>.tar
```

### 5. Copy the artifact to the VPS

```bash
scp -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no \
  /tmp/vutler-deploy-<commit>.tar \
  ubuntu@83.228.222.180:/tmp/vutler-deploy-<commit>.tar
```

### 6. Extract to a temporary release directory on the VPS

```bash
COMMIT=<commit>
DEPLOY_DIR=/tmp/vutler-deploy-$COMMIT
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
tar -xf /tmp/vutler-deploy-$COMMIT.tar -C "$DEPLOY_DIR"
```

### 7. Build and run the API from the extracted release

```bash
cd "$DEPLOY_DIR"
ENV_FILE=/tmp/vutler-api-runtime.env
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api > "$ENV_FILE"
docker build -t "vutler-api:$COMMIT" -t vutler-api:latest .
docker rm -f vutler-api || true
docker run -d \
  --name vutler-api \
  --restart unless-stopped \
  --network vutler_vutler-network \
  -p 127.0.0.1:3001:3001 \
  --env-file "$ENV_FILE" \
  --health-cmd 'curl -f http://localhost:3001/api/v1/health || exit 1' \
  --health-interval 30s \
  --health-timeout 10s \
  --health-start-period 20s \
  --health-retries 3 \
  vutler-api:latest \
  node index.js
```

### 8. Build and run frontend only if needed

If the pushed commit changes frontend code:

```bash
cd "$DEPLOY_DIR/frontend"
docker build --no-cache -t vutler-frontend:latest .
docker stop vutler-frontend || true
docker rm vutler-frontend || true
docker run -d --name vutler-frontend --restart unless-stopped \
  --network host \
  -e API_URL=http://localhost:3001 \
  -e WS_URL=http://localhost:3001 \
  -e PORT=3002 \
  -e HOSTNAME=0.0.0.0 \
  vutler-frontend:latest
```

### 9. Run smoke tests from the same release

```bash
cd "$DEPLOY_DIR"
./scripts/smoke-test.sh
```

Recommended follow-up:

```bash
./scripts/production-state-audit.sh --strict
```

## Validation

Expected outcome:
- target commit is already pushed
- `vutler-api` becomes healthy
- `vutler-frontend` becomes healthy when rebuilt
- smoke test passes from the extracted release
- `current-release.env` is refreshed after success

## Hard Rules

- Never rebuild production straight from `/home/ubuntu/vutler` if `git status` is dirty.
- Never assume VPS `HEAD` matches `origin/main`.
- Never try to reconcile missing or different container files by editing the VPS checkout in place.
- Never debug production deploys against an unknown local patch state.
- Prefer exact artifact deploys over `git pull && docker build` on the server.

## Known Failure Modes

### Package drift between `package.json` and `package-lock.json`

Observed:
- runtime modules present in lockfile but missing in `package.json`
- API Docker image installed an incomplete dependency set

Fix applied:
- API Dockerfile copies `package-lock.json`
- API Dockerfile uses `npm ci --omit=dev`

### Optional module crash at boot

Observed:
- missing `web-push` caused `/api/push` mount to crash the whole API boot

Fix applied:
- push route mount is guarded at boot

### Refactor residue crash at boot

Observed:
- stale runtime mounts can survive if deploy hygiene is weak

Fix applied:
- clean-artifact deploy removes dependence on the dirty VPS checkout
