#!/usr/bin/env python3
"""Post to LinkedIn via REST API. Called by cron jobs."""
import sys
import json
import subprocess

import os
TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN", "")
PERSON_URN = os.environ.get("LINKEDIN_PERSON_URN", "urn:li:person:V0AvEdU-Ol")

def post_linkedin(text):
    payload = json.dumps({
        "author": PERSON_URN,
        "commentary": text,
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED"
    })
    
    r = subprocess.run([
        "curl", "-s", "-w", "\n%{http_code}",
        "-X", "POST", "https://api.linkedin.com/rest/posts",
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Content-Type: application/json",
        "-H", "LinkedIn-Version: 202602",
        "-H", "X-Restli-Protocol-Version: 2.0.0",
        "-d", payload
    ], capture_output=True, text=True, timeout=30)
    
    lines = r.stdout.strip().split("\n")
    code = lines[-1] if lines else "0"
    body = "\n".join(lines[:-1])
    
    if code == "201":
        print(f"✅ LinkedIn post published")
        return True
    else:
        print(f"❌ LinkedIn failed ({code}): {body}")
        return False

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read().strip()
    post_linkedin(text)
