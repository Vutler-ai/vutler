# PRD Validation Checklist

Use this checklist to validate that a PRD is complete, lean, well-organized, and ready for architecture, UX, and development.

---

## ✅ Completeness

### Problem & Opportunity
- [ ] Problem statement is specific and evidence-based (not assumed)
- [ ] User impact is quantified (frequency, severity, cost)
- [ ] Business opportunity is clear with market context
- [ ] "Why now?" is answered with compelling rationale
- [ ] Current workarounds are documented

### Users
- [ ] At least one primary persona is fully documented
- [ ] User behaviors and workflows are described
- [ ] Pain points are ranked by severity and frequency
- [ ] Jobs-to-be-Done are clearly articulated
- [ ] Decision criteria and authority are identified

### Solution
- [ ] Value proposition is clear and differentiated
- [ ] Core user experience is described narratively
- [ ] Features are categorized (Must-have, Should-have, Nice-to-have)
- [ ] Each feature has acceptance criteria
- [ ] Out-of-scope items are explicitly listed

### Success Metrics
- [ ] Primary (North Star) metric is defined
- [ ] Success criteria are measurable and time-bound
- [ ] Baseline and target values are specified
- [ ] Measurement method is clear

### Research & Validation
- [ ] User research is documented (method, participants, findings)
- [ ] Key insights are evidence-based
- [ ] Assumptions to validate are listed with validation plan
- [ ] Competitive analysis includes 2+ competitors

### Technical & UX
- [ ] Technical constraints are documented
- [ ] Dependencies are identified
- [ ] High-level architecture direction is provided
- [ ] UX principles and key flows are outlined

### Risks & GTM
- [ ] Top 3-5 risks identified with mitigation strategies
- [ ] Launch strategy includes phases and dates
- [ ] Marketing messages are defined

---

## 📏 Leanness (Smallest Viable Scope)

- [ ] Feature set represents **minimum** needed to validate hypothesis
- [ ] No "nice-to-have" features are in P0/Must-have list
- [ ] Each P0 feature directly addresses a critical pain point
- [ ] Scope can be delivered in reasonable timeframe (not 6+ months)
- [ ] If scope feels large, can it be split into smaller releases?

**Red flags:**
- "We should probably also add..."
- Feature list longer than 10 P0 items
- No clear MVP defined
- "While we're at it..." features

---

## 🎯 Clarity & Coherence

### Alignment
- [ ] Features clearly map to user pain points
- [ ] Success metrics directly measure user outcomes (not outputs)
- [ ] Technical constraints don't override user value
- [ ] UX principles support user goals
- [ ] Business goals align with user needs

### Internal Consistency
- [ ] No contradictions between sections
- [ ] Persona needs match feature set
- [ ] Success metrics match stated goals
- [ ] Timeline is realistic given scope

### Precision
- [ ] Vague language is replaced with specifics ("improve" → "reduce by 30%")
- [ ] Ambiguous terms are defined
- [ ] No "TBD" or "To be determined" items in critical sections
- [ ] Acceptance criteria are testable

---

## 📖 Organization & Readability

- [ ] Executive summary clearly captures what, why, success
- [ ] Sections follow logical flow
- [ ] Tables/bullets used for scanability
- [ ] Technical jargon is minimized or explained
- [ ] Length is appropriate (not 20+ pages for an MVP)

---

## 🚀 Implementation Readiness

### Ready for Architecture
- [ ] Technical constraints are documented
- [ ] Integration points are identified
- [ ] Performance/scale requirements are stated
- [ ] Security/compliance needs are listed

### Ready for UX
- [ ] Key user flows are outlined
- [ ] UX principles are stated
- [ ] Accessibility requirements are clear
- [ ] User research insights are provided

### Ready for Story Creation
- [ ] Features have clear acceptance criteria
- [ ] Edge cases and error states are considered
- [ ] Dependencies between features are noted
- [ ] Success metrics are measurable

---

## ⚠️ Common Issues to Check

### Problem with the Problem
- [ ] **Symptom vs. root cause:** Is the stated problem actually the underlying issue?
- [ ] **Solution in disguise:** Is the "problem" actually a solution? (e.g., "We need a dashboard")
- [ ] **Assumed problem:** Is there evidence users actually experience this?

### Feature Bloat
- [ ] **Gold-plating:** Are features included "just in case" or based on real needs?
- [ ] **Scope creep:** Has the MVP grown beyond the original hypothesis?
- [ ] **Missing prioritization:** Are P0 and P1 features truly differentiated?

### Vague Success
- [ ] **Vanity metrics:** Are we measuring outputs (features shipped) vs. outcomes (user value)?
- [ ] **No baseline:** Do we know the current state to measure improvement?
- [ ] **Unrealistic targets:** Are goals achievable given constraints?

### Weak Research
- [ ] **Assumption-based:** Is the PRD built on research or assumptions?
- [ ] **Cherry-picked data:** Does research include contradictory findings?
- [ ] **Insufficient sample:** Are conclusions based on 1-2 users?

---

## 🔍 Deep Validation Questions

Ask yourself these questions:

1. **Can I explain this PRD in 2 minutes to an executive?**
2. **Would a developer know what to build from this?**
3. **Could I validate success in 3 months or less?**
4. **If we shipped only P0 features, would users get value?**
5. **What's the ONE thing that must work for this to succeed?**
6. **What assumption, if wrong, would kill this product?**
7. **Can I defend every P0 feature with user research?**
8. **Is this the smallest version that validates the core hypothesis?**

---

## ✔️ PRD Quality Levels

### ⭐ Minimum Viable PRD (Acceptable)
- Problem, users, solution, metrics are documented
- Evidence-based (not assumption-based)
- Scope is clear
- Ready for next steps (architecture, UX, stories)

### ⭐⭐ Solid PRD (Good)
- All sections complete
- Lean and focused
- Strong research foundation
- Clear success criteria
- Internal consistency

### ⭐⭐⭐ Exceptional PRD (Excellent)
- Concise yet comprehensive
- Evidence-rich with compelling insights
- Clearly differentiated from competition
- Ambitious yet achievable metrics
- Thoughtful risk mitigation
- Inspiring vision that rallies the team

---

## Final Check

Before marking the PRD as "Approved":

- [ ] **Read it out loud** - Does it flow naturally?
- [ ] **Fresh eyes** - Would someone unfamiliar with the project understand it?
- [ ] **Devil's advocate** - What could go wrong? Is it addressed?
- [ ] **Stakeholder alignment** - Have key stakeholders reviewed and approved?
- [ ] **Actionable** - Can architecture, UX, and dev teams start work immediately?

**If 80%+ of checklist items pass → PRD is ready**  
**If 60-80% pass → Revisions needed before proceeding**  
**If <60% pass → Major rework required**
