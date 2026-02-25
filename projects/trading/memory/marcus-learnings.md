# Marcus Trading Learnings

## 2026-02-25 — Day 1 Lessons

### 🧠 Learning #1: Infrastructure Before Trading
**Date:** 2026-02-25  
**Context:** Opened 3 positions (BTC, QQQ, DAX) without price feed infrastructure  
**What happened:** Could not fetch EOD prices for evening review due to missing API keys  
**Impact:** Cannot measure performance, adjust stops, or properly evaluate thesis  
**Lesson:** Set up data infrastructure (API keys, price feeds, test endpoints) BEFORE entering any positions. Trading without data = flying blind.  
**Next time:** Test price fetching capabilities during pre-market setup  
**Tags:** #infrastructure #risk-management #day1

---

### 🧠 Learning #2: Entry Timing by Instrument
**Date:** 2026-02-25  
**Context:** Entered all positions at 15:05 CET (late afternoon EU time)  
**Analysis:**
- **BTC:** 24/7 market — timing flexible, but watch US/Asia session overlaps for volume
- **QQQ:** Entered after US open (15:30 CET) but missed early price action — better to enter near open or after Fed announcements
- **DAX:** Entered near EU close (17:30 CET) — optimal window is 09:00-11:00 CET for German stocks

**Impact:** Missed full day's price action for evaluation. Can't assess intraday behavior.  
**Lesson:** Respect market hours and optimal entry windows per instrument type.  
**Next time:**
- DAX: Enter 09:00-11:00 CET (EU morning)
- QQQ: Enter 15:30-16:00 CET (US open) or post-FOMC
- BTC: Flexible, but prefer high-volume periods (US afternoon = EU evening)

**Tags:** #timing #market-hours #execution

---

### 🧠 Learning #3: Conservative Day 1 Position Sizing
**Date:** 2026-02-25  
**Context:** First trading day, allocated 55% of capital across 3 positions  
**Breakdown:**
- BTC: 20% (high beta)
- QQQ: 20% (medium beta)  
- DAX: 15% (low beta)
- Cash: 45% (reserve)

**Rationale:**
- Well above 30% cash minimum (risk rule compliance)
- Max position size 20% per trade (rule compliance)
- Allows dry powder for adding to winners
- Buffer for potential stop-loss triggers
- Diversified across geography + risk levels

**Impact:** Risk-managed start. Can scale up if thesis validates.  
**Lesson:** Conservative Day 1 sizing is appropriate. Build confidence before deploying more capital.  
**Validation pending:** Need 5-7 days to assess if this balance allows growth while protecting downside.  
**Tags:** #position-sizing #risk-management #day1

---

### 🧠 Learning #4: Thesis Documentation is Critical
**Date:** 2026-02-25  
**Context:** Documented detailed thesis for each position in trades-2026-02-25.md  
**Why it matters:**
- Forces clarity before entry (no emotional/impulsive trades)
- Provides framework for exit decisions (thesis invalidation = exit)
- Enables learning from outcomes (was I right for right reasons?)
- Historical record for pattern recognition

**Format used:**
- Entry details (price, size, stop-loss)
- Thesis statement (why entering)
- Expected outcome (target, timeframe, catalysts)
- Risk assessment (what could go wrong)
- News trigger (Sentinel brief reference)

**Impact:** Clear decision framework. Can objectively evaluate performance.  
**Lesson:** Always document thesis BEFORE entering position. "Why am I buying this?" must have written answer.  
**Tags:** #documentation #discipline #process

---

### 🧠 Learning #5: Need Automated Price Feeds
**Date:** 2026-02-25  
**Context:** Manual price fetching failed (web_search API not configured)  
**Options identified:**
1. **Brave API** — Free tier, web_search integration  
2. **Alpha Vantage** — Free tier 25 calls/day, paid $50/mo unlimited
3. **IEX Cloud** — Free tier 50k messages/mo, good for EOD data
4. **Yahoo Finance unofficial API** — Free but unreliable
5. **CoinGecko** — Free tier for crypto, reliable

**Recommendation:**
- **Short-term:** Set up Brave API for web_search (easiest integration)
- **Medium-term:** Alpha Vantage or IEX Cloud for reliable EOD data
- **Crypto-specific:** CoinGecko API for BTC/ETH real-time prices

**Impact:** Cannot operate effectively without price data automation.  
**Action items:**
- [ ] Alex to provide Brave API key
- [ ] Test Alpha Vantage free tier (25 calls = enough for 8 positions EOD)
- [ ] Create price_fetcher.sh script for automation

**Tags:** #infrastructure #automation #technical-debt

---

## Pattern Recognition

### Early Observations (Day 1 only — insufficient data)
- Entry timing affects evaluation ability more than initially expected
- Documentation quality correlates with decision confidence
- Risk rules (30% cash, 20% max position) feel appropriate but untested under stress
- Need at least 2 weeks of data before identifying trading patterns

### Questions to Answer (Next 7 Days)
1. Does 45% cash buffer prove too conservative or appropriately defensive?
2. How well do morning news → position decisions correlate with EOD outcomes?
3. What's optimal position hold time? (Day trade, swing, position hold)
4. Which news types (Sentinel briefs) have highest predictive value?
5. Do stop-losses at -5% trigger too frequently (whipsaw) or protect well?

---

## Action Items for Tomorrow (2026-02-26)

### Morning (10:00 CET)
- [ ] Read Sentinel news brief for Feb 26
- [ ] Check overnight price action (BTC, QQQ futures, DAX pre-market)
- [ ] Evaluate open positions vs thesis
- [ ] Decide: HOLD / ADD / REDUCE / EXIT for each position
- [ ] Look for new opportunities if cash >40%

### Evening (20:00 CET)  
- [ ] Fetch EOD prices (manual if API still unavailable)
- [ ] Update portfolio.json valuations
- [ ] Calculate P&L for each position
- [ ] Compare morning predictions vs actual outcomes
- [ ] Document lessons in trades-2026-02-26.md

### Infrastructure
- [ ] Request Brave API key from Alex via WhatsApp
- [ ] Test Alpha Vantage free tier registration
- [ ] Create simple price fetcher script (bash + curl)

---

**Learning velocity:** 🟢 High (Day 1 focused on process setup)  
**Confidence level:** 🟡 Medium (positions entered, process defined, data infrastructure pending)  
**Next milestone:** Complete Week 1 with all positions properly tracked and evaluated
