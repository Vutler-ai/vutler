# PRD Validation Checklist

Use this checklist before handing off PRD to engineering, design, or leadership. Every item should be checked before the PRD is considered "ready."

## ✅ Problem & Opportunity

- [ ] **Problem is evidence-based** - Backed by user research, data, or clear customer feedback (not assumptions)
- [ ] **Problem is quantified** - Includes frequency, severity, and number of affected users
- [ ] **JTBD is clearly defined** - Functional, emotional, and social dimensions are captured
- [ ] **Current alternatives are documented** - Competitive landscape and user workarounds are described
- [ ] **Opportunity size is clear** - TAM/SAM/SOM or qualitative market assessment provided

## ✅ Target Users & Personas

- [ ] **Primary persona is detailed** - Includes demographics, goals, pain points, behaviors, success criteria
- [ ] **Persona is evidence-based** - Built from real user interviews, not assumptions
- [ ] **Secondary personas are identified** - If applicable, other user types are listed
- [ ] **User segmentation is clear** - Understand who is prioritized for v1 vs. future

## ✅ Scope & Requirements

- [ ] **Must-haves (P0) are clearly defined** - Critical features for launch are listed with user stories
- [ ] **Acceptance criteria are testable** - Each requirement has specific, measurable criteria
- [ ] **Out-of-scope is explicit** - Features intentionally excluded are documented with rationale
- [ ] **User flows are complete** - Core flows and edge cases are mapped
- [ ] **Non-functional requirements are defined** - Performance, security, scalability, accessibility specified
- [ ] **Design requirements are clear** - UI states, design system, and deliverables are outlined

## ✅ Success Metrics

- [ ] **North Star Metric is defined** - The ONE metric that shows success
- [ ] **Metrics are measurable** - Clear definition of how each metric is tracked
- [ ] **Baseline & targets are set** - Current state and success targets are specified
- [ ] **Timeline for metrics is realistic** - When we expect to hit targets is documented
- [ ] **Anti-metrics are identified** - Metrics we monitor to avoid negative side effects

## ✅ Technical Considerations

- [ ] **Architecture approach is outlined** - High-level technical strategy is clear
- [ ] **Key technical decisions are documented** - Major choices (database, framework, etc.) with rationale
- [ ] **Dependencies are identified** - Internal systems, external APIs, team dependencies listed
- [ ] **Technical risks are assessed** - Major risks with impact, likelihood, and mitigation plans

## ✅ Go-to-Market

- [ ] **Launch plan is clear** - Beta, phased rollout, or big bang strategy defined
- [ ] **Marketing strategy exists** - Key messages and channels identified
- [ ] **Sales enablement is planned** - Required materials (demo, deck, FAQ) listed
- [ ] **Support & docs are planned** - User and internal documentation requirements outlined

## ✅ Timeline & Resources

- [ ] **Milestones are realistic** - Major deliverables with dates and owners
- [ ] **Critical path is identified** - Dependencies that could delay launch are flagged
- [ ] **Team requirements are specified** - Required roles and headcount are clear
- [ ] **Timeline is achievable** - Eng/Design/PM have validated the schedule

## ✅ Risks & Assumptions

- [ ] **Risks are categorized** - Product, technical, and market risks are separated
- [ ] **Impact & likelihood are assessed** - Each risk is rated (High/Medium/Low)
- [ ] **Mitigations are actionable** - Clear plans to reduce or manage each risk
- [ ] **Owners are assigned** - Each risk has a responsible party
- [ ] **Assumptions are testable** - Key assumptions have validation plans

## ✅ Completeness & Quality

- [ ] **No major open questions** - All blockers are resolved or have owners/deadlines
- [ ] **Language is clear & concise** - Avoid jargon; any stakeholder can understand
- [ ] **Consistent terminology** - Same terms used throughout (not "user" in one section, "customer" in another)
- [ ] **Actionable for next steps** - Engineering and design can start work immediately
- [ ] **Stakeholder alignment** - Key stakeholders (eng lead, design lead, exec sponsor) have reviewed

## ✅ Lean & Focused

- [ ] **Smallest viable scope** - Focus on core value; nice-to-haves are deferred
- [ ] **Avoids scope creep** - Anti-scope section prevents feature bloat
- [ ] **MVP-first mindset** - v1 delivers value quickly; future iterations are documented
- [ ] **Ruthless prioritization** - Every feature ties to a measurable outcome

## ✅ Approvals & Sign-off

- [ ] **PM has signed off** - Product owner has approved final version
- [ ] **Engineering lead has signed off** - Technical feasibility is validated
- [ ] **Design lead has signed off** - UX/UI requirements are clear
- [ ] **Executive sponsor has signed off** - Business case and resource allocation approved

---

## Red Flags 🚩

**If ANY of these are true, the PRD is NOT ready:**

- **Vague requirements** - "Make it faster" without defining target performance
- **No user evidence** - Problem based on assumptions, not research
- **Missing success metrics** - No clear way to measure if we succeeded
- **Unclear scope** - Can't distinguish must-haves from nice-to-haves
- **No technical validation** - Engineering hasn't reviewed feasibility
- **Unrealistic timeline** - Schedule doesn't account for dependencies or risks
- **Open blockers** - Critical questions without owners or deadlines

---

## Validation Process

1. **Self-review** - PM uses this checklist before sharing
2. **Peer review** - Another PM or senior stakeholder reviews
3. **Stakeholder review** - Engineering, design, and exec review
4. **Feedback incorporation** - Address comments and re-validate
5. **Final sign-off** - All required approvals collected

**Timeline:** Plan 1-2 weeks for full validation cycle on complex PRDs.

---

## Post-Validation

Once validated:
- [ ] PRD is marked "Approved" with version number
- [ ] Shared with all stakeholders (eng, design, QA, support, marketing)
- [ ] Linked from project tracking tool (Jira, Linear, etc.)
- [ ] Archived in documentation system (Notion, Confluence, etc.)
- [ ] Kick-off meeting scheduled to align teams
