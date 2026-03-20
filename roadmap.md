# Roadmap — Deferred Noise (Out of Active Production Flow)

Last update: 2026-03-20

## Decision
The following themes are intentionally removed from the current production execution flow and tracked as deferred roadmap work:

1. LiveKit-related scope
2. "CLI anything" exploratory scope
3. Post-prod initiative long-tail items (non-critical for current delivery)

These items are not blockers for current N0/N1 production closure and should not pollute active automation batches.

## Why deferred
- Low immediate business impact vs current N0/N1 reliability goals
- Adds noise to dashboards and weakens throughput signal
- Increases false urgency and assignment drift

## Re-entry criteria (to move back into active flow)
- Explicit go/no-go from Alex
- Clear owner (`*-local`) and measurable acceptance criteria
- No dependency conflict with active N0/N1 reliability pack

## Current active canonical pack (in-flow)
- N0: `cmmyxgs950074l427oe7rkzfv` — Vutler Automation Priority Pack
- N1: `cmmyxh0xl016bi4rkqcqw37nl` — Preflight hard-fail guard
- N1: `cmmyxh3up00duqcrgjan1fxqj` — Postflight verification + rollback alert
- N1: `cmmyxh5qi00ange652yv0bl9f` — Operator visibility panel

## Automation policy
Rex guardian excludes deferred roadmap themes from active-flow drift checks to avoid noise and ticket churn.
