# Snipara htask Regression Report (2026-03-16)

- Environment: isolated sandbox swarm `cmmt8kvmj000x11i4qcfn9cq3`
- Safety: all operations were executed in a newly created sandbox swarm only

## Summary

| Bug | Status | Evidence | Next Action |
|---|---|---|---|
| 1) rlm_htask_unblock with/without resolution | PASS | with=`{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "new_status": "IN_PROGRESS",   "resolution": "resolved",   "reevaluated_ancestors": [] }`; without=`{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "new_status": "IN_PROGRESS",   "resolution": null,   "reevaluated_ancestors": [] }` | None |
| 2) rlm_htask_create concurrency sequence collision behavior | PASS | parent=`cmmt8l7m5000talq7om6cclfe`; parallel successes=20/20; unique_ids=20/20 | None |
| 3) rlm_htask_update transition behavior (PENDING→IN_PROGRESS + result constraints) | FAIL | status_update=`{   "success": true,   "task_id": "cmmt8lhwm000z10yrf3urcgvy",   "updated_fields": [     "status"   ] }`; premature_result_update=`{   "success": true,   "task_id": "cmmt8lhwm000z10yrf3urcgvy",   "updated_fields": [     "result"   ] }` | Reject result updates before terminal status |
| 4) Full chain block→unblock→complete→verify_closure→close | PASS | close_n2=`{   "success": true,   "task_id": "cmmt8lqq5002011i4dkr8251j",   "status": "COMPLETED",   "closed_with_waiver": false }`; close_n1=`{   "success": true,   "task_id": "cmmt8loiq0011alq71afo1a61",   "status": "COMPLETED",   "closed_with_waiver": false }` | None |

## 1) rlm_htask_unblock with/without resolution (signature/handler consistency) — PASS

- Step 1 `rlm_htask_create`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug1 unblock signature", "description": "unblock variants", "owner": "jarvis"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug1 unblock signature", "description": "unblock variants", "owner": "jarvis"}`
  - Expected behavior: Create task
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "level": "N3_TASK",   "title": "Bug1 unblock signature",   "owner": "jarvis",   "sequence_number": 1 }`
  - Verdict: PASS
- Step 2 `rlm_htask_block`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_block {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "blocker_type": "DEPENDENCY", "blocker_reason": "b1"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "blocker_type": "DEPENDENCY", "blocker_reason": "b1"}`
  - Expected behavior: Block task (round 1)
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "blocker_type": "DEPENDENCY",   "affected_ancestors": [] }`
  - Verdict: PASS
- Step 3 `rlm_htask_unblock`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_unblock {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "resolution": "resolved"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "resolution": "resolved"}`
  - Expected behavior: Unblock with resolution should succeed
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "new_status": "IN_PROGRESS",   "resolution": "resolved",   "reevaluated_ancestors": [] }`
  - Verdict: PASS
- Step 4 `rlm_htask_block`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_block {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "blocker_type": "TECH", "blocker_reason": "b2"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a", "blocker_type": "TECH", "blocker_reason": "b2"}`
  - Expected behavior: Block task (round 2)
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "blocker_type": "TECH",   "affected_ancestors": [] }`
  - Verdict: PASS
- Step 5 `rlm_htask_unblock`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_unblock {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8kxkx001211i41edre09a"}`
  - Expected behavior: Unblock without resolution should succeed
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8kxkx001211i41edre09a",   "new_status": "IN_PROGRESS",   "resolution": null,   "reevaluated_ancestors": [] }`
  - Verdict: PASS

## 2) rlm_htask_create concurrency sequence collision behavior — PASS

- Command/call payload pattern: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id":"cmmt8kvmj000x11i4qcfn9cq3","level":"N2_WORKSTREAM","parent_id":"cmmt8l7m5000talq7om6cclfe","workstream_type":"API",...}` run with 20 parallel workers
- Expected behavior: all 20 creates succeed with no ID/sequence collision
- Actual behavior: 20/20 succeeded; unique IDs 20/20
- Verdict: PASS

## 3) rlm_htask_update transition behavior (PENDING→IN_PROGRESS + result constraints) — FAIL

- Step 1 `rlm_htask_create`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug3 transition", "description": "result constraints", "owner": "jarvis"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug3 transition", "description": "result constraints", "owner": "jarvis"}`
  - Expected behavior: Create task
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lhwm000z10yrf3urcgvy",   "level": "N3_TASK",   "title": "Bug3 transition",   "owner": "jarvis",   "sequence_number": 3 }`
  - Verdict: PASS
- Step 2 `rlm_htask_update`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_update {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lhwm000z10yrf3urcgvy", "updates": {"status": "IN_PROGRESS"}}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lhwm000z10yrf3urcgvy", "updates": {"status": "IN_PROGRESS"}}`
  - Expected behavior: PENDING->IN_PROGRESS should succeed
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lhwm000z10yrf3urcgvy",   "updated_fields": [     "status"   ] }`
  - Verdict: PASS
