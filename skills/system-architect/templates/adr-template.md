# ADR-[NUMBER]: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded  
**Date:** YYYY-MM-DD  
**Deciders:** [List of people involved]  
**Technical Story:** [Link to related PRD, epic, or ticket]

---

## Context

[Describe the forces at play: technical, organizational, political, market. What is the current situation that requires a decision?]

**Example:**
"We need to choose a database for our new analytics feature. Current PostgreSQL instance is approaching capacity limits. Analytics queries are slowing down transactional workloads. Team has expertise in SQL databases but is open to learning new technologies if there's clear value."

---

## Decision

[State the decision clearly and concisely.]

**Example:**
"We will use a separate PostgreSQL instance for analytics workloads, with read replicas for query scaling."

---

## Options Considered

### Option 1: [Option Name]

**Description:**  
[Brief description of the approach]

**Pros:**
- ✅ [Advantage]
- ✅ [Advantage]

**Cons:**
- ❌ [Disadvantage]
- ❌ [Disadvantage]

**Estimated Effort:** [Low | Medium | High]  
**Risk Level:** [Low | Medium | High]

---

### Option 2: [Option Name]

**Description:**  
[Brief description of the approach]

**Pros:**
- ✅ [Advantage]
- ✅ [Advantage]

**Cons:**
- ❌ [Disadvantage]
- ❌ [Disadvantage]

**Estimated Effort:** [Low | Medium | High]  
**Risk Level:** [Low | Medium | High]

---

### Option 3: [Option Name]

[Repeat structure for each option]

---

## Decision Rationale

[Explain WHY this decision was made. What criteria were most important? What trade-offs were accepted?]

**Key Criteria:**
1. **[Criterion 1]:** [Why it matters and how options scored]
2. **[Criterion 2]:** [Why it matters and how options scored]
3. **[Criterion 3]:** [Why it matters and how options scored]

**Example:**
"Performance and team expertise were the primary drivers. While a NoSQL solution like ClickHouse might offer better analytics performance, our team's deep PostgreSQL expertise allows us to ship faster and maintain the system confidently. The performance gap is acceptable given our current scale (< 1M rows/day). We can revisit if we reach 10M+ rows/day."

---

## Consequences

### Positive
- ✅ [Benefit of this decision]
- ✅ [Benefit of this decision]

### Negative
- ⚠️ [Trade-off or limitation accepted]
- ⚠️ [Trade-off or limitation accepted]

### Neutral
- ℹ️ [Change or impact that's neither good nor bad]

---

## Implementation Plan

**Phase 1:** [Initial steps]
- [ ] Task 1
- [ ] Task 2

**Phase 2:** [Follow-up work]
- [ ] Task 1
- [ ] Task 2

**Timeline:** [Expected duration]  
**Owner:** [Responsible person/team]

---

## Validation & Success Criteria

**How we'll know this was the right decision:**
- [Measurable outcome 1]
- [Measurable outcome 2]
- [Measurable outcome 3]

**When to revisit this decision:**
- If [condition] occurs
- After [time period] of usage
- When [metric] reaches [threshold]

---

## References

- [Link to related PRD]
- [Link to technical spike]
- [Link to benchmark data]
- [Link to vendor documentation]

---

## Notes

[Any additional context, discussion summaries, or open questions]
