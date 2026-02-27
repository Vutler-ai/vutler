# Overnight Checklist — Feb 27, 2026

## Phase 1: Dashboard Integration ⏳
- [ ] Philip delivers dashboard.html with sidebar + pixel office in Chat view
- [ ] Deploy to VPS as /dashboard-v2 for testing
- [ ] Verify all sidebar navigation works
- [ ] Verify pixel office renders big in content area
- [ ] Verify chat panel opens on agent click
- [ ] Verify API chat works (Bearer token)
- [ ] Mobile test (responsive)
- [ ] Replace /app route with new dashboard

## Phase 2: Visual Polish
- [ ] Sprites match reference images (detailed furniture)
- [ ] Server room LEDs animate
- [ ] Coffee machine steam
- [ ] Conference table with notepads
- [ ] Floor tiles have proper pattern
- [ ] Walls have depth (highlight/shadow)
- [ ] Corridor has lighting effects
- [ ] VUTLER watermark on floor

## Phase 3: Agent Life
- [ ] Agents at their desks (working state)
- [ ] Idle agents wander in lounge
- [ ] Random bubbles ("coding...", "☕", etc.)
- [ ] Walking animation (legs alternate)
- [ ] Eye blink animation
- [ ] Typing animation
- [ ] Agent reacts when clicked (wave, bubble)

## Phase 4: Interactivity
- [ ] Click agent → chat panel + bubble reaction
- [ ] Zoom/pan (mouse wheel, drag)
- [ ] Touch support (mobile)
- [ ] Tooltip on hover (name, role, status)
- [ ] ESC closes panels
- [ ] Keyboard shortcuts

## Deploy
- [ ] Copy dashboard.html to VPS
- [ ] Add Express route (/app → dashboard.html)
- [ ] Add nginx route
- [ ] Test https://app.vutler.ai/app
- [ ] Verify login redirect still works
- [ ] Test on mobile

## Git
- [ ] Commit all new files
- [ ] Push to alopez3006/vutler
