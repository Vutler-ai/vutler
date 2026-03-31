#!/usr/bin/env bash
set -euo pipefail

KEEP_API_IDS=${KEEP_API_IDS:-2}
KEEP_FRONTEND_IDS=${KEEP_FRONTEND_IDS:-2}
KEEP_DEPLOY_DIRS=${KEEP_DEPLOY_DIRS:-2}
KEEP_FRONTEND_BACKUPS=${KEEP_FRONTEND_BACKUPS:-1}

declare -A KEEP_IMAGE_IDS=()
declare -A SEEN_IDS=()

mark_active_image_ids() {
  while IFS= read -r image_id; do
    [ -n "$image_id" ] && KEEP_IMAGE_IDS["$image_id"]=1
  done < <(docker ps -q | xargs -r docker inspect --format '{{.Image}}' | sort -u)
}

mark_recent_repo_ids() {
  local prefix="$1"
  local keep_count="$2"
  local kept=0

  while IFS='|' read -r repository tag image_id; do
    [ -n "$repository" ] || continue
    [[ "$repository" == "$prefix"* ]] || continue
    [ -n "${SEEN_IDS[$prefix:$image_id]:-}" ] && continue
    SEEN_IDS["$prefix:$image_id"]=1
    KEEP_IMAGE_IDS["$image_id"]=1
    kept=$((kept + 1))
    [ "$kept" -ge "$keep_count" ] && break
  done < <(docker images --format '{{.Repository}}|{{.Tag}}|{{.ID}}')
}

remove_old_repo_refs() {
  local prefix="$1"
  declare -A removal_ids=()

  while IFS='|' read -r repository tag image_id; do
    [ -n "$repository" ] || continue
    [[ "$repository" == "$prefix"* ]] || continue
    [ -n "${KEEP_IMAGE_IDS[$image_id]:-}" ] && continue
    removal_ids["$image_id"]=1
  done < <(docker images --format '{{.Repository}}|{{.Tag}}|{{.ID}}')

  for image_id in "${!removal_ids[@]}"; do
    docker rmi -f "$image_id" >/dev/null 2>&1 || true
  done
}

cleanup_deploy_artifacts() {
  local deploys=()
  local backups=()
  local i

  mapfile -t deploys < <(find /tmp -maxdepth 1 \( -name 'vutler-deploy-*' -o -name 'vutler-deploy-*.tar' -o -name 'vutler-deploy-*.sh' \) -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
  for ((i=KEEP_DEPLOY_DIRS; i<${#deploys[@]}; i++)); do
    rm -rf "${deploys[$i]}" 2>/dev/null || true
  done

  mapfile -t backups < <(find /home/ubuntu -maxdepth 1 \( -name 'vutler-frontend.backup.*' -o -name 'vutler-frontend-backup-*' -o -name 'vutler-frontend-backups' \) -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
  for ((i=KEEP_FRONTEND_BACKUPS; i<${#backups[@]}; i++)); do
    rm -rf "${backups[$i]}" 2>/dev/null || true
  done
}

echo "[retention] disk before"
df -h /

cleanup_deploy_artifacts

docker container prune -f >/dev/null || true

mark_active_image_ids
mark_recent_repo_ids "vutler-api" "$KEEP_API_IDS"
mark_recent_repo_ids "vutler-frontend" "$KEEP_FRONTEND_IDS"
mark_recent_repo_ids "vutler-app-api" 1
mark_recent_repo_ids "vutler-app-frontend" 1
mark_recent_repo_ids "vutler-api-test" 1

remove_old_repo_refs "vutler-api"
remove_old_repo_refs "vutler-frontend"
remove_old_repo_refs "vutler-app-api"
remove_old_repo_refs "vutler-app-frontend"
remove_old_repo_refs "vutler-api-test"

docker image prune -f >/dev/null || true
docker builder prune -af --filter 'until=240h' >/dev/null || true
docker volume prune -f >/dev/null || true

echo "[retention] disk after"
df -h /
