#!/usr/bin/env bash
set -euo pipefail

SWARM_ID="${SNIPARA_CANONICAL_SWARM_ID:-cmmfe0cq90008o1cohufkls68}"
CREATE_HELPER="/Users/lopez/.openclaw/workspace/scripts/snipara-create-task-if-needed.sh"
SNIPARA="/Users/lopez/.openclaw/workspace/scripts/snipara"

python3 - <<'PY' "$SNIPARA" "$CREATE_HELPER" "$SWARM_ID"
import json, subprocess, sys

snipara, helper, swarm = sys.argv[1:4]
ACTIVE = {'open','pending','in_progress','in_review','blocked'}
DEFERRED_PATTERNS = [
    'livekit',
    'cli anything',
    'post prod initiative',
    'post-prod initiative',
]

def is_deferred(title: str) -> bool:
    low = (title or '').lower()
    return any(p in low for p in DEFERRED_PATTERNS)

# Fetch all pages to avoid false negatives on canonical IDs.
def fetch_all_tasks():
    tasks = []
    cursor = None
    for _ in range(20):
        cmd = [snipara, '--project', 'vutler', 'rlm_task_list', f'swarm_id={swarm}', 'limit=100']
        if cursor:
            cmd.append(f'cursor={cursor}')
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip() or 'rlm_task_list failed')
        data = json.loads(r.stdout)
        tasks.extend(data.get('tasks', []))
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
        if not cursor:
            break
    return tasks

tasks = fetch_all_tasks()
active_tasks = [t for t in tasks if (t.get('status') or '').lower() in ACTIVE]
flow_tasks = [t for t in active_tasks if not is_deferred(t.get('title') or '')]

issues = []

def add_issue(title, desc):
    issues.append((title, desc))

# Invariant #1: owner drift on active tasks (excluding deferred roadmap items)
for t in flow_tasks:
    tid = t.get('id', '?')
    owner = (t.get('owner') or '').strip()
    title = (t.get('title') or '').strip()
    status = (t.get('status') or '').strip().lower()

    if owner and not owner.endswith('-local'):
        add_issue(
            f"[PIPELINE][OWNER-DRIFT] {tid}",
            f"Task {tid} ('{title}') active with owner '{owner}' (status={status}). Reassign to strict -local policy."
        )

    low = title.lower()
    if '--help' in low or 'tmp smoke' in low:
        add_issue(
            f"[PIPELINE][NOISE] {tid}",
            f"Task {tid} ('{title}') is helper/smoke noise but active. Close/cancel with cleanup note."
        )

# Invariant #2: canonical tasks must exist and be active
canonical = {
    'cmmyug74i013ai4rk4xl3cpvk': 'N0 orchestrator integration gate',
    'cmmyugc4c004aym7nf7lz9ba4': 'N1 backend lock/ttl wiring',
    'cmmyughtb007c1x7qz0lwhx0y': 'N1 UI/UX metrics dashboard',
}
index = {t.get('id'): t for t in tasks}
for cid, label in canonical.items():
    t = index.get(cid)
    if not t:
        add_issue(
            f"[PIPELINE][MISSING] {cid}",
            f"Canonical task '{label}' ({cid}) not found in swarm listing. Recreate/relink immediately."
        )
        continue
    status = (t.get('status') or '').lower()
    if status not in {'pending','in_progress','in_review'}:
        add_issue(
            f"[PIPELINE][STATE] {cid}",
            f"Canonical task '{label}' ({cid}) status is '{status}'. Move back to active state if still in scope."
        )

# Deduplicate issue creation: don't recreate if same issue title already active.
active_titles = {(t.get('title') or '').strip() for t in active_tasks}
created = 0
for title, desc in issues:
    if title in active_titles:
        continue
    subprocess.run([helper, title, desc, 'luna-local'], check=False, capture_output=True, text=True)
    created += 1

print(json.dumps({
    'active_count': len(active_tasks),
    'flow_count': len(flow_tasks),
    'issues_detected': len(issues),
    'tasks_created': created,
}, ensure_ascii=False))
PY