- Step 3 `rlm_htask_update`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_update {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lhwm000z10yrf3urcgvy", "updates": {"result": "premature result"}}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lhwm000z10yrf3urcgvy", "updates": {"result": "premature result"}}`
  - Expected behavior: Setting result before completion should fail
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lhwm000z10yrf3urcgvy",   "updated_fields": [     "result"   ] }`
  - Verdict: FAIL

## 4) Full chain block→unblock→complete→verify_closure→close — PASS

- Step 1 `rlm_htask_create`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N1_FEATURE", "title": "Bug4 N1", "description": "chain", "owner": "jarvis"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N1_FEATURE", "title": "Bug4 N1", "description": "chain", "owner": "jarvis"}`
  - Expected behavior: Create N1
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8loiq0011alq71afo1a61",   "level": "N1_FEATURE",   "title": "Bug4 N1",   "owner": "jarvis",   "sequence_number": 4 }`
  - Verdict: PASS
- Step 2 `rlm_htask_create`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N2_WORKSTREAM", "title": "Bug4 N2", "description": "chain", "owner": "jarvis", "parent_id": "cmmt8loiq0011alq71afo1a61", "workstream_type": "FRONTEND"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N2_WORKSTREAM", "title": "Bug4 N2", "description": "chain", "owner": "jarvis", "parent_id": "cmmt8loiq0011alq71afo1a61", "workstream_type": "FRONTEND"}`
  - Expected behavior: Create N2 under N1
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lqq5002011i4dkr8251j",   "level": "N2_WORKSTREAM",   "title": "Bug4 N2",   "owner": "jarvis",   "sequence_number": 1 }`
  - Verdict: PASS
- Step 3 `rlm_htask_create`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_create {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug4 N3", "description": "chain", "owner": "jarvis", "parent_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "level": "N3_TASK", "title": "Bug4 N3", "description": "chain", "owner": "jarvis", "parent_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Expected behavior: Create N3 under N2
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lssd002411i4ptdjn8gl",   "level": "N3_TASK",   "title": "Bug4 N3",   "owner": "jarvis",   "sequence_number": 1 }`
  - Verdict: PASS
- Step 4 `rlm_htask_block`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_block {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "blocker_type": "TECH", "blocker_reason": "waiting fixture"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "blocker_type": "TECH", "blocker_reason": "waiting fixture"}`
  - Expected behavior: Block N3
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lssd002411i4ptdjn8gl",   "blocker_type": "TECH",   "affected_ancestors": [     "cmmt8lqq5002011i4dkr8251j",     "cmmt8loiq0011alq71afo1a61"   ] }`
  - Verdict: PASS
- Step 5 `rlm_htask_unblock`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_unblock {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "resolution": "fixture ready"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "resolution": "fixture ready"}`
  - Expected behavior: Unblock N3
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lssd002411i4ptdjn8gl",   "new_status": "IN_PROGRESS",   "resolution": "fixture ready",   "reevaluated_ancestors": [     "cmmt8lqq5002011i4dkr8251j",     "cmmt8loiq0011alq71afo1a61"   ] }`
  - Verdict: PASS
- Step 6 `rlm_htask_complete`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_complete {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "evidence": "regression-evidence", "result": "done"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lssd002411i4ptdjn8gl", "evidence": "regression-evidence", "result": "done"}`
  - Expected behavior: Complete N3
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lssd002411i4ptdjn8gl",   "status": "COMPLETED",   "auto_closed_parent": "cmmt8lqq5002011i4dkr8251j" }`
  - Verdict: PASS
- Step 7 `rlm_htask_verify_closure`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_verify_closure {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Expected behavior: Verify closure N2
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lqq5002011i4dkr8251j",   "can_close": true,   "blockers": [],   "needs_waiver": false,   "incomplete_children": 0,   "total_children": 1 }`
  - Verdict: PASS
- Step 8 `rlm_htask_close`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_close {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8lqq5002011i4dkr8251j"}`
  - Expected behavior: Close N2
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8lqq5002011i4dkr8251j",   "status": "COMPLETED",   "closed_with_waiver": false }`
  - Verdict: PASS
- Step 9 `rlm_htask_verify_closure`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_verify_closure {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8loiq0011alq71afo1a61"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8loiq0011alq71afo1a61"}`
  - Expected behavior: Verify closure N1
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8loiq0011alq71afo1a61",   "can_close": true,   "blockers": [],   "needs_waiver": false,   "incomplete_children": 0,   "total_children": 1 }`
  - Verdict: PASS
- Step 10 `rlm_htask_close`
  - Command: `/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_htask_close {"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8loiq0011alq71afo1a61"}`
  - Call payload: `{"swarm_id": "cmmt8kvmj000x11i4qcfn9cq3", "task_id": "cmmt8loiq0011alq71afo1a61"}`
  - Expected behavior: Close N1
  - Actual behavior: `{   "success": true,   "task_id": "cmmt8loiq0011alq71afo1a61",   "status": "COMPLETED",   "closed_with_waiver": false }`
  - Verdict: PASS

## Failures: precise reproduction + fix recommendation

- Reproduction: task `cmmt8lhwm000z10yrf3urcgvy` -> update status `IN_PROGRESS` -> update `result` before completion.
- Fix recommendation: deny `updates.result` unless status is terminal (`COMPLETED/CLOSED`) and return validation error.
