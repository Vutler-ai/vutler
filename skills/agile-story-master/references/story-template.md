# Fully-Contextualized Story Template

Use this template to prepare implementation-ready stories with complete technical context.

---

## Story Header

**Story ID:** [PROJ-XXX]  
**Title:** [Brief, action-oriented title]  
**Epic:** [Epic name/ID this story belongs to]  
**Story Points:** [Estimate]  
**Priority:** [High / Medium / Low]  
**Status:** [Backlog / Ready / In Progress / In Review / Done]

---

## User Story

**As a** [role/persona]  
**I want** [capability/feature]  
**So that** [business value/benefit]

**Example:**
> As a **customer**  
> I want **to apply discount codes at checkout**  
> So that **I can save money on my purchases**

---

## Business Context

### Why This Matters
Brief explanation of business value and strategic importance.

**Example:**
> Discount codes are a key driver of conversions during promotional campaigns. Marketing team needs this for Black Friday (3 weeks away). Expected 15% lift in conversion rate based on A/B test data.

### Success Metrics
How we'll measure success after deployment.

- **Primary:** Conversion rate increases by 10-15%
- **Secondary:** Average order value remains stable (within 5%)
- **Monitoring:** Track discount code usage and redemption rate

---

## Technical Context

### Related PRD Sections
- PRD Section 3.2: Checkout Flow
- PRD Section 4.5: Promotional Features

### Architecture Decisions
- **ADR-023:** Use Redis for discount code caching (performance)
- **ADR-024:** Discount calculation happens server-side (security)

### UX Design
- Figma mockup: [link to design]
- Interaction flow: [link to prototype]
- Key design decisions:
  - Discount code field appears above payment section
  - Success/error messages inline, not modal
  - Applied discount shows in order summary

