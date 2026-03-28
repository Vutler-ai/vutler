#!/usr/bin/env python3
"""Post a tweet via X API v2. Called by cron jobs."""
import sys
import json
from requests_oauthlib import OAuth1Session

import os
CONSUMER_KEY = os.environ.get("X_CONSUMER_KEY", "")
CONSUMER_SECRET = os.environ.get("X_CONSUMER_SECRET", "")
ACCESS_TOKEN = os.environ.get("X_ACCESS_TOKEN", "")
ACCESS_SECRET = os.environ.get("X_ACCESS_SECRET", "")

def post_tweet(text):
    oauth = OAuth1Session(CONSUMER_KEY, CONSUMER_SECRET, ACCESS_TOKEN, ACCESS_SECRET)
    r = oauth.post("https://api.twitter.com/2/tweets", json={"text": text})
    data = r.json()
    if r.status_code == 201:
        tid = data["data"]["id"]
        print(f"✅ Tweet posted: https://x.com/Starboxgroup/status/{tid}")
        return tid
    else:
        print(f"❌ Failed ({r.status_code}): {json.dumps(data)}")
        return None

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read().strip()
    post_tweet(text)
