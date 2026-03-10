# Vutler Public Changelog

## 2026-03-10
### Repository governance & licensing
- Switched canonical public repository alignment to `Vutler-ai/vutler`.
- Added root `LICENSE` with explicit open-core model (CE Apache 2.0 + EE commercial license references).
- Updated `README.md` license section and badge to match open-core positioning.

### Public documentation structure
- Added public docs index: `docs/README.md`.
- Added public roadmap: `docs/roadmap/public-roadmap.md`.
- Added public changelog: `docs/changelog/public-changelog.md`.
- Moved legacy root sprint/history docs to `docs/archive/legacy-root/`.
- Moved internal planning/sprint docs to `docs/archive/internal/planning/` and `docs/archive/internal/sprints/`.
- Moved additional internal-only assets/reports/specs from root to `docs/archive/internal/misc/` for cleaner public navigation.

### Configuration quality
- Expanded `.env.example` to include complete runtime/security/database/LLM/mail/drive/test variables used by the app.

## 2026-03-09
### Integrations & platform
- Delivered integrations foundation (gateway + routes + migration + provider tools baseline).
- Deployed initial integrations UI and provider management flow.

### Social Ops
- Added Social Ops timeline endpoint and initial mapping for external publishing workflow.

## 2026-03-08
### UX & chat reliability
- Applied major workspace UX consistency improvements across key pages.
- Applied chat reliability/readability fixes and stabilization patches.
