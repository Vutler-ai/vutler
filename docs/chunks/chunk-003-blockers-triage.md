# Chunk 003 — Blockers Triage

## Inbox/Calendar real providers
- Current state: endpoints available; provider wiring remains partial.
- Quick fix: add provider adapters + token persistence; ship with feature flags.
- ETA: 0.5–1 day for first real provider each.

## Marketplace deploy executor
- Current state: deploy route exposed; executor integration incomplete.
- Quick fix: add queued executor worker + status polling endpoint.
- ETA: 1 day for robust async deploy path.

## Nexus/setup badges + UX polish
- Current state: status endpoints exist; UX consistency gaps remain.
- Quick fix: normalize status shape and add frontend badge mapping.
- ETA: 0.5 day for badges + 0.5 day for drive/marketplace UX polish.
