# Vutler Infrastructure — Reference Doc
_Last updated: 2026-03-01_

## VPS
- **IP**: 83.228.222.180
- **SSH**: `ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180`
- **OS**: Ubuntu 22.04
- **Disk**: 19GB total (~79% used)
- **RAM**: 12GB

## Services

### Frontend (Next.js Standalone)
- **Port**: 3002
- **Service**: `sudo systemctl restart vutler-frontend`
- **Source**: `/home/ubuntu/vutler/frontend/`
- **Standalone**: `/home/ubuntu/vutler/frontend/.next/standalone/`
- **Static symlink**: `/home/ubuntu/vutler-frontend/_next` → `.next/standalone/.next`
- **CRITICAL**: After `npm run build`, ALWAYS run: `cp -r .next/static .next/standalone/.next/`
- **Nginx**: All app routes proxy to port 3002 (NO static HTML files)

### API (Docker)
- **Port**: 3001
- **Container**: `vutler-api`
- **Source**: `/home/ubuntu/vutler/app/custom/`
- **Health**: `curl http://localhost:3001/api/v1/health`

### Rocket.Chat (Docker)
- **Port**: 3000 (internal only, NOT exposed externally)
- **Containers**: 2 RC instances (main.js)
- **Used for**: RC REST API catch-all at `/api/v1/`

### Redis (Docker)
- **Container**: `vutler-redis`
- **Status**: Healthy

### Postal (Email — Docker)
- **Containers**: postal-web (:8082), postal-smtp, postal-worker, postal-mariadb, postal-rabbitmq
- **Domain**: mail.vutler.ai

### RLM Runtime
- **Service**: `rlm-mcp` (systemd)
- **Venv**: `/home/ubuntu/rlm-venv/`

## Nginx Config
- **File**: `/etc/nginx/sites-enabled/vutler`
- **4 server blocks** (causes "conflicting server name" warnings — cosmetic, not breaking)
- **Duplicate configs**: `vutler-root` and `vutler.backup.20260228-110136` should be cleaned up

### Routing (app.vutler.ai)
- `/_next/` → symlink to standalone static (immutable cache)
- `/login`, `/dashboard`, `/agents`, `/chat`, etc. → **proxy_pass to port 3002** (Next.js)
- `/api/v1/agents`, `/api/v1/chat`, etc. → proxy to port 3001 (vutler-api)
- `/api/v1/` (catch-all) → proxy to port 3000 (Rocket.Chat)
- `/ws/chat`, `/ws/agent-tunnel` → WebSocket proxy to port 3001

### Routing (vutler.ai / www.vutler.ai)
- Landing page: `/home/ubuntu/vutler-landing/`
- `/login` → proxy to port 3002
- `/_next/` → static from vutler-frontend (should also be symlinked)

## Database (Vaultbrix)
- **Host**: REDACTED_DB_HOST (Infomaniak VPS)
- **Schema**: `tenant_vutler`
- **Access**: via vutler-api container PG connection
- **SSH**: `ssh -i ~/.ssh/id_rsa_infomaniak ubuntu@REDACTED_DB_HOST` (key missing on Mac)

## Git
- **Repo**: `/home/ubuntu/vutler/`
- **Branches**: `master` (prod), `dev`
- **Latest**: `d1e5b1a2` on master

## SSL
- **app.vutler.ai**: Let's Encrypt, valid until May 18, 2026
- **vutler.ai**: Separate cert

## Known Issues
- Nginx has duplicate server blocks → "conflicting server name" warnings
- `vutler.backup.20260228-110136` in sites-enabled should be removed
- Port 3000 (RC) not checked in health script (false alarm if checked externally)
