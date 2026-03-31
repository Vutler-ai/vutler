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

## Rule

Do not treat the VPS checkout as the source of truth for production builds.

Source of truth:
- local Git repo
- pushed commit on `origin/main`

Production build source:
- a tar archive exported from the exact commit to deploy

## Standard Flow

### 1. Push the exact commit first

Local:

```bash
git push origin main
git rev-parse --short HEAD
```

Record the commit you intend to deploy.

### 2. Export a clean tarball locally

Local:

```bash
git archive --format=tar <commit> -o /tmp/vutler-deploy-<commit>.tar
```

### 3. Copy the artifact to the VPS

Local:

```bash
scp -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no \
  /tmp/vutler-deploy-<commit>.tar \
  ubuntu@83.228.222.180:/tmp/vutler-deploy-<commit>.tar
```

### 4. Extract to a temporary release directory on the VPS

VPS:

```bash
COMMIT=<commit>
DEPLOY_DIR=/tmp/vutler-deploy-$COMMIT
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
tar -xf /tmp/vutler-deploy-$COMMIT.tar -C "$DEPLOY_DIR"
```

### 5. Build and run the API from the extracted release

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

### 6. Build and run frontend only if needed

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

### 7. Run smoke tests from the same release

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
