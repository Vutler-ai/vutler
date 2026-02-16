# Sprint 2 Blockers

## 🔴 BLOCKER: Docker Build Complexity

**Issue:** Integrating custom TypeScript code into Rocket.Chat requires building from source, which is complex.

**Details:**
- Modified `apps/meteor/server/main.ts` to call `startVutler()`
- Created `/Users/lopez/.openclaw/workspace/projects/vutler/app/apps/meteor/server/startup/vutler.ts`
- But the official `registry.rocket.chat/rocketchat/rocket.chat:latest` image is pre-built
- Custom TypeScript changes require a full rebuild of Rocket.Chat

**Options:**

### Option A: Build Custom Docker Image (Current Attempt)
- Created `Dockerfile` with multi-stage build
- **Problem:** Rocket.Chat build process is complex and slow (~15-30 min)
- **Blocker:** Build may fail due to missing dependencies or build config issues

### Option B: Runtime Monkey-Patching
- Keep using official image
- Create an entrypoint script that patches the running Node.js process
- **Problem:** Fragile and hard to maintain

### Option C: Separate Service (Pragmatic for Sprint 2)
- Run custom APIs as a separate Express service alongside Rocket.Chat
- **Pros:** 
  - Simple, fast, no complex build
  - Can iterate quickly
  - Can still share MongoDB
- **Cons:** 
  - Not "truly integrated" into Rocket.Chat
  - Need to handle auth separately

**Recommendation for Sprint 2:** Go with **Option C** for now.

**Why:**
- Faster iteration
- Less risk of broken builds
- Still delivers the functionality
- Can refactor to full integration in Sprint 3

**Next Steps:**
1. Revert to using official Rocket.Chat image
2. Add a separate `vutler-api` service to docker-compose
3. Mount custom code as Express app
4. Share MongoDB and Redis between services

---

## Status: ACTIVE
**Created:** 2026-02-16
**Owner:** Mike
