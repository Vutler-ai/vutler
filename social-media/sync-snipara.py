#!/usr/bin/env python3
"""Sync local agent files to Snipara for cloud agent context sharing"""
import json, requests, sys, os, hashlib
from pathlib import Path

API_KEY = "REDACTED_SNIPARA_KEY_3"
BASE = "https://api.snipara.com/mcp/vutler"
WORKSPACE = Path(os.environ.get("WORKSPACE", "/Users/lopez/.openclaw/workspace"))
HASH_FILE = WORKSPACE / "memory" / "snipara-sync-hashes.json"

FILES = {
    "agents/MEMORY.md": WORKSPACE / "MEMORY.md",
    "agents/SOUL.md": WORKSPACE / "SOUL.md",
    "agents/USER.md": WORKSPACE / "USER.md",
    "agents/IDENTITY.md": WORKSPACE / "IDENTITY.md",
    "agents/TOOLS.md": WORKSPACE / "TOOLS.md",
}

# Also sync today's and yesterday's memory files
from datetime import datetime, timedelta
today = datetime.now().strftime("%Y-%m-%d")
yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
for date in [today, yesterday]:
    p = WORKSPACE / "memory" / f"{date}.md"
    if p.exists():
        FILES[f"agents/memory/{date}.md"] = p

def file_hash(path):
    if not path.exists():
        return None
    return hashlib.md5(path.read_bytes()).hexdigest()

def load_hashes():
    if HASH_FILE.exists():
        return json.loads(HASH_FILE.read_text())
    return {}

def save_hashes(hashes):
    HASH_FILE.write_text(json.dumps(hashes, indent=2))

def upload(doc_path, content):
    payload = {
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "rlm_upload_document", "arguments": {"path": doc_path, "content": content}}
    }
    r = requests.post(BASE, headers={"X-API-Key": API_KEY, "Content-Type": "application/json"}, json=payload, timeout=15)
    return r.json()

def main():
    hashes = load_hashes()
    synced = 0
    skipped = 0
    
    for doc_path, file_path in FILES.items():
        if not file_path.exists():
            continue
        h = file_hash(file_path)
        if hashes.get(doc_path) == h:
            skipped += 1
            continue
        
        content = file_path.read_text()
        result = upload(doc_path, content)
        
        if result.get("result"):
            hashes[doc_path] = h
            synced += 1
            print(f"  synced {doc_path} ({len(content)} bytes)")
        else:
            print(f"  FAILED {doc_path}: {result.get('error', 'unknown')}")
    
    save_hashes(hashes)
    print(f"Done: {synced} synced, {skipped} unchanged")

if __name__ == "__main__":
    main()
