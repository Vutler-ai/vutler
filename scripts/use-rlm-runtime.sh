#!/usr/bin/env bash
set -euo pipefail
VENV="/Users/lopez/.openclaw/workspace/.venvs/rlm-runtime"
if [[ ! -x "$VENV/bin/rlm" ]]; then
  echo "rlm-runtime venv missing at $VENV" >&2
  exit 1
fi
source "$VENV/bin/activate"
exec rlm "$@"
