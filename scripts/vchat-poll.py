"""Vchat polling bridge.
Polls VPS vchat inbox API every 60s, writes to memory/vchat-inbox.jsonl for heartbeat processing.
"""
import json, time, urllib.request, os, sys

INBOX = "/Users/lopez/.openclaw/workspace/memory/vchat-inbox.jsonl"
BRIDGE_URL = "https://app.vutler.ai/api/v1/vchat"
BRIDGE_KEY = "6fde82a4a4c52d11b1c02fe6eda270639280b6d77bf34279"

# Jarvis RC user IDs to skip (don't process our own messages)
SKIP_USERS = {
    "A6JwMT8pRRNW6YCdR",  # Jarvis
}

def fetch_inbox():
    url = f"{BRIDGE_URL}/inbox?key={BRIDGE_KEY}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] fetch error: {e}", flush=True)
        return None

def ack_messages(ids):
    url = f"{BRIDGE_URL}/ack?key={BRIDGE_KEY}"
    data = json.dumps({"ids": ids}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] ack error: {e}", flush=True)
        return None

print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Vchat poll started", flush=True)

while True:
    try:
        result = fetch_inbox()
        if result and result.get("success") and result.get("count", 0) > 0:
            messages = result["messages"]
            ids_to_ack = []
            
            for msg in messages:
                # Skip own messages
                if msg.get("user_id") in SKIP_USERS:
                    ids_to_ack.append(msg["id"])
                    continue
                
                # Write to inbox file
                line = json.dumps({
                    "channel": msg.get("channel_name", ""),
                    "channel_id": msg.get("channel_id", ""),
                    "user_id": msg.get("user_id", ""),
                    "username": msg.get("username", ""),
                    "message": msg.get("message", ""),
                    "message_id": msg.get("message_id", ""),
                    "ts": msg.get("timestamp", "")
                })
                
                with open(INBOX, "a") as f:
                    f.write(line + "\n")
                
                ids_to_ack.append(msg["id"])
                print(f"[{time.strftime('%H:%M:%S')}] #{msg.get('channel_name','')} @{msg.get('username','')}: {msg.get('message','')[:80]}", flush=True)
            
            if ids_to_ack:
                ack_messages(ids_to_ack)
                
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] error: {e}", flush=True)
    
    time.sleep(60)
