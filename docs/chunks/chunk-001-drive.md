# Chunk 001 — Drive

## Goal
Ensure documents appear in Vutler Drive UI under `/projects/Vutler/...`.

## Actions
1. Create folders `/projects/Vutler/BMAD` and `/projects/Vutler/chunks`.
2. Copy BMAD and chunk markdown docs into those folders.
3. Verify with Drive API `GET /api/v1/drive/files?path=/projects/Vutler`.

## Verification
- `BMAD_MASTER.md` visible in `/projects/Vutler/BMAD`
- `chunk-001-drive.md` visible in `/projects/Vutler/chunks`
