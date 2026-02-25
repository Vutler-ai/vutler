# Code Review Checklist

Use this checklist for **self-review before requesting peer review** and for **peer review validation**.

---

## 1. Correctness

### Logic & Behavior
- [ ] Code does what the story requires (all ACs met)
- [ ] Edge cases handled correctly
- [ ] Boundary conditions tested
- [ ] Off-by-one errors checked
- [ ] Logic flows are clear and correct

### Error Handling
- [ ] All error paths handled
- [ ] User-facing errors have helpful messages
- [ ] System errors logged with context
- [ ] No silent failures
- [ ] Proper exception types used
- [ ] Resources cleaned up in error cases (files, connections, etc.)

### Data Handling
- [ ] Null/undefined checks in place
- [ ] Type conversions handled safely
- [ ] Data validation at boundaries
- [ ] No data loss in transformations
- [ ] Immutability respected where needed

---

## 2. Tests

### Coverage
- [ ] All new code has unit tests
- [ ] Happy path tested
- [ ] Edge cases tested
- [ ] Error conditions tested
- [ ] Integration points tested
- [ ] Test coverage ≥ 80% (or team standard)

### Quality
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests are fast
- [ ] Tests are isolated (no dependencies between tests)
- [ ] Test names clearly describe what's being tested
- [ ] Assertions are meaningful (not just `toBeTruthy()`)
- [ ] Test data is realistic and meaningful

### Completeness
- [ ] All tests pass
- [ ] No skipped/ignored tests without justification
- [ ] No console warnings during test run
- [ ] Tests run successfully in CI environment

---

## 3. Security

### Input Validation
- [ ] All user input validated
- [ ] Whitelisting used (not just blacklisting)
- [ ] Input size limits enforced
- [ ] File uploads validated (type, size, content)

### Injection Prevention
- [ ] SQL queries parameterized (no string concatenation)
- [ ] HTML output escaped (XSS prevention)
- [ ] Command execution avoided (or properly sanitized)
- [ ] LDAP injection prevented

### Authentication & Authorization
- [ ] Auth checks before sensitive operations
- [ ] User permissions verified
- [ ] Session management secure
- [ ] No authentication bypass possible

### Data Protection
- [ ] Sensitive data encrypted
- [ ] No secrets in code (use env vars/secrets manager)
- [ ] No sensitive data in logs
- [ ] PII handled according to privacy requirements
- [ ] Secure random used for cryptography (not Math.random())

### Dependencies
- [ ] No known vulnerabilities (run `npm audit` or equivalent)
- [ ] Dependencies from trusted sources
- [ ] Minimal dependency footprint

---

## 4. Performance

### Efficiency
- [ ] No obvious bottlenecks (nested loops, repeated calculations)
- [ ] Database queries optimized (indexes used, no N+1 queries)
- [ ] API calls batched where possible
- [ ] Caching used appropriately
- [ ] Lazy loading for expensive operations

### Scalability
- [ ] Code handles expected load
- [ ] Pagination for large data sets
- [ ] No hardcoded limits that will break
- [ ] Resource cleanup (connections, file handles, timers)

### Resource Usage
- [ ] Memory usage reasonable (no leaks)
- [ ] CPU usage reasonable
- [ ] Network calls minimized
- [ ] File I/O optimized

---

## 5. Maintainability

### Readability
- [ ] Code is self-explanatory (clear variable/function names)
- [ ] Logic is simple and straightforward
- [ ] No "clever" code that obscures intent
- [ ] Consistent formatting
- [ ] Reasonable line/function length

### Comments & Documentation
- [ ] Complex logic explained (WHY, not WHAT)
- [ ] Public APIs documented (JSDoc, docstrings, etc.)
- [ ] TODOs tracked or removed
- [ ] No commented-out code

### Structure
- [ ] Functions/methods have single responsibility
- [ ] Classes are cohesive
- [ ] Appropriate abstraction level
- [ ] No code duplication (DRY)
- [ ] Separation of concerns

### Naming
- [ ] Variables/functions named clearly
- [ ] Naming follows team conventions
- [ ] No abbreviations (unless standard)
- [ ] Boolean variables are questions (isValid, hasPermission)

---

## 6. Design & Architecture

### Patterns
- [ ] Appropriate design patterns used
- [ ] No anti-patterns (God Object, Spaghetti Code, etc.)
- [ ] SOLID principles followed
- [ ] Composition over inheritance where appropriate

### Dependencies
- [ ] Minimal coupling between modules
- [ ] Dependencies injected (not hardcoded)
- [ ] Circular dependencies avoided
- [ ] Interface/contract-driven design

