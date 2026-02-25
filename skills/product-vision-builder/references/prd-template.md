# Product Requirements Document (PRD) Template

## Document Info

**Product:** [Product Name]  
**Version:** [1.0]  
**Date:** [YYYY-MM-DD]  
**Author:** [PM Name]  
**Stakeholders:** [List key stakeholders]  
**Status:** [Draft | In Review | Approved | Archived]

## Executive Summary

[2-3 paragraph summary covering: problem, solution, target users, success metrics, and timeline. Should be readable by exec who has 2 minutes.]

## Problem & Opportunity

### User Problem

**Core Problem:**
[Detailed description of the user pain point. Include evidence: user research quotes, support tickets, analytics, competitive gaps.]

**Impact:**
- **Frequency:** [How often does this problem occur?]
- **Severity:** [How painful is it when it happens?]
- **Affected Users:** [What % or number of users hit this?]

### Jobs-to-be-Done

**Primary JTBD:**
```
When [situation], I want to [motivation], so I can [expected outcome].
```

**Functional Job:** [What task are they trying to complete?]  
**Emotional Job:** [How do they want to feel?]  
**Social Job:** [How do they want to be perceived?]

### Current Alternatives

1. **[Alternative 1]**
   - Strengths: [What it does well]
   - Weaknesses: [Where it fails users]
   
2. **[Alternative 2]**
   - Strengths: [What it does well]
   - Weaknesses: [Where it fails users]

**Why existing solutions fall short:**
[Analysis of gaps]

## Target Users & Personas

### Primary Persona: [Name]

**Demographics:**
- Role: [Job title]
- Industry: [Sector]
- Company size: [Range]
- Tech savviness: [Low/Medium/High]

**Goals & Motivations:**
- [Primary goal]
- [Secondary goal]

**Pain Points:**
- [Pain 1 - specific and evidence-based]
- [Pain 2]

**Behaviors:**
- [Relevant behavior or pattern]
- [Another behavior]

**Success Criteria:**
[How this persona defines success with our product]

### Secondary Personas

[Brief 2-3 sentence description of each secondary persona if applicable]

## Product Vision & Strategy

### Vision

[Aspirational future state: Where is this product going long-term?]

### Strategic Fit

**Company Strategy Alignment:**
[How does this ladder up to company OKRs/goals?]

**Product Principles:**
1. [Principle 1: e.g., "Speed over features"]
2. [Principle 2: e.g., "Progressive disclosure"]
3. [Principle 3]

### Competitive Positioning

**Unique Value Proposition:**
[Complete: "Unlike [alternatives], [our product] [unique benefit] by [differentiator]"]

**Positioning Map:**
```
     High Features
           |
    [C1]  |  [C2]
          |
Low $ ----+---- High $
          |
    [Us]  |  [C3]
          |
     Low Features
```

## Scope & Requirements

### In Scope

**Must Have (P0):**
1. [Requirement 1 - critical for launch]
   - **User Story:** As a [persona], I want to [action] so that [benefit]
   - **Acceptance Criteria:**
     - [ ] [Specific, testable criterion]
     - [ ] [Another criterion]

2. [Requirement 2]
   - **User Story:** [Story]
   - **Acceptance Criteria:** [Criteria]

