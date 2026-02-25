# Quality Gates

Quality gates are **mandatory checkpoints** before code moves to the next stage. A story cannot be marked complete unless it passes all quality gates.

---

## Gate 1: Functional Completeness

### All Acceptance Criteria Met
- [ ] Every AC from story file implemented exactly as specified
- [ ] No deviations or "creative interpretations"
- [ ] Edge cases handled as defined in ACs
- [ ] Error conditions handled as specified

### Feature Works End-to-End
- [ ] Manual smoke test performed successfully
- [ ] Feature works in development environment
- [ ] No console errors or warnings (browser/server)
- [ ] All user flows complete successfully

### No Scope Creep
- [ ] Only implemented what's in the story
- [ ] No "bonus features" added without approval
- [ ] No technical debt created for convenience

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 2: Test Coverage

### Unit Tests
- [ ] All functions/methods have unit tests
- [ ] Happy path covered
- [ ] Edge cases covered
- [ ] Error conditions covered
- [ ] Test coverage ≥ 80% (or team standard)

### Integration Tests
- [ ] Component interactions tested
- [ ] API endpoints tested (if applicable)
- [ ] Database operations tested (if applicable)
- [ ] External service interactions mocked/tested

### E2E Tests (if applicable)
- [ ] Critical user flows have E2E tests
- [ ] Tests run in CI environment
- [ ] Tests are deterministic (no flaky tests)

### All Tests Pass
- [ ] 100% of tests passing locally
- [ ] No skipped or ignored tests
- [ ] Test suite runs cleanly (no warnings)
- [ ] Tests complete in reasonable time

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 3: Code Quality

### Readability
- [ ] Code is self-documenting (clear names, simple logic)
- [ ] Complex logic has inline comments explaining WHY
- [ ] Functions/methods are focused (single responsibility)
- [ ] No "clever" code that obscures intent

### Maintainability
- [ ] No code duplication (DRY principle)
- [ ] Functions/classes are appropriately sized
- [ ] Dependencies are clear and minimal
- [ ] Code follows team conventions and style guide

### Standards Compliance
- [ ] Linter passes (no warnings or errors)
- [ ] Type checker passes (if applicable)
- [ ] Formatter applied (if applicable)
- [ ] Naming conventions followed

### Error Handling
- [ ] Errors are caught and handled appropriately
- [ ] User-facing errors have clear messages
- [ ] System errors logged with context
- [ ] No silent failures or swallowed exceptions

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 4: Security

### Input Validation
- [ ] All user input validated
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (escaped output, CSP headers)
- [ ] CSRF protection in place (if applicable)

### Authentication & Authorization
- [ ] Auth checks in place for protected resources
- [ ] User permissions verified before sensitive operations
- [ ] Session management secure
- [ ] No hardcoded credentials or secrets

### Data Protection
- [ ] Sensitive data encrypted at rest/in transit
- [ ] PII handled according to privacy policy
- [ ] No sensitive data in logs
- [ ] Secure defaults (fail closed, not open)

### Dependencies
- [ ] No known vulnerabilities in dependencies
- [ ] Dependencies up to date (or documented why not)
- [ ] Minimal dependency footprint

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 5: Performance

### Efficiency
- [ ] No obvious performance bottlenecks
- [ ] Database queries optimized (indexes, no N+1)
- [ ] API responses within acceptable time
- [ ] Resource usage reasonable (memory, CPU)

### Scalability
- [ ] Code handles expected load
- [ ] No hardcoded limits that will break at scale
- [ ] Pagination/chunking for large data sets
- [ ] Caching used where appropriate

### Monitoring
- [ ] Key operations logged for debugging
- [ ] Performance metrics instrumented (if applicable)
- [ ] Errors reported to monitoring system

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 6: Documentation

### Code Documentation
- [ ] Public APIs documented (JSDoc, docstrings, etc.)
- [ ] Complex algorithms explained
- [ ] TODOs removed or tracked in backlog
- [ ] No commented-out code

### Project Documentation
- [ ] README updated (if applicable)
- [ ] API docs updated (if applicable)
- [ ] Migration guide written (if breaking change)
- [ ] Deployment notes documented

### Story Documentation
- [ ] Implementation notes in story file
- [ ] Technical decisions documented
- [ ] Known limitations documented
- [ ] Follow-up tasks identified

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Gate 7: Integration

### Version Control
- [ ] Clean commit history (squashed if needed)
- [ ] Descriptive commit messages
- [ ] No merge conflicts
- [ ] Branch up to date with main/develop

### CI/CD
- [ ] All CI checks pass (build, lint, test)
- [ ] No breaking changes to CI pipeline
- [ ] Deployment script works (if applicable)

### Backwards Compatibility
- [ ] No breaking changes (or documented migration plan)
- [ ] Database migrations tested
- [ ] API versioning respected
- [ ] Feature flags used for risky changes (if applicable)

**Status:** 🟢 PASS | 🔴 FAIL | ⚠️ NEEDS REVIEW

---

## Quality Gate Summary

**Story ID:** _____________  
**Developer:** _____________  
**Date:** _____________

| Gate | Status | Notes |
|------|--------|-------|
| 1. Functional Completeness | 🟢 🔴 ⚠️ | |
| 2. Test Coverage | 🟢 🔴 ⚠️ | |
| 3. Code Quality | 🟢 🔴 ⚠️ | |
| 4. Security | 🟢 🔴 ⚠️ | |
| 5. Performance | 🟢 🔴 ⚠️ | |
| 6. Documentation | 🟢 🔴 ⚠️ | |
| 7. Integration | 🟢 🔴 ⚠️ | |

**Overall Status:** 🟢 READY FOR REVIEW | 🔴 NOT READY | ⚠️ NEEDS DISCUSSION

**Reviewer Notes:**

---

## When to Escalate

🚨 **Stop and escalate if:**

- Security vulnerability discovered
- Performance regression detected
- Breaking change identified
- Major architectural issue found
- Scope significantly larger than estimated
- Dependencies blocking progress

**Action:** Notify team lead, update story with findings, propose solutions.

---

## Quality Gate Enforcement

**Pre-Review (Developer):**
- Developer self-reviews against all gates
- All gates must be 🟢 PASS before requesting review
- ⚠️ NEEDS REVIEW items documented with justification

**Code Review (Peer):**
- Reviewer validates quality gates independently
- Reviewer has authority to send back for any 🔴 FAIL
- Reviewer can approve with minor ⚠️ if justified

**Merge (Lead/Maintainer):**
- Final quality gate check before merge
- All CI checks must pass
- At least one approval required
- No unresolved review comments

---

**Philosophy:** Quality gates protect the codebase and the team. They're not bureaucracy—they're insurance against bugs, outages, and 3am wake-up calls. Respect the gates.
