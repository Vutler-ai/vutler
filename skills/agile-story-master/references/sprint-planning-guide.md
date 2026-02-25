# Sprint Planning Guide

Complete guide for facilitating effective sprint planning ceremonies.

---

## Sprint Planning Overview

**Purpose:** Plan the work to be performed in the sprint.

**Attendees:** Scrum Master, Product Owner, Development Team

**Duration:** 2-4 hours for 2-week sprint (adjust proportionally)

**Outputs:**
1. Sprint Goal
2. Sprint Backlog (selected stories)
3. Team commitment
4. Definition of Done agreement

---

## Pre-Planning Preparation

### Scrum Master Checklist
- [ ] Schedule sprint planning meeting
- [ ] Ensure backlog is groomed (top stories ready)
- [ ] Verify team availability (PTO, meetings)
- [ ] Calculate team capacity
- [ ] Prepare planning tools (board, estimation cards, etc.)
- [ ] Review previous sprint velocity
- [ ] Gather data from last sprint (completed points, blockers)

### Product Owner Checklist
- [ ] Prioritize backlog
- [ ] Ensure top stories have clear acceptance criteria
- [ ] Prepare to answer questions about requirements
- [ ] Define sprint goal candidates
- [ ] Identify dependencies between stories

### Team Checklist
- [ ] Review groomed backlog before meeting
- [ ] Prepare questions about unclear requirements
- [ ] Review technical dependencies

---

## Sprint Planning Ceremony

### Part 1: What Will We Build? (60-90 min)

**Objective:** Select stories for the sprint.

#### Step 1: Product Owner Presents Sprint Goal
- Product Owner proposes sprint goal (theme/objective)
- Explain why this goal matters (business value)
- Present top-priority stories aligned with goal

**Example Sprint Goal:**
> "Enable users to complete checkout with discount codes, improving conversion by 15%."

#### Step 2: Calculate Team Capacity

**Formula:**
```
Sprint Capacity = (Team Size × Sprint Days × Focus Factor) - Known Absences
```

**Factors to consider:**
- **Velocity:** Historical average story points completed per sprint
- **Team size:** Number of developers
- **Sprint length:** Days in sprint (typically 10 working days for 2 weeks)
- **Focus factor:** % of time spent on sprint work (typically 60-75%)
- **Known absences:** PTO, conferences, training
- **Meetings:** Sprint ceremonies, stand-ups (typically 5-10% of time)

**Example:**
```
Team: 4 developers
Sprint: 10 days
Velocity (last 3 sprints): 32, 28, 34 → Average: 31 points
PTO: 1 developer out 2 days = -4 points
Capacity: ~27 points (conservative)
```

#### Step 3: Review and Clarify Stories

For each top-priority story:
- [ ] Product Owner explains the "why" (business value)
- [ ] Team asks clarifying questions
- [ ] Confirm acceptance criteria are clear
- [ ] Identify dependencies
- [ ] Surface technical concerns

**Stop and refine if:**
- Acceptance criteria unclear
- Story too large (needs splitting)
- Dependencies blocking
- Technical approach uncertain

#### Step 4: Select Stories for Sprint

- Start with highest priority stories
- Add stories until capacity reached
- Leave 10-20% buffer for unknowns
- Ensure selected stories support sprint goal

**Selection Checklist:**
- [ ] Stories align with sprint goal
- [ ] Total points ≤ team capacity
- [ ] Dependencies manageable
- [ ] No blockers preventing start
- [ ] Team has skills needed

---

### Part 2: How Will We Build It? (60-90 min)

**Objective:** Break down stories into tasks.

#### Step 5: Task Breakdown

For each selected story:
- [ ] Identify all tasks needed (design, code, test, deploy, etc.)
- [ ] Estimate tasks in hours
- [ ] Assign initial task owners (optional)
- [ ] Identify sub-tasks if complex

