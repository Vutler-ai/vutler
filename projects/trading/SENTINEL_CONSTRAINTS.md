# Sentinel Configuration — Missing Dependencies

**Status:** ⚠️ API configuration needed  
**Last Updated:** 2026-02-24 16:15 CET

---

## Issue 1: Web Search API (Brave Search)

### Problem
- `web_search` tool requires Brave Search API key
- Not configured in OpenClaw gateway
- Affects: Real-time news fetching for market briefs

### Solution
```bash
openclaw configure --section web
# Then enter Brave Search API key
```

### Impact
- Current workaround: Using web_fetch + manual RSS feeds
- 4-hour briefing cycle can still operate, but requires manual verification

---

## Issue 2: Vchat (RC API) Authentication

### Problem
- Vutler RC instance at `83.228.222.180:3000` requires auth token
- Previous 12:00 CET attempt failed: 401 "You must be logged in"
- Token format issue or session requirements unclear

### Current Setup
```
RC_URL: http://127.0.0.1:3000 (internal to VPS)
CHANNEL_ID: 699ce66f7ecfb41cfea9c418 (trading)
AUTH_TOKEN: lNQEZVjHdJsvTy4hP6wX8m (from admin @alopez3006)
USER_ID: alopez3006
```

### Solution Options
1. **Refresh RC auth token** via Vutler admin panel
2. **Use RC Web API v4** (different endpoint than v1)
3. **Test RC credentials** with admin login
4. **Alternative:** Use kChat (Infomaniak) instead of Vchat

### Impact
- 16:00 CET briefing created locally (summary markdown files)
- Manual posting to Vchat or kChat required until resolved
- Trading team can access summaries in `projects/trading/memory/`

---

## Issue 3: SSH Access to VPS

### Problem
- SSH key `~/.secrets/vps-ssh-key.pem` not found
- Needed for direct API calls to Vutler RC via SSH tunnel

### Solution
- Check if `.secrets/` directory has key under different name
- Or use gateway API endpoint instead of SSH tunnel

### Impact
- Cannot post to Vchat via SSH relay
- Must use direct HTTP API calls with proper auth

---

## Workaround (Current 16:00 Status)

✅ **What Works:**
- News collection → JSONL storage ✅
- Summary markdown generation ✅
- Local memory/logging ✅

⚠️ **What's Blocked:**
- Real-time web search (no API key) 
- Vchat posting (auth failure)
- SSH tunnel to VPS

### Current Setup (Fallback)
1. **12:00 CET run:** 10 briefs collected, stored locally
2. **16:00 CET run:** Summary report generated from 12:00 data
3. **Team Access:** Summaries available in `projects/trading/memory/` for manual review
4. **Marcus (Portfolio Manager):** Can review briefings in workspace, act on data independently

---

## TODO: Configuration Steps

- [ ] **Step 1:** Configure Brave Search API
  ```bash
  openclaw configure --section web
  # Get key from: https://api.search.brave.com
  ```

- [ ] **Step 2:** Verify/refresh Vutler RC credentials
  - Check `projects/vutler/` or K-Drive for latest RC admin token
  - Test: `curl -H "X-Auth-Token: <TOKEN>" http://127.0.0.1:3000/api/v1/me`

- [ ] **Step 3:** Locate SSH key to VPS
  - Check: `ls -la ~/.secrets/` 
  - Or: `ls -la ~/.ssh/`
  - May need to regenerate key

- [ ] **Step 4:** Re-test 20:00 CET run with fresh API calls

---

## Timeline

- **2026-02-24 12:00 CET:** Initial run — 10 briefs collected ✅
- **2026-02-24 16:00 CET:** Summary run — API constraints documented ⚠️
- **2026-02-24 20:00 CET:** Next cycle (pending API fixes)
- **2026-02-25 onwards:** Resume 4-hour briefing cycle (when APIs configured)

---

**Contact:** Sentinel (News Analyst)  
**Owner:** Marcus (Portfolio Manager) / Jarvis (Coordinator)  
**Escalation:** Resolve API access for uninterrupted briefing cycle