**Should Have (P1):**
[Features that enhance but aren't launch-blockers]

**Nice to Have (P2):**
[Future considerations]

### Out of Scope

**Explicitly NOT Building:**
- [Feature/scope intentionally excluded]
- [Another exclusion - with rationale]

**Future Considerations:**
- [Feature deferred to v2+]

### User Flows

**Core Flow: [Flow Name]**
1. User [action]
2. System [response]
3. User [next action]
4. System [response]
5. Success state: [outcome]

**Edge Cases:**
- **[Edge case 1]:** [How we handle it]
- **[Edge case 2]:** [How we handle it]

### Functional Requirements

**[Feature Area 1]:**
- **REQ-1.1:** [Specific requirement]
- **REQ-1.2:** [Specific requirement]

**[Feature Area 2]:**
- **REQ-2.1:** [Specific requirement]

### Non-Functional Requirements

**Performance:**
- Page load: [< X seconds]
- API response: [< Y ms]
- Concurrent users: [Z users]

**Security:**
- Authentication: [Method]
- Authorization: [RBAC/ABAC/etc.]
- Data encryption: [At rest/in transit]
- Compliance: [GDPR/HIPAA/SOC2/etc.]

**Scalability:**
- Expected load: [Users, transactions, data volume]
- Growth projection: [Next 12 months]

**Accessibility:**
- WCAG level: [A/AA/AAA]
- Screen reader support: [Yes/No]
- Keyboard navigation: [Yes/No]

**Compatibility:**
- Browsers: [List supported browsers + versions]
- Devices: [Desktop/Mobile/Tablet]
- OS: [Windows/Mac/Linux/iOS/Android]

### Design Requirements

**Design System:**
[Which design system/component library?]

**Key UI States:**
- Empty state: [Description]
- Loading state: [Description]
- Error state: [Description]
- Success state: [Description]

**Design Deliverables:**
- [ ] Wireframes
- [ ] High-fidelity mockups
- [ ] Prototype
- [ ] Design specs
- [ ] Accessibility annotations

## Success Metrics & KPIs

### North Star Metric

**[Metric Name]:** [Definition]
- **Current Baseline:** [X]
- **Target:** [Y]
- **Timeline:** [Z weeks/months]
- **Why this metric:** [Rationale for choosing this]

### Primary Metrics

1. **[Metric 1]**
   - **Definition:** [How it's measured]
   - **Target:** [Specific goal]
   - **Tracking:** [Tool/dashboard]

2. **[Metric 2]**
   - **Definition:** [How it's measured]
   - **Target:** [Specific goal]

### Secondary Metrics

- **[Metric 3]:** [Target]
- **[Metric 4]:** [Target]

### Anti-Metrics

[Metrics we're monitoring to ensure we don't harm existing value]
- **[Anti-metric 1]:** Should not drop below [X]
- **[Anti-metric 2]:** Should not drop below [Y]

## Technical Considerations

### Architecture Overview

[High-level technical approach - link to detailed architecture doc if separate]

### Key Technical Decisions

1. **[Decision 1: e.g., Database choice]**
   - **Options considered:** [A, B, C]
   - **Decision:** [Chosen option]
   - **Rationale:** [Why]

2. **[Decision 2]**
   - **Options considered:** [A, B]
   - **Decision:** [Chosen]
   - **Rationale:** [Why]

### Dependencies

**Internal:**
- [System A]: [What we need from it]
- [Team B]: [What we need from them]

**External:**
- [3rd party API]: [Integration requirements]
- [Vendor tool]: [Dependencies]

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [e.g., API rate limits] | High | Medium | [Caching strategy, fallback] |
| [Another risk] | Medium | Low | [Mitigation plan] |

## Go-to-Market Strategy

### Launch Plan

**Launch Type:** [Beta | Phased | Big Bang]  
**Launch Date:** [Target date]

**Phases:**
1. **[Phase 1]:** [Timeline] - [Scope] - [User segment]
2. **[Phase 2]:** [Timeline] - [Scope] - [User segment]

### Marketing & Positioning

**Key Messages:**
- **For [target audience]:** [Key message]
- **Differentiation:** [How we're different from alternatives]

**Channels:**
- [Channel 1]: [Strategy]
- [Channel 2]: [Strategy]

### Sales Enablement

**Required Materials:**
- [ ] Product demo
- [ ] Sales deck
- [ ] FAQ
- [ ] Competitor comparison
- [ ] Case studies

### Support & Documentation

**User Documentation:**
- [ ] Getting started guide
- [ ] Feature documentation
- [ ] Video tutorials
- [ ] FAQ

**Internal Documentation:**
- [ ] Architecture docs
- [ ] API documentation
- [ ] Runbooks
- [ ] Support playbook

## Timeline & Milestones

**Overall Timeline:** [X weeks/months]

| Milestone | Date | Owner | Deliverables |
|-----------|------|-------|--------------|
| PRD Approval | [Date] | [PM] | This document |
| Design Complete | [Date] | [Designer] | Mockups, prototype |
| Architecture Review | [Date] | [Architect] | Architecture doc |
| Dev Complete | [Date] | [Eng Lead] | Code, tests |
| QA Complete | [Date] | [QA] | Test reports |
| Beta Launch | [Date] | [PM] | Beta access |
| GA Launch | [Date] | [PM] | Full release |

**Critical Path:**
[List dependencies that could delay launch]

## Risks & Mitigations

### Product Risks

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| [e.g., Users don't understand new UI] | High | Medium | [User testing pre-launch, onboarding] | [PM] |
| [Another risk] | Medium | High | [Mitigation] | [Owner] |

### Technical Risks

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| [e.g., Integration delays] | High | Medium | [Early spike, backup plan] | [Eng] |

### Market Risks

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| [e.g., Competitor launches first] | Medium | Low | [Speed over perfection] | [PM] |

## Open Questions & Assumptions

### Open Questions

- [ ] **[Question 1]** - Owner: [Name] - Due: [Date]
- [ ] **[Question 2]** - Owner: [Name] - Due: [Date]

### Key Assumptions

- **Assumption 1:** [Statement]
  - **Validation plan:** [How we'll test this]
  - **Risk if wrong:** [Impact]
  
- **Assumption 2:** [Statement]
  - **Validation plan:** [How we'll test this]

## Appendix

### User Research Summary

[Link to full research or brief summary]

### Competitive Analysis

[Link to detailed analysis or brief comparison]

### Design Artifacts

[Links to Figma, wireframes, prototypes]

### Technical Specs

[Link to architecture docs, API specs, database schema]

---

## Approval & Sign-off

- [ ] **Product Manager:** [Name] - [Date]
- [ ] **Engineering Lead:** [Name] - [Date]
- [ ] **Design Lead:** [Name] - [Date]
- [ ] **Executive Sponsor:** [Name] - [Date]

**Version History:**
- v1.0 - [Date] - Initial draft - [Author]
- v1.1 - [Date] - [Changes] - [Author]
