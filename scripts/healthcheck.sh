#!/bin/bash
# Rex Health Check Script
# Runs every 5 minutes via cron

REPORT_FILE=/home/ubuntu/vutler/memory/rex-health-report.md
SCORE=100
ISSUES=()
DETAILS=()

# 1. Docker containers (direct docker CLI, no HTTP API)
if ! docker ps >/dev/null 2>&1; then
  ((SCORE-=30))
  ISSUES+=("Docker CLI not accessible")
else
  RUNNING=$(docker ps --format '{{.Names}}:{{.Status}}' 2>/dev/null)
  EXPECTED=(vutler-api-test vutler-redis)
  for svc in "${EXPECTED[@]}"; do
    if ! echo "$RUNNING" | grep -q "^$svc:"; then
      ((SCORE-=15))
      ISSUES+=("Container $svc not running")
    fi
  done
  DETAILS+=("Docker containers: OK")
fi

# 2. API health
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
  DETAILS+=("API health: OK (200)")
else
  ((SCORE-=20))
  ISSUES+=("API health check returned $HTTP_CODE")
fi

# 3. Disk usage
DISK_PCT=$(df / | awk 'NR==2{gsub(/%/,""); print $5}')
if [ "$DISK_PCT" -gt 85 ]; then
  ((SCORE-=10))
  ISSUES+=("Disk usage at ${DISK_PCT}%")
fi
DETAILS+=("Disk usage: ${DISK_PCT}%")

# 4. Memory (/proc/meminfo, no free command)
MEM_AVAIL_KB=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
MEM_TOTAL_KB=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
MEM_AVAIL_MB=$((MEM_AVAIL_KB / 1024))
MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
if [ "$MEM_AVAIL_MB" -lt 500 ]; then
  ((SCORE-=10))
  ISSUES+=("Low memory: ${MEM_AVAIL_MB}MB available")
fi
DETAILS+=("Memory available: ${MEM_AVAIL_MB}MB / ${MEM_TOTAL_MB}MB")

# 5. SSL check
EXPIRY=$(echo | openssl s_client -servername app.vutler.ai -connect app.vutler.ai:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
  DETAILS+=("SSL expires: $EXPIRY")
fi

# Clamp score
if [ "$SCORE" -lt 0 ]; then
  SCORE=0
fi

# Write report
{
  echo "**Health Check Report:**"
  echo ""
  echo "**Score: ${SCORE}/100**"
  echo ""
  if [ ${#ISSUES[@]} -eq 0 ]; then
    echo "**No issues found.**"
  else
    echo "**Issues:**"
    for issue in "${ISSUES[@]}"; do
      echo "- $issue"
    done
  fi
  echo ""
  echo "**Details:**"
  for i in "${!DETAILS[@]}"; do
    echo "$((i+1)). ${DETAILS[$i]}"
  done
  echo ""
  echo "*Last check: $(date -u '+%Y-%m-%d %H:%M UTC')*"
} > "$REPORT_FILE"

echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Health check complete. Score: ${SCORE}/100"