**Task Categories:**
- **Design:** UX mockups, architecture decisions
- **Frontend:** UI components, styling, client logic
- **Backend:** APIs, database, business logic
- **Testing:** Unit tests, integration tests, E2E tests
- **Infrastructure:** Deployment, config, monitoring
- **Documentation:** API docs, user guides, README updates

**Task Template:**
```markdown
- [ ] Create discount code validation endpoint (Backend, 4h)
- [ ] Add discount code input field to checkout UI (Frontend, 2h)
- [ ] Write unit tests for discount validation (Testing, 3h)
- [ ] Update checkout E2E tests (Testing, 2h)
- [ ] Deploy to staging (Infrastructure, 1h)
```

#### Step 6: Identify Risks and Dependencies

For sprint as a whole:
- [ ] List external dependencies (other teams, 3rd party services)
- [ ] Identify technical risks
- [ ] Note knowledge gaps
- [ ] Plan mitigation strategies

**Example:**
```markdown
**Risks:**
- Payment gateway API might be unstable (mitigate: test thoroughly in staging)
- New team member learning React (mitigate: pair programming)

**Dependencies:**
- UX team to finalize checkout flow mockups (by Day 2)
- DevOps to provision Redis instance (by Day 3)
```

#### Step 7: Definition of Done

Confirm team agreement on "Definition of Done":
- [ ] Code complete and reviewed
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Acceptance criteria met
- [ ] Deployed to staging
- [ ] Product Owner acceptance
- [ ] Documentation updated

---

### Part 3: Commitment (15-30 min)

#### Step 8: Team Commitment

**Scrum Master asks:**
> "Based on our capacity, selected stories, and identified risks, can the team commit to this sprint goal?"

**Team discusses:**
- Is scope realistic?
- Are there hidden complexities?
- Do we have the skills/resources needed?
- What could go wrong?

**Possible outcomes:**
1. **Full commitment:** "Yes, we can deliver this."
2. **Conditional commitment:** "Yes, if dependency X is resolved by Day 3."
3. **Reduced scope:** "Too ambitious, let's remove Story Y."
4. **Defer to next sprint:** "Not ready, needs more clarification."

**Scrum Master documents:**
- Sprint goal (final version)
- Committed stories
- Known risks and mitigation
- Conditions for success

#### Step 9: Finalize Sprint Backlog

- [ ] Move selected stories to "Sprint Backlog"
- [ ] Update sprint board
- [ ] Set story status to "Committed"
- [ ] Schedule daily stand-ups
- [ ] Plan first pair programming sessions (if applicable)

---

## Sprint Planning Anti-Patterns

### ❌ Product Owner Absence
**Problem:** Can't answer questions, delays decisions  
**Fix:** Make PO attendance mandatory, have backup if needed

### ❌ Unprepared Backlog
**Problem:** Spend planning time clarifying requirements  
**Fix:** Groom backlog in advance, ensure top stories ready

### ❌ No Capacity Calculation
**Problem:** Over-commitment, burnout, missed goals  
**Fix:** Use velocity and focus factor, be conservative

### ❌ Scope Creep During Sprint
**Problem:** New stories added mid-sprint  
**Fix:** Protect sprint commitment, defer to next sprint

### ❌ Too Much Work in Progress (WIP)
**Problem:** Nothing gets done, context switching overhead  
**Fix:** Limit WIP, finish stories before starting new ones

### ❌ Skipping Task Breakdown
**Problem:** Hidden complexity, surprises mid-sprint  
**Fix:** Break down every story into tasks with estimates

### ❌ No Definition of Done
**Problem:** Disagreement on "complete"  
**Fix:** Explicitly define and document DoD

---

## Sprint Planning Techniques

### Technique 1: Planning Poker

**Purpose:** Collaborative story estimation.

**Process:**
1. Product Owner reads story
2. Team discusses and asks questions
3. Each member selects estimate card (Fibonacci: 1, 2, 3, 5, 8, 13, 21)
4. Reveal simultaneously
5. Discuss outliers (why high? why low?)
6. Re-estimate until consensus

