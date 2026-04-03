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

## Recommended next step

If we want a full Harbor/KIRA adapter in-repo, the next file to add is a thin Python class that wraps KIRA's command execution hooks and delegates them to `NexusTerminalClient`.