### Data Model
```sql
CREATE TABLE discount_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  type ENUM('percentage', 'fixed_amount'),
  value DECIMAL(10, 2) NOT NULL,
  min_order_amount DECIMAL(10, 2),
  max_uses INT,
  current_uses INT DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Contracts

**Endpoint:** `POST /api/checkout/apply-discount`

**Request:**
```json
{
  "orderId": "ord_123",
  "discountCode": "SAVE10"
}
```

**Response (Success):**
```json
{
  "success": true,
  "discount": {
    "code": "SAVE10",
    "type": "percentage",
    "value": 10,
    "amount": 15.50
  },
  "orderTotal": 139.50
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CODE",
    "message": "Discount code is invalid or expired"
  }
}
```

---

## Acceptance Criteria

Clear, testable criteria for "done". Use Given-When-Then format when helpful.

### AC1: Apply Valid Discount Code
**Given** a customer has items in cart totaling $100  
**And** discount code "SAVE10" exists (10% off, no expiration)  
**When** customer enters "SAVE10" and clicks "Apply"  
**Then** discount of $10 is applied  
**And** order total updates to $90  
**And** success message displays: "Discount code applied!"

### AC2: Reject Invalid Discount Code
**Given** a customer has items in cart  
**When** customer enters invalid code "FAKE123"  
**Then** no discount is applied  
**And** error message displays: "Invalid discount code"  
**And** order total remains unchanged

### AC3: Reject Expired Discount Code
**Given** discount code "EXPIRED" exists but expired yesterday  
**When** customer enters "EXPIRED"  
**Then** no discount is applied  
**And** error message displays: "This discount code has expired"

### AC4: Enforce Minimum Order Amount
**Given** discount code "BIG50" requires $200 minimum order  
**And** customer's cart totals $150  
**When** customer enters "BIG50"  
**Then** no discount is applied  
**And** error message displays: "This code requires a minimum order of $200"

### AC5: Enforce Usage Limits
**Given** discount code "LIMITED" has max 100 uses and is at 100 uses  
**When** customer enters "LIMITED"  
**Then** no discount is applied  
**And** error message displays: "This discount code has reached its usage limit"

### AC6: Apply Only One Discount Code
**Given** customer has already applied code "SAVE10"  
**When** customer tries to apply another code "SAVE20"  
**Then** previous discount is removed  
**And** new discount "SAVE20" is applied  
**And** message displays: "New discount code applied"

---

## Implementation Tasks

Break story into specific, ordered tasks.

### Phase 1: Backend Implementation
- [ ] **Create database migration** for discount_codes table (1h)
- [ ] **Implement DiscountCodeRepository** with CRUD methods (2h)
- [ ] **Implement DiscountService** with validation logic (3h)
  - Validate code exists
  - Check expiration
  - Check usage limits
  - Check minimum order amount
- [ ] **Create POST /api/checkout/apply-discount endpoint** (2h)
- [ ] **Write unit tests for DiscountService** (3h)
- [ ] **Write integration tests for discount endpoint** (2h)

### Phase 2: Frontend Implementation
- [ ] **Create DiscountCodeInput component** (2h)
- [ ] **Integrate component into CheckoutPage** (1h)
- [ ] **Implement error/success message display** (1h)
- [ ] **Update OrderSummary to show applied discount** (1h)
- [ ] **Write component unit tests** (2h)
- [ ] **Write E2E tests for discount flow** (3h)

### Phase 3: Infrastructure & Deployment
- [ ] **Set up Redis cache for discount codes** (2h)
- [ ] **Configure cache TTL and invalidation** (1h)
- [ ] **Update deployment scripts** (1h)
- [ ] **Add monitoring/logging for discount usage** (1h)

### Phase 4: Documentation & QA
- [ ] **Update API documentation** (1h)
- [ ] **Update user guide/FAQ** (1h)
- [ ] **Manual QA in staging** (2h)
- [ ] **Load test discount endpoint** (1h)

**Total Estimate:** ~30 hours (~5 days for 1 developer)

---

## Dependencies

### Blocked By
- [ ] **UX team:** Finalize checkout mockups (due: Sprint Day 1)
- [ ] **DevOps:** Provision Redis instance (due: Sprint Day 2)

### Blocks
- [ ] **SHOP-156:** Discount analytics dashboard (depends on discount_codes table)
- [ ] **SHOP-157:** Admin panel for managing codes (depends on DiscountService)

### Related Stories
- **SHOP-140:** Promotional email campaign (parallel work)
- **SHOP-145:** Order history updates (may need discount display)

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Payment gateway doesn't support discount metadata | High | Low | Tested in staging, fallback: store in order notes |
| Redis cache invalidation issues | Medium | Medium | Monitor cache hit rate, fallback to DB query |
| High traffic during Black Friday | High | High | Load test, auto-scaling configured, circuit breaker |
| UX design changes mid-sprint | Medium | Low | Finalize mockups before sprint, freeze design |

---

## Testing Strategy

### Unit Tests (Coverage: ≥80%)
- DiscountService validation logic
- Discount calculation (percentage vs fixed)
- Edge cases (null, expired, limits)
- DiscountCodeInput component interactions

### Integration Tests
- POST /api/checkout/apply-discount endpoint
- Database operations (create, update usage count)
- Cache operations (set, get, invalidate)

### E2E Tests
- Full checkout flow with valid code
- Full checkout flow with invalid code
- Apply discount, complete order, verify final total
- Apply discount, remove discount, re-apply different code

### Manual QA
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile responsive design
- Error message clarity and UX
- Performance under load

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All tasks completed and marked [x]
- [ ] Unit tests written and passing (≥80% coverage)
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Code reviewed and approved
- [ ] Deployed to staging and tested
- [ ] Product Owner acceptance obtained
- [ ] Documentation updated (API docs, user guide)
- [ ] Monitoring/logging configured
- [ ] No critical bugs or security issues

---

## Notes & Decisions

### 2024-02-10: Cache Strategy Decision
**Decision:** Use Redis with 1-hour TTL for active discount codes.  
**Rationale:** Most codes checked frequently during campaigns, 1-hour TTL balances freshness vs load.  
**Alternative considered:** Database-only (rejected: too slow under load).

### 2024-02-12: Error Message UX
**Decision:** Inline error messages below discount field, not modal.  
**Rationale:** UX research shows inline errors less disruptive to checkout flow.

### 2024-02-13: Discount Stacking
**Decision:** v1 does NOT support stacking multiple codes.  
**Rationale:** Simpler implementation, avoids complex business rules. May revisit in v2.

---

## Story History

| Date | Status | Notes |
|------|--------|-------|
| 2024-02-05 | Backlog | Story created from Epic SHOP-100 |
| 2024-02-08 | Ready | Groomed in backlog refinement, ACs finalized |
| 2024-02-10 | In Progress | Sprint 12 commitment, Mike assigned |
| 2024-02-14 | In Review | PR #142 submitted, awaiting review |
| 2024-02-15 | Done | Merged to main, deployed to production |

---

**This story is ready for implementation when:**
- [ ] All acceptance criteria are clear
- [ ] All dependencies are resolved or have dates
- [ ] Team has reviewed and estimated
- [ ] Risks have mitigation plans
- [ ] Definition of Done is agreed upon
