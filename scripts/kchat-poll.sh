#!/bin/bash
# kChat polling bridge — polls every 15s, writes new messages to kchat-inbox.jsonl
KCHAT="https://alejandro-lopez.kchat.infomaniak.com/api/v4"
TOKEN="dymQaUZqumyWyWG0FPhntvdSoRVeOj51eqKn9SR1vFFCRO6BBoD35nFkWBfCDcIOl0WxbIpAE1INC3MA"
JARVIS_ID="019c5abe-30ed-7164-a4a3-9d24bf68453e"
INBOX="/Users/lopez/.openclaw/workspace/memory/kchat-inbox.jsonl"
STATE="/Users/lopez/.openclaw/workspace/memory/kchat-poll-state.json"

# Channel name mapping
declare -A CHAN_NAMES
CHAN_NAMES["019b17c6-6270-7029-bfdf-7f91081a8204"]="general"
CHAN_NAMES["019c5acd-0ca9-71fb-b8e6-c1159e55cb22"]="engineering"
CHAN_NAMES["019c5acd-2430-72ea-98e5-73e441ee5b72"]="product"
CHAN_NAMES["019c5acd-3e33-7151-8e37-d64e869aa0d2"]="marketing-growth"
CHAN_NAMES["019c5acd-5103-72d2-a0b3-e3bec548dfbb"]="design"
CHAN_NAMES["019c5acd-6494-73e3-9577-0902df84dd2b"]="sales"
CHAN_NAMES["019c5acd-7a6e-70c1-9180-02c6e74e2098"]="content"
CHAN_NAMES["019c5acd-8ce5-7182-b20d-9fd8c2d5b7e0"]="community"
CHAN_NAMES["019c5ade-99e1-700c-9204-c0984df67024"]="ops-jarvis"
CHAN_NAMES["019c5ade-9aa8-7329-b021-615e6222bcd0"]="ops-strategy"

CHANNELS="${!CHAN_NAMES[@]}"

# Load last poll timestamp (ms)
if [ -f "$STATE" ]; then
  LAST_TS=$(python3 -c "import json; print(json.load(open('$STATE')).get('last_ts', 0))" 2>/dev/null || echo 0)
else
  # Start from now
  LAST_TS=$(python3 -c "import time; print(int(time.time()*1000))")
fi

echo "[$(date)] kChat poll started. last_ts=$LAST_TS"

while true; do
  NEW_LAST_TS=$LAST_TS
  for ch in $CHANNELS; do
    CHAN_NAME="${CHAN_NAMES[$ch]}"
    RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$KCHAT/channels/$ch/posts?since=$LAST_TS&per_page=50" 2>/dev/null)
    
    echo "$RESP" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    for pid in data.get('order',[]):
        p = data['posts'][pid]
        uid = p.get('user_id','')
        if uid == '$JARVIS_ID':
            continue  # skip own messages
        if p.get('create_at',0) <= $LAST_TS:
            continue
        msg = p.get('message','').strip()
        if not msg:
            continue
        line = json.dumps({
            'channel': '$CHAN_NAME',
            'channel_id': '$ch',
            'user_id': uid,
            'post_id': pid,
            'message': msg,
            'ts': p['create_at']
        })
        print(line)
        # Print ts for state tracking
        print('__TS__' + str(p['create_at']), file=sys.stderr)
except:
    pass
" >> "$INBOX" 2>/tmp/kchat-ts.tmp

    # Update timestamp from stderr
    if [ -f /tmp/kchat-ts.tmp ]; then
      while read line; do
        TS_VAL="${line#__TS__}"
        if [ "$TS_VAL" -gt "$NEW_LAST_TS" ] 2>/dev/null; then
          NEW_LAST_TS=$TS_VAL
        fi
      done < /tmp/kchat-ts.tmp
      rm -f /tmp/kchat-ts.tmp
    fi
  done

  if [ "$NEW_LAST_TS" -gt "$LAST_TS" ]; then
    LAST_TS=$NEW_LAST_TS
    echo "{\"last_ts\": $LAST_TS}" > "$STATE"
  fi

  sleep 15
done
