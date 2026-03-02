# Vutler QA Checklist - End-to-End

**Date:** 2026-03-01 21:03  
**Version:** Pre-production (post P0/P1/P2 fixes)  
**Tester:** Jarvis  
**Status:** In Progress

---

## 🎯 QA Scope

**Goal:** Verify ALL 22 pages work without errors  
**User:** alex@vutler.com / admin123  
**Environment:** https://app.vutler.ai (VPS production)

---

## 📋 Checklist Template

For each page:
- [ ] Page loads without errors
- [ ] No console errors (404, 500, JS errors)
- [ ] Data displays correctly (not empty array)
- [ ] Loading state shows during API call
- [ ] Error state handled gracefully
- [ ] Empty state shows when appropriate
- [ ] Responsive (mobile + desktop)
- [ ] Navigation works (buttons, links)

---

## 🏠 Core Pages

### 1. Dashboard (/)
- [ ] Page loads
- [ ] Widgets display
- [ ] Agent stats show
- [ ] No console errors
- [ ] Navigation works

### 2. Chat (/chat)
- [ ] Page loads
- [ ] Channels list visible
- [ ] Can create channel ✨ (P0 fix)
- [ ] Can send message
- [ ] No 500/404 errors

### 3. Agents (/agents)
- [ ] Page loads
- [ ] Agents table displays
- [ ] "Manage" button works ✨ (P0 fix)
- [ ] Navigates to /agents/:id/config
- [ ] Agent detail page loads

---

## 🤖 Agent Management

### 4. Agent Builder (/agents/builder)
- [ ] Page loads
- [ ] Form renders
- [ ] Can create agent
- [ ] Validation works

### 5. Agent Config (/agents/:id/config)
- [ ] Page loads
- [ ] Settings editable
- [ ] Save works
- [ ] No errors

### 6. Agent Deploy (/agents/:id/deploy)
- [ ] Page loads
- [ ] Deploy options show
- [ ] Deploy button works
- [ ] Status updates

---

## 🔌 Integrations & Setup

### 7. Integrations (/integrations)
- [ ] Page loads
- [ ] Integration list shows ✨ (P1 fix)
- [ ] Can connect integration
- [ ] Can disconnect
- [ ] No 500/404 errors

### 8. Marketplace (/marketplace)
- [ ] Page loads
- [ ] Templates display
- [ ] Install works
- [ ] No 500 errors

### 9. Setup (/setup)
- [ ] Page loads
- [ ] Token generation works ✨ (P0 fix)
- [ ] Onboarding flow complete

---

## 🏢 Nexus (Local Agent)

### 10. Nexus Setup (/nexus/setup)
- [ ] Page loads
- [ ] Token generation works ✨ (P0 fix)
- [ ] Pairing instructions clear
- [ ] Download link works

### 11. Nexus Deployments (/nexus/deployments)
- [ ] Page loads ✨ (P2 tested)
- [ ] Deployment list shows
- [ ] Status displays

### 12. Nexus Clients (/nexus/clients)
- [ ] Page loads
- [ ] Client metadata shows ✨ (P2 fix)
- [ ] "Jarvis sur Mac" instead of "unknown"
- [ ] OS/device info correct

---

## 📁 File & Email

### 13. Drive (/drive)
- [ ] Page loads
- [ ] Files/folders display ✨ (P0 fix)
- [ ] Seed data visible (3 folders, 3 files)
- [ ] Upload works
- [ ] Navigation works

### 14. Email (/email)
- [ ] Page loads
- [ ] Emails display ✨ (P1 fix)
- [ ] Folders show (inbox, sent, trash)
- [ ] Can read email
- [ ] Can send email

---

## ⚙️ Settings & Admin

### 15. LLM Settings (/settings/llm)
- [ ] Page loads ✨ (P1 fix)
- [ ] No 404 CSS/JS errors
- [ ] Model selection works
- [ ] Provider config works

### 16. Notifications (/notifications)
- [ ] Page loads ✨ (P1 fix)
- [ ] Notifications display
- [ ] Mark as read works
- [ ] Settings work

### 17. Usage (/usage)
- [ ] Page loads ✨ (P1 fix)
- [ ] Token stats display
- [ ] Cost breakdown shows
- [ ] Charts render

### 18. Audit Logs (/audit)
- [ ] Page loads ✨ (P1 fix)
- [ ] Logs display
- [ ] Filters work
- [ ] Export works

---

## 🎮 Advanced Features

### 19. Sandbox (/sandbox)
- [ ] Page loads ✨ (P2 tested)
- [ ] Code editor works
- [ ] Execution works
- [ ] Output displays

### 20. Automation (/automations)
- [ ] Page loads ✨ (P2 fix)
- [ ] Automation list shows
- [ ] Can create automation
- [ ] Enable/disable works

### 21. Tasks (/tasks)
- [ ] Page loads ✨ (P2 tested)
- [ ] Tasks display
- [ ] Status updates (auto or manual)
- [ ] Create task works

### 22. Templates (/templates)
- [ ] Page loads
- [ ] ⚠️ Skipped (hors scope MVP)
- [ ] OR: Seed data shows (if implemented)

---

## 🔍 Cross-Cutting Tests

### Navigation & UX
- [ ] Sidebar menu works
- [ ] No duplicate menu items ✨ (P2 fix: integrations)
- [ ] Active page highlighted
- [ ] Responsive on mobile
- [ ] Tooltips show
- [ ] Icons load

### API Health
- [ ] All endpoints return 200/201 (no 404/500)
- [ ] Response times <500ms
- [ ] Error messages user-friendly
- [ ] Loading states consistent

### Data Integrity
- [ ] Seed data present everywhere
- [ ] No empty arrays without reason
- [ ] Timestamps formatted correctly
- [ ] IDs consistent (no undefined)

### Performance
- [ ] Page load <2s
- [ ] No memory leaks (DevTools)
- [ ] Bundle size reasonable
- [ ] Images optimized

### Security
- [ ] Auth required for all pages
- [ ] No credentials in frontend
- [ ] HTTPS enforced
- [ ] CORS configured

---

## 🐛 Known Issues (Expected)

1. **Templates** - Pas implémenté (hors scope MVP) ✅ OK
2. **Vaultbrix columns** - `tools`, `capabilities` manquants (waiting for Alex DDL) ✅ OK
3. **Nexus pairing** - Needs remote Mac setup (not testable yet) ✅ OK

---

## ✅ Test Results

**Status:** Testing...

### Passed (0/22)
_Will update as tests complete_

### Failed (0/22)
_Any issues found will be listed here_

### Skipped (1/22)
- Templates (hors scope MVP)

---

## 📊 Summary

**Total Pages:** 22  
**Tested:** 0/22 (0%)  
**Passed:** 0/22 (0%)  
**Failed:** 0/22 (0%)  
**Skipped:** 1/22 (Templates)

**Blockers:** None  
**Warnings:** 2 (Vaultbrix columns, Nexus pairing)

**Ready for Production:** ❓ TBD

---

**Started:** 2026-03-01 21:03  
**Completed:** TBD  
**Duration:** TBD
