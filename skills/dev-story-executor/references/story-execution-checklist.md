# Story Execution Checklist

## Pre-Implementation

- [ ] **Read entire story file** from top to bottom
- [ ] **Understand all acceptance criteria** - Ask questions if anything unclear
- [ ] **Review related context** - PRD, architecture docs, UX design
- [ ] **Identify dependencies** - What must be done first?
- [ ] **Set up development environment** - Branch, local config, test data
- [ ] **Review coding standards** - Team conventions, patterns, style guide

## For Each Task (In Order)

### 1. Test First (RED Phase)

- [ ] **Write test that describes expected behavior**
  - Unit test for logic/calculations
  - Integration test for component interaction
  - E2E test for user-facing flows
- [ ] **Test fails for the right reason**
  - Not syntax error
  - Not missing dependency
  - Fails because feature doesn't exist yet
- [ ] **Test is focused and minimal**
  - One behavior per test
  - Clear assertion
  - Descriptive test name

### 2. Implement (GREEN Phase)

- [ ] **Write simplest code that passes test**
  - No premature optimization
  - No gold-plating
  - Just enough to go green
- [ ] **Run test - verify it passes**
- [ ] **Run related tests - verify no regression**

### 3. Refactor (REFACTOR Phase)

- [ ] **Improve code quality while keeping tests green**
  - Extract functions/methods for clarity
  - Remove duplication
  - Improve naming
  - Add inline comments for complex logic
- [ ] **Run all tests again after refactoring**

### 4. Task Completion

- [ ] **All tests pass at 100%**
- [ ] **Code reviewed against quality gates** (see quality-gates.md)
- [ ] **Implementation matches acceptance criteria exactly**
- [ ] **Edge cases handled and tested**
- [ ] **Error handling implemented**
- [ ] **Documentation updated** (inline comments, API docs)
- [ ] **Mark task [x] in story file**
- [ ] **Commit with descriptive message** referencing story ID

## After All Tasks Complete

- [ ] **Run full test suite** - All tests pass
- [ ] **Run linter** - No warnings or errors
- [ ] **Run type checker** (if applicable) - No type errors
- [ ] **Manual smoke test** - Feature works end-to-end
- [ ] **Review against quality gates** (see quality-gates.md)
- [ ] **Self code review** (see code-review-checklist.md)
- [ ] **Generate review summary** (see review-summary-template.md)
- [ ] **Update story file with implementation notes**
- [ ] **Mark story complete** and ready for review

## Before Requesting Review

- [ ] **All acceptance criteria met** - Go through each one explicitly
- [ ] **All tests passing** - Run suite one final time
- [ ] **No console warnings or errors** (in dev environment)
- [ ] **Code follows team standards** - Consistent style, naming, patterns
- [ ] **Documentation complete** - README, API docs, inline comments
- [ ] **Branch rebased on main** (if required by team workflow)
- [ ] **Clean commit history** - Squash WIP commits if needed
- [ ] **Review summary prepared** - Make reviewer's job easy

## Red Flags (Stop and Fix)

🚨 **STOP if any of these are true:**

- Tests failing or not running
- Acceptance criteria unclear or ambiguous
- Major technical blocker discovered
- Implementation deviates from story scope
- Security concern identified
- Performance regression detected
- Breaking change without migration plan

**Action:** Communicate with team, update story, get alignment before proceeding.

---

## Tips for Success

✅ **Do:**
- Read the whole story before writing any code
- Write the test first, every time
- Keep commits small and focused
- Document decisions in the story file
- Ask questions early when stuck
- Run tests frequently (after every small change)

❌ **Don't:**
- Skip tasks or change order
- Mark tasks complete without tests
- Accumulate failing tests ("I'll fix later")
- Implement features not in the story
- Commit commented-out code
- Push code that doesn't pass CI

---

**Remember:** A story is not done until tests pass at 100% and all acceptance criteria are met. Quality over speed. Ship confidence, not chaos.
