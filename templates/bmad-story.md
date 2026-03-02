# US-XXX: [Feature Name]

**Epic:** [Epic Name]  
**Sprint:** [Sprint Number]  
**Points:** [Story Points]  
**Assigned:** [Developer]  
**Status:** Draft

---

## B: Business (Product Manager)

### User Story
**As a** [persona]  
**I want to** [action]  
**So that** [business value]

### Success Metrics
- [ ] [Metric 1]: X% improvement
- [ ] [Metric 2]: Y users active

### User Flow
1. User opens /page
2. User clicks "Button"
3. API call → loading state
4. Success → show result
5. Error → show error message

### Edge Cases
- Empty state (no data)
- Error state (API 500)
- Loading state

---

## M: Metrics (Architect)

### Acceptance Criteria (DoD)

**Functional:**
- [ ] Page renders without console errors
- [ ] API returns 200 with expected data structure
- [ ] DB query completes in <100ms
- [ ] Loading state shows during API call
- [ ] Error state shows on API failure
- [ ] Empty state shows when no data

**Performance:**
- [ ] Page load <2s
- [ ] API response <500ms
- [ ] Bundle size +<50KB

**Quality:**
- [ ] TypeScript types match API contract
- [ ] No hardcoded values
- [ ] Responsive (mobile + desktop)

---

## A: Architecture (Architect)

### API Contract

**Contract File:** `contracts/[feature].ts`

#### Endpoint
**Method:** POST  
**Path:** /api/v1/[feature]  
**Auth:** Required (Bearer token)

#### Request
```typescript
export interface [Feature]Request {
  field1: string;
  field2: number;
  field3?: string;  // optional
}
```

#### Response (Success)
```typescript
export interface [Feature]Response {
  success: boolean;
  data: {
    id: number;
    field1: string;
    createdAt: string;  // ISO 8601
  };
}
```

#### Response (Error)
```typescript
export interface ErrorResponse {
  success: false;
  error: string;        // Human-readable
  code: string;         // ERROR_CODE
}
```

### DB Schema

```sql
CREATE TABLE IF NOT EXISTS tenant_vutler.[feature] (
  id SERIAL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  field1 VARCHAR(255) NOT NULL,
  field2 INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_[feature]_workspace ON tenant_vutler.[feature](workspace_id);
```

### Seed Data

```sql
INSERT INTO tenant_vutler.[feature] (workspace_id, field1, field2) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Sample 1', 100),
  ('00000000-0000-0000-0000-000000000001', 'Sample 2', 200),
  ('00000000-0000-0000-0000-000000000001', 'Sample 3', 300);
```

---

## D: Design (UX Designer)

### Wireframe

#### Desktop View (Default State)
```
┌────────────────────────────────────────┐
│ Header: Feature Name                   │
├────────────────────────────────────────┤
│                                        │
│ [Input Field 1]                        │
│ [Input Field 2]                        │
│                                        │
│ [Create Feature Button]                │
│                                        │
│ Results:                               │
│ ┌────────────────────────────────────┐ │
│ │ • Feature 1 (created 2h ago)       │ │
│ │ • Feature 2 (created 1d ago)       │ │
│ └────────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

#### Mobile View
```
┌──────────────────┐
│ Feature Name     │
├──────────────────┤
│                  │
│ [Field 1]        │
│ [Field 2]        │
│                  │
│ [Create]         │
│                  │
│ Results:         │
│ • Feature 1      │
│ • Feature 2      │
│                  │
└──────────────────┘
```

### States

**Loading State:**
```
[Create Feature Button] → [🔄 Creating...]
```

**Success State:**
```
✅ "Feature created successfully!"
→ Add to results list
→ Clear form
```

**Error State:**
```
❌ "Failed to create feature: [error message]"
→ Keep form filled
→ Allow retry
```

**Empty State:**
```
📭 "No features yet. Create your first one above!"
```

---

## Implementation Log

### Pre-Coding Checklist
- [ ] User story reviewed by PM
- [ ] Acceptance criteria approved
- [ ] API contract created and reviewed
- [ ] DB schema reviewed
- [ ] Wireframe approved
- [ ] Frontend + Backend aligned on contract

### Development
- [ ] Contract file created (`contracts/[feature].ts`)
- [ ] DB schema created
- [ ] Seed data inserted
- [ ] Backend endpoint implemented
- [ ] Backend tested (curl/Postman)
- [ ] Frontend component created
- [ ] Frontend calls API
- [ ] Frontend handles all states

### Integration & QA
- [ ] End-to-end test passed
- [ ] Happy path works
- [ ] Loading state shows
- [ ] Error state shows
- [ ] Empty state shows
- [ ] TypeScript types match
- [ ] No console errors
- [ ] Responsive works
- [ ] Performance targets met

### Deployment
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Committed to git
- [ ] Deployed to staging
- [ ] Deployed to production
- [ ] Monitoring active

---

## Notes

[Add any additional notes, decisions, or learnings here]

---

**Created:** [Date]  
**Completed:** [Date]  
**Duration:** [Hours]  
**Cost:** [Developer hours × rate]
