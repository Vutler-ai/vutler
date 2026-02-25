#!/bin/bash
# kChat Bridge - Continuous polling loop
# Polls every 15 seconds, forwards new messages to OpenClaw gateway as system events
# Run: nohup bash kchat-bridge.sh &

POLL_INTERVAL=15
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/tmp/openclaw/kchat-bridge.log"
PID_FILE="/tmp/openclaw/kchat-bridge.pid"

echo $$ > "$PID_FILE"
echo "$(date): kChat bridge started (PID $$, polling every ${POLL_INTERVAL}s)" >> "$LOG_FILE"

while true; do
  output=$(/usr/bin/python3 "$SCRIPT_DIR/kchat-poll.py" 2>&1)
  if [ $? -eq 0 ] && [ -n "$output" ] && [ "$output" != "[]" ]; then
    echo "$(date): $output" >> "$LOG_FILE"
  fi
  sleep $POLL_INTERVAL
done
