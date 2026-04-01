# Production Deploy From Clean Artifact

## Goal

Deploy Vutler production from an exact pushed commit, without rebuilding from the dirty VPS checkout.

This is now the recommended production path when:
- the VPS repo has local changes
- the runtime was manually patched on the host
- the deploy must match a specific pushed commit exactly

## Why

The VPS checkout at `/home/ubuntu/vutler` can drift from Git:
- modified tracked files
- untracked files
- local hotfixes
- stale scripts

If Docker builds from that tree directly, production may not match the pushed commit.

The running container can also drift from `origin/main`:
- tracked files present in Git but missing from the live container
- tracked files that differ between the live container and the target commit

This does not automatically block deployment. It means production is not an exact match of the commit you want to ship, so you must decide whether the drift is:
- expected lag that will be replaced by the next clean deploy
- a live-only hotfix that must be preserved first

## Rule

Do not treat the VPS checkout as the source of truth for production builds.

Source of truth:
- local Git repo
- pushed commit on `origin/main`

Production build source:
- a tar archive exported from the exact commit to deploy

## Standard Flow

### Automated path

You can run the full clean-artifact flow from your local machine:

```bash
./scripts/deploy-clean-artifact.sh --commit origin/main
```

Useful flags:
- `--frontend` to rebuild and restart `vutler-frontend` too
- `--audit-only` to run the live-container parity audit without deploying
- `--skip-smoke` if you must defer the smoke test intentionally
- `--keep-tmp` to keep the local audit artifacts for inspection

The script:
- compares the target commit to the live `vutler-api` container
- exports the exact commit as a tarball
- copies it to the VPS
- rebuilds `vutler-api`
- optionally rebuilds `vutler-frontend`
- runs `./scripts/smoke-test.sh` unless told not to

It still enforces the same rule: the target commit must already be contained in `origin/main`.

### 1. Push the exact commit first

Local:

```bash
git push origin main
git rev-parse --short HEAD
```

Record the commit you intend to deploy.

If you work through feature branches, the same rule applies:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only <your-branch>
git push origin main
git rev-parse --short HEAD
```

Deploy only a pushed commit already present on `origin/main`.

### 2. Optional parity audit before deploy

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

Then compare tracked files only.

Interpretation:
- a few missing/different files usually means production is simply behind `main`
- if the differing files are exactly the files you are about to deploy, continue with clean artifact deploy
- if the differing files look like emergency prod hotfixes not present in Git, stop and capture them first

### 3. Decision rule for missing/different tracked files

If parity audit shows drift, do not try to “merge from the VPS checkout”.

Use this rule:
- if the live container drift is understood and disposable, deploy the clean artifact from `origin/main`
- if the live container drift contains unknown business logic, export those files, review them locally, and either commit them or intentionally discard them

What the `13 missing` and `9 different` files mean in practice:
- they are evidence that the current live container is not built from the exact `origin/main` tree
- they are not something to reconcile on the VPS
- the next clean deploy from `origin/main` will replace the live container filesystem with the target commit contents

Only block deployment if one of the `different` files contains a prod-only fix you still need.

### 4. Export a clean tarball locally

Local:

```bash
git archive --format=tar <commit> -o /tmp/vutler-deploy-<commit>.tar
```

### 5. Copy the artifact to the VPS

Local:

```bash
scp -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no \
  /tmp/vutler-deploy-<commit>.tar \
  ubuntu@83.228.222.180:/tmp/vutler-deploy-<commit>.tar
```

### 6. Extract to a temporary release directory on the VPS

VPS:

```bash
COMMIT=<commit>
DEPLOY_DIR=/tmp/vutler-deploy-$COMMIT
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
tar -xf /tmp/vutler-deploy-$COMMIT.tar -C "$DEPLOY_DIR"
```

### 7. Build and run the API from the extracted release

VPS:

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

VPS:

```bash
cd "$DEPLOY_DIR"
./scripts/smoke-test.sh
```

Expected:
- `10/10 passed`

## Hard Rules

- Never rebuild production straight from `/home/ubuntu/vutler` if `git status` is dirty.
- Never assume VPS `HEAD` matches `origin/main`.
- Never try to reconcile missing/different container files by editing the VPS checkout in place.
- Never debug production deploys against an unknown local patch state.
- Prefer exact artifact deploys over `git pull && docker build` on the server.

## Known Failure Modes Discovered

### 1. Package drift between `package.json` and `package-lock.json`

Observed:
- runtime modules present in lockfile but missing in `package.json`
- API Docker image installed an incomplete dependency set

Fix applied:
- API Dockerfile now copies `package-lock.json`
- API Dockerfile now uses `npm ci --omit=dev`

### 2. Optional module crash at boot

Observed:
- `web-push` missing caused `/api/push` mount to crash the whole API boot

Fix applied:
- push route mount is now guarded at boot

### 3. Refactor residue crash at boot

Observed:
- `chatRuntime.js` still exported `getMemoryScope` after the helper had been removed

Fix applied:
- dead export removed

## Recommended Follow-up

- keep `/home/ubuntu/vutler` only for reference and scripts
- add a proper release directory convention under `/home/ubuntu/releases/vutler/<commit>/`
- install [`vps-retention.sh`](/Users/alopez/Devs/Vutler/scripts/vps-retention.sh) on the VPS and run it daily to prune stale deploy artifacts and historical Docker images
- optionally keep the last successful API image tag and last successful frontend image tag in a rollback note
- eventually move this process into a single deploy script that accepts a commit tarball
