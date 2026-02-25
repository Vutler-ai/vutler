#!/usr/bin/env python3
"""kChat polling bridge with centralized dispatch.
Jarvis polls all channels + DMs, writes to inbox for heartbeat processing.
"""
import json, time, subprocess, os, sys

KCHAT = "https://alejandro-lopez.kchat.infomaniak.com/api/v4"
TOKEN = "dymQaUZqumyWyWG0FPhntvdSoRVeOj51eqKn9SR1vFFCRO6BBoD35nFkWBfCDcIOl0WxbIpAE1INC3MA"
JARVIS_ID = "019c5abe-30ed-7164-a4a3-9d24bf68453e"
INBOX = "/Users/lopez/.openclaw/workspace/memory/kchat-inbox.jsonl"
STATE = "/Users/lopez/.openclaw/workspace/memory/kchat-poll-state.json"

CHANNELS = {
    "019b17c6-6270-7029-bfdf-7f91081a8204": "general",
    "019c5acd-0ca9-71fb-b8e6-c1159e55cb22": "engineering",
    "019c5acd-2430-72ea-98e5-73e441ee5b72": "product",
    "019c5acd-3e33-7151-8e37-d64e869aa0d2": "marketing-growth",
    "019c5acd-5103-72d2-a0b3-e3bec548dfbb": "design",
    "019c5acd-6494-73e3-9577-0902df84dd2b": "sales",
    "019c5acd-7a6e-70c1-9180-02c6e74e2098": "content",
    "019c5acd-8ce5-7182-b20d-9fd8c2d5b7e0": "community",
    "019c5ade-99e1-700c-9204-c0984df67024": "ops-jarvis",
    "019c5ade-9aa8-7329-b021-615e6222bcd0": "ops-strategy",
    # DMs
    "019c5abf-4e8f-71b7-a9c3-b4a9af3149d2": "dm-alex-jarvis",
    "019c5abe-3323-7079-9140-341d4845ce60": "dm-system-jarvis",
}

# User ID mapping
USERS = {
    "019b17c6-7fb9-7116-8bf3-b602bb9669af": "alex",
    "019c5abe-30ed-7164-a4a3-9d24bf68453e": "jarvis",
    "019c5abf-3001-71c2-8be9-e1f86f1060ea": "andrea",
    "019c5ac0-615c-7128-b56f-dcb60725ccb7": "mike",
    "019c5ac1-4c1b-7303-af8f-dc2a737d3069": "philip",
    "019c5ac5-a381-7042-8f0a-4003a1623d70": "max",
    "019c5ac6-96d3-71fb-9d3e-3f4c1a659a6f": "victor",
}

# Bot user IDs (these post on behalf of agents)
BOT_IDS = set()  # Will be populated if needed

def api_get(path):
    try:
        r = subprocess.run(
            ["curl", "-s", "--max-time", "8", "-H", f"Authorization: Bearer {TOKEN}", f"{KCHAT}{path}"],
            capture_output=True, text=True, timeout=15
        )
        return json.loads(r.stdout)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr, flush=True)
        return None

# Load state
last_ts = 0
if os.path.exists(STATE):
    try:
        last_ts = json.load(open(STATE))["last_ts"]
    except:
        pass
if last_ts == 0:
    last_ts = int(time.time() * 1000)
    json.dump({"last_ts": last_ts}, open(STATE, "w"))

print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] kChat poll started. last_ts={last_ts}", flush=True)

while True:
    new_last = last_ts
    for ch_id, ch_name in CHANNELS.items():
        data = api_get(f"/channels/{ch_id}/posts?since={last_ts}&per_page=50")
        if not data or "order" not in data:
            continue
        for pid in data["order"]:
            p = data["posts"][pid]
            if p["user_id"] == JARVIS_ID:
                continue
            if p["create_at"] <= last_ts:
                continue
            msg = p.get("message", "").strip()
            if not msg:
                continue
            
            user_name = USERS.get(p["user_id"], p["user_id"][:12])
            
            line = json.dumps({
                "channel": ch_name,
                "channel_id": ch_id,
                "user_id": p["user_id"],
                "user_name": user_name,
                "post_id": pid,
                "message": msg,
                "ts": p["create_at"]
            })
            with open(INBOX, "a") as f:
                f.write(line + "\n")
            print(f"  [{ch_name}] {user_name}: {msg[:60]}", flush=True)
            if p["create_at"] > new_last:
                new_last = p["create_at"]

    if new_last > last_ts:
        last_ts = new_last
        json.dump({"last_ts": last_ts}, open(STATE, "w"))

    time.sleep(60)