**Benefits:**
- Engages whole team
- Surfaces different perspectives
- Avoids anchoring bias

### Technique 2: T-Shirt Sizing

**Purpose:** Quick, rough estimation.

**Sizes:**
- **XS:** Trivial (< 2 hours)
- **S:** Small (< 1 day)
- **M:** Medium (1-2 days)
- **L:** Large (3-5 days)
- **XL:** Extra Large (> 1 week, needs splitting)

**Use when:**
- Initial backlog estimation
- High-level roadmap planning
- Stories too vague for points

### Technique 3: Story Mapping

**Purpose:** Visualize user journey and prioritize stories.

**Process:**
1. Identify user activities (horizontal)
2. Break activities into tasks (vertical)
3. Prioritize tasks by value
4. Group into releases/sprints

**Example:**
```
User Journey: Online Shopping

[Browse Products] → [Add to Cart] → [Checkout] → [Confirm Order]
     ↓                  ↓              ↓             ↓
  - Search          - View cart    - Enter info  - Email confirm
  - Filter          - Update qty   - Apply code  - Order history
  - Sort            - Remove item  - Payment     - Track shipment
```

---

## Sprint Planning Checklist

### Before Planning
- [ ] Backlog groomed (top 10-15 stories ready)
- [ ] Stories have acceptance criteria
- [ ] Team availability confirmed
- [ ] Velocity calculated
- [ ] Planning meeting scheduled

### During Planning
- [ ] Sprint goal defined
- [ ] Team capacity calculated
- [ ] Stories selected (aligned with goal)
- [ ] Stories broken into tasks
- [ ] Risks and dependencies identified
- [ ] Definition of Done confirmed
- [ ] Team commitment obtained

### After Planning
- [ ] Sprint backlog finalized
- [ ] Sprint board updated
- [ ] Daily stand-up scheduled
- [ ] Risks and dependencies documented
- [ ] Sprint record created (see sprint-record-template.md)

---

## Sprint Planning Output: Sprint Record

See `sprint-record-template.md` for full template.

**Key sections:**
1. **Sprint Goal:** What we're achieving
2. **Team Capacity:** Points available
3. **Committed Stories:** What we're building
4. **Tasks:** How we're building it
5. **Risks & Dependencies:** What could go wrong
6. **Definition of Done:** What "complete" means
7. **Daily Progress:** Track during sprint

---

## Facilitation Tips

### For Scrum Master

**Do:**
- ✅ Timeboxes are sacred (use timer)
- ✅ Park tangential discussions (parking lot)
- ✅ Encourage quiet voices to speak
- ✅ Protect team from unrealistic expectations
- ✅ Make risks visible early
- ✅ Celebrate commitment when achieved

**Don't:**
- ❌ Let Product Owner dominate technical decisions
- ❌ Allow scope creep during planning
- ❌ Skip capacity calculation
- ❌ Ignore team concerns about estimates
- ❌ Accept vague acceptance criteria
- ❌ Pressure team into unrealistic commitment

### For Product Owner

**Do:**
- ✅ Prioritize ruthlessly
- ✅ Explain business value clearly
- ✅ Answer questions quickly
- ✅ Be flexible on implementation details
- ✅ Trust team's technical decisions

**Don't:**
- ❌ Add stories mid-sprint
- ❌ Change priorities without discussion
- ❌ Micromanage implementation
- ❌ Dismiss technical concerns
- ❌ Skip acceptance criteria

### For Development Team

**Do:**
- ✅ Ask clarifying questions
- ✅ Surface technical risks early
- ✅ Provide realistic estimates
- ✅ Collaborate on solutions
- ✅ Commit only to what's achievable

**Don't:**
- ❌ Sandbag estimates (inflating for buffer)
- ❌ Accept unclear requirements
- ❌ Ignore dependencies
- ❌ Work on unplanned stories
- ❌ Skip testing/documentation to "save time"

---

**Remember:** Sprint planning is an investment. Two hours of good planning saves days of confusion and rework. Make it count.
