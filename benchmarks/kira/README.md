# KIRA + Nexus terminal scaffold

This folder keeps the benchmark harness outside the Vutler runtime.

The intended split is:

- Nexus provides the persistent terminal backend through the new `terminal_*` endpoints.
- KIRA or another Harbor-based harness stays external and uses those endpoints to drive benchmark tasks.

## Included scaffold

- `nexus_terminal_client.py`
  - small Python client for the Nexus terminal endpoints
  - marker-based polling helper similar to the pattern used by KIRA
  - bootstrap helper to capture a lightweight environment snapshot
  - CLI mode for smoke-testing a node before integrating a full harness
- `nexus_terminus_kira.py`
  - thin adapter class that subclasses `TerminusKira`
  - keeps KIRA's tool-calling loop but swaps command execution to Nexus terminal sessions
  - closes the Nexus session automatically after each run
  - currently returns a clear error for `image_read`, because this adapter does not yet provide a file/image bridge

## Required environment

Set these variables before using the client:

```bash
export VUTLER_BASE_URL="https://app.vutler.ai"
export VUTLER_API_KEY="..."
export VUTLER_NEXUS_NODE_ID="..."
```

## Smoke test

```bash
python3 benchmarks/kira/nexus_terminal_client.py \
  --cwd /opt/acme-app \
  --command "pwd && ls -la"
```

The script opens a session, captures a small bootstrap snapshot, runs the command with marker-based polling, prints JSON, then closes the session.

## How to plug this into KIRA

At a high level:

1. Keep KIRA's native tool-calling loop and completion logic.
2. Replace the local `tmux` execution layer with `NexusTerminalClient`.
3. Open one Nexus session per benchmark task.
4. Reuse the same `sessionId` across all command turns.
5. Translate KIRA command steps into `run_command_with_marker(...)`.
6. Use `read_session(...)` or `snapshot_session(...)` when a task needs extra polling or cwd inspection.
7. Close the session at the end of the run.

## Example agent import path

If KIRA is installed in the Python environment and this repo root is on `PYTHONPATH`, you can point Harbor at the adapter directly:

```bash
PYTHONPATH="$(pwd):$PYTHONPATH" uv run harbor run \
  --dataset terminal-bench-sample@2.0 \
  --n-tasks 1 \
  --agent-import-path "benchmarks.kira.nexus_terminus_kira:NexusTerminusKira" \
  --model anthropic/claude-opus-4-6 \
  --env docker \
  -n 1
```

Recommended env vars for that run:

```bash
export VUTLER_BASE_URL="https://app.vutler.ai"
export VUTLER_API_KEY="..."
export VUTLER_NEXUS_NODE_ID="..."
export VUTLER_TASK_CWD="/opt/acme-app"
```

## Recommended next step

If we want to push this further, the next gap is `image_read`: either add a Nexus file/image retrieval bridge, or keep a local Harbor environment for multimodal tasks only.
