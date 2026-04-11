# Snipara RLM Runtime Executor V1
> **Type:** Technical Spec
> **Status:** Implemented
> **Date:** 2026-04-11

## Goal

Add a bounded `RLM Runtime` integration for technical autonomy without replacing Vutler's runtime authority.

This slice covers:
- an optional `RLM Runtime` backend inside the existing sandbox executor
- Python-only execution for eligible technical agents
- automatic fallback to the native Vutler sandbox when `RLM Runtime` is disabled or unavailable

It does not cover:
- making `RLM Runtime` the default executor
- JavaScript execution through `RLM Runtime`
- moving orchestration state, approvals, or audit out of Vutler

## Product Rule

Vutler still owns:
- orchestration decisions
- approvals
- task/run source of truth
- user-facing audit

`RLM Runtime` only replaces the inner code-execution backend for a narrow class of technical sandbox actions.

## Implementation

Files:
- [services/executors/rlmRuntimeExecutor.js](/Users/alopez/Devs/Vutler/services/executors/rlmRuntimeExecutor.js:1)
- [services/executors/sandboxExecutor.js](/Users/alopez/Devs/Vutler/services/executors/sandboxExecutor.js:1)
- [tests/sandbox-executor.test.js](/Users/alopez/Devs/Vutler/tests/sandbox-executor.test.js:1)

Behavior:
- disabled unless `RLM_RUNTIME_ENABLED=true`
- only considered for Python sandbox executions
- only considered for technical/security/qa/devops/engineering-style agents
- executes `rlm run --env <env> <code>`
- if the binary is missing or execution errors before completion, Vutler falls back to `executeInSandbox()`

Binary resolution order:
1. `RLM_RUNTIME_BIN`
2. `/home/ubuntu/rlm-venv/bin/rlm`
3. `/Users/lopez/.openclaw/workspace/.venvs/rlm-runtime/bin/rlm`
4. `rlm` from `PATH`

Config:
- `RLM_RUNTIME_ENABLED`
- `RLM_RUNTIME_BIN`
- `RLM_RUNTIME_ENV` default `docker`
- `RLM_RUNTIME_TIMEOUT_BUFFER_MS`
- `RLM_RUNTIME_ALLOW_UNKNOWN_AGENT` for exceptional local testing only

## Validation

Validated locally on 2026-04-11:
- `npx jest tests/sandbox-executor.test.js tests/orchestration/action-router.test.js --runInBand`
- `npx eslint services/executors/rlmRuntimeExecutor.js services/executors/sandboxExecutor.js tests/sandbox-executor.test.js`

## Remaining Follow-Ups

- surface backend selection and fallback telemetry to operators
- decide whether JavaScript support should stay on native sandbox only
- expose a workspace or agent policy flag if product wants explicit opt-in instead of env-only activation
- verify the VPS `rlm` binary and env config before enabling in production