### Extensibility
- [ ] Open for extension, closed for modification
- [ ] Easy to add new features
- [ ] Configuration externalized
- [ ] Feature flags for risky changes (if applicable)

---

## 7. Standards & Conventions

### Code Style
- [ ] Linter passes (zero warnings)
- [ ] Formatter applied
- [ ] Team style guide followed
- [ ] Consistent indentation and spacing

### Naming Conventions
- [ ] camelCase/snake_case/PascalCase per language/team standard
- [ ] File naming consistent
- [ ] Class names are nouns
- [ ] Function names are verbs

### Project Structure
- [ ] Files in correct directories
- [ ] Imports organized
- [ ] No circular file dependencies
- [ ] Related code co-located

---

## 8. Integration & Deployment

### Version Control
- [ ] Commits are atomic and focused
- [ ] Commit messages descriptive (what and why)
- [ ] No merge conflicts
- [ ] Branch up to date with main/develop
- [ ] No accidental commits (secrets, debug code, temp files)

### CI/CD
- [ ] All CI checks pass
- [ ] Build succeeds
- [ ] Linter passes
- [ ] Tests pass
- [ ] Deployment script works (if applicable)

### Backwards Compatibility
- [ ] No breaking changes (or migration plan documented)
- [ ] API versioning respected
- [ ] Database migrations tested
- [ ] Graceful degradation for optional features

---

## 9. Observability

### Logging
- [ ] Important operations logged
- [ ] Log levels appropriate (debug, info, warn, error)
- [ ] No sensitive data in logs
- [ ] Structured logging used (JSON, key-value pairs)

### Monitoring
- [ ] Metrics instrumented (if applicable)
- [ ] Errors reported to monitoring system
- [ ] Performance tracked for critical paths

### Debugging
- [ ] Error messages include context
- [ ] Stack traces preserved
- [ ] Debug information available in non-production environments

---

## 10. User Experience

### Functionality
- [ ] Feature works as expected from user perspective
- [ ] UI responsive and intuitive
- [ ] Loading states shown for async operations
- [ ] Error messages user-friendly

### Accessibility (if UI)
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast sufficient
- [ ] Alt text for images

### Performance (User-Facing)
- [ ] Page load time acceptable
- [ ] No janky animations
- [ ] Smooth scrolling
- [ ] Responsive on mobile (if applicable)

---

## Review Summary Template

**Story ID:** ___________  
**Author:** ___________  
**Reviewer:** ___________  
**Date:** ___________

### Overall Assessment
- [ ] **APPROVE** - Ready to merge
- [ ] **APPROVE WITH COMMENTS** - Minor issues, can merge after addressed
- [ ] **REQUEST CHANGES** - Must fix before merge
- [ ] **NEEDS DISCUSSION** - Major concerns, requires team discussion

### Strengths
- What did the author do well?

### Issues Found
| Severity | Category | Description | Line/File |
|----------|----------|-------------|-----------|
| 🔴 Critical | Security | SQL injection vulnerability | user.service.js:42 |
| ⚠️ Major | Tests | Missing edge case test | calculateDiscount.test.js |
| 💡 Minor | Style | Variable name unclear | utils.js:15 |

**Severity Guide:**
- 🔴 **Critical:** Must fix before merge (security, correctness, breaking changes)
- ⚠️ **Major:** Should fix before merge (tests, maintainability, performance)
- 💡 **Minor:** Consider fixing (style, readability, nice-to-haves)

### Suggestions for Improvement
- Ideas for refactoring, optimization, or future enhancements

### Questions
- Anything unclear or requiring clarification

### Action Items
- [ ] Fix SQL injection in user.service.js:42
- [ ] Add edge case test for zero discount
- [ ] Rename variable `x` to `discountAmount`

---

## Reviewer Tips

### For Self-Review
- Review your own code like you're reviewing someone else's
- Step away for 15 minutes, then review fresh
- Read the diff, not just the code in your editor
- Check one dimension at a time (first correctness, then tests, then style, etc.)

### For Peer Review
- Be kind and constructive
- Praise good decisions, not just point out flaws
- Explain WHY something is an issue, not just WHAT
- Offer solutions, not just criticism
- Ask questions instead of making demands
- Remember: you're reviewing code, not the person

### Red Flags (Stop and Investigate)
- Large diffs (>500 lines) - hard to review thoroughly
- No tests added
- Commented-out code
- TODOs without context
- Hard-coded values (magic numbers, URLs, credentials)
- Console.log statements left in
- Try-catch with empty catch block

---

**Remember:** Code review is a conversation, not a judgment. The goal is to ship quality code and learn from each other. Be thorough, be kind, be collaborative.
