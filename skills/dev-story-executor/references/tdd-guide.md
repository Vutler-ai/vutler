# Test-Driven Development Guide

## The TDD Mantra

**RED → GREEN → REFACTOR**

1. **RED:** Write a failing test
2. **GREEN:** Make it pass with minimal code
3. **REFACTOR:** Improve the code while keeping tests green

Repeat for every behavior you implement.

---

## Why TDD?

- **Confidence:** Tests prove your code works
- **Design:** Writing tests first forces better API design
- **Documentation:** Tests show how code should be used
- **Regression protection:** Catch bugs before they ship
- **Refactoring safety:** Change code fearlessly
- **Focus:** One behavior at a time, no rabbit holes

---

## The TDD Cycle (Detailed)

### Phase 1: RED (Write Failing Test)

**Goal:** Write a test that describes the next behavior you want to implement.

**Steps:**
1. **Think about the behavior** - What should happen?
2. **Write the test** - Describe expected behavior in code
3. **Run the test** - It should FAIL
4. **Verify it fails for the right reason** - Feature not implemented, not syntax error

**Example (JavaScript/Jest):**
```javascript
// BEFORE: No implementation exists yet
describe('calculateDiscount', () => {
  it('should apply 10% discount for orders over $100', () => {
    const result = calculateDiscount(150, 'SAVE10');
    expect(result).toBe(135); // 150 - 15 = 135
  });
});

// Run test → FAILS: calculateDiscount is not defined ✅ (Good failure)
```

**Good test characteristics:**
- ✅ Tests ONE behavior
- ✅ Has clear assertion
- ✅ Descriptive name (reads like a spec)
- ✅ Minimal setup (only what's needed)
- ✅ Fails for the right reason

**Bad test characteristics:**
- ❌ Tests multiple behaviors
- ❌ Vague or no assertion
- ❌ Generic name like "test1"
- ❌ Complex setup obscuring intent
- ❌ Fails due to syntax error

---

### Phase 2: GREEN (Make It Pass)

**Goal:** Write the SIMPLEST code that makes the test pass.

**Steps:**
1. **Write minimal implementation** - Just enough to go green
2. **No premature optimization** - Don't solve problems you don't have
3. **Run the test** - It should PASS
4. **Run related tests** - Ensure no regression

**Example (JavaScript):**
```javascript
// Simplest implementation (even if "dumb")
function calculateDiscount(amount, code) {
  if (amount > 100 && code === 'SAVE10') {
    return amount * 0.9;
  }
  return amount;
}

// Run test → PASSES ✅
```

**Principles:**
- **YAGNI (You Ain't Gonna Need It)** - Don't add features not tested
- **Fake it till you make it** - Hard-code values if it passes the test
- **Triangulation** - Add more tests to drive toward general solution
- **Baby steps** - Small increments, frequent green state

**Common mistakes:**
- ❌ Over-engineering the solution
- ❌ Adding features not in the test
- ❌ Optimizing before refactoring phase
- ❌ Writing too much code at once

---

### Phase 3: REFACTOR (Improve the Code)

**Goal:** Improve code quality while keeping all tests green.

**Steps:**
1. **Look for code smells** - Duplication, long functions, poor names
2. **Refactor incrementally** - One improvement at a time
3. **Run tests after each change** - Ensure green stays green
4. **Stop when code is clean** - Don't over-engineer

**Example (JavaScript):**
```javascript
// BEFORE refactoring (works but can be cleaner)
function calculateDiscount(amount, code) {
  if (amount > 100 && code === 'SAVE10') {
    return amount * 0.9;
  }
  return amount;
}

// AFTER refactoring (extracted constants, clearer logic)
const DISCOUNT_THRESHOLD = 100;
const DISCOUNT_CODES = {
  SAVE10: 0.1
};

function calculateDiscount(amount, code) {
  const discountRate = DISCOUNT_CODES[code];
  if (!discountRate || amount <= DISCOUNT_THRESHOLD) {
    return amount;
  }
  return amount * (1 - discountRate);
}

// Run tests → Still PASSES ✅
```

**What to refactor:**
- **Remove duplication** (DRY principle)
- **Improve naming** (variables, functions, classes)
- **Extract functions** (SRP - Single Responsibility)
- **Simplify conditionals** (guard clauses, early returns)
- **Add comments** (for complex logic only)

**Rules:**
- ✅ Refactor only when tests are green
- ✅ Make one change at a time
- ✅ Run tests after each change
- ✅ If test fails, revert immediately

---

## TDD Test Levels

### Unit Tests
**What:** Test individual functions/methods in isolation  
**When:** Always - every function should have unit tests  
**Speed:** Fast (milliseconds)  
**Scope:** One function, mocked dependencies

**Example:**
```javascript
test('formatCurrency formats USD correctly', () => {
  expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
});
```

### Integration Tests
**What:** Test multiple components working together  
**When:** For interactions between modules/services  
**Speed:** Medium (seconds)  
**Scope:** Multiple components, real dependencies (or partial mocks)

**Example:**
```javascript
test('OrderService calculates total with tax', async () => {
  const orderService = new OrderService(new TaxService());
  const total = await orderService.calculateTotal(orderId);
  expect(total).toBe(108.50); // $100 + 8.5% tax
});
```

### End-to-End (E2E) Tests
**What:** Test complete user flows from UI to database  
**When:** For critical user journeys  
**Speed:** Slow (seconds to minutes)  
**Scope:** Full stack, real environment

**Example:**
```javascript
test('User can checkout and receive order confirmation', async () => {
  await addItemToCart('product-123');
  await proceedToCheckout();
  await fillShippingInfo(shippingData);
  await submitPayment(paymentData);
  await expect(page).toHaveText('Order confirmed');
});
```

**TDD Pyramid:**
```
       /\
      /E2E\      ← Few (slow, expensive)
     /------\
    / INTEG  \   ← Some (medium speed)
   /----------\
  /   UNIT     \ ← Many (fast, cheap)
 /--------------\
```

---

## TDD Patterns

### Pattern 1: Arrange-Act-Assert (AAA)

```javascript
test('description', () => {
  // ARRANGE: Set up test data and dependencies
  const user = { name: 'Alice', role: 'admin' };
  
  // ACT: Execute the behavior being tested
  const result = hasPermission(user, 'delete');
  
  // ASSERT: Verify the outcome
  expect(result).toBe(true);
});
```

### Pattern 2: Given-When-Then (BDD style)

```javascript
test('Admin user can delete posts', () => {
  // GIVEN an admin user
  const user = { role: 'admin' };
  
  // WHEN checking delete permission
  const canDelete = hasPermission(user, 'delete');
  
  // THEN permission is granted
  expect(canDelete).toBe(true);
});
```

### Pattern 3: Triangulation

Use multiple tests to drive toward general solution:

```javascript
// Test 1: Drive basic behavior
test('10% discount for SAVE10', () => {
  expect(calculateDiscount(100, 'SAVE10')).toBe(90);
});

// Test 2: Different discount code → generalize
test('20% discount for SAVE20', () => {
  expect(calculateDiscount(100, 'SAVE20')).toBe(80);
});

// Test 3: No code → handle edge case
test('No discount without code', () => {
  expect(calculateDiscount(100, null)).toBe(100);
});
```

### Pattern 4: Test Doubles (Mocks, Stubs, Fakes)

**Stub:** Returns canned response
```javascript
const emailStub = {
  send: () => true
};
```

**Mock:** Verifies interactions
```javascript
const emailMock = jest.fn();
service.notifyUser(user);
expect(emailMock).toHaveBeenCalledWith(user.email);
```

**Fake:** Simplified working implementation
```javascript
class FakeDatabase {
  constructor() { this.data = []; }
  save(item) { this.data.push(item); }
  find(id) { return this.data.find(x => x.id === id); }
}
```

---

## Common TDD Pitfalls

### ❌ Writing Tests After Code
**Problem:** Not real TDD, tests become afterthought  
**Solution:** Always write test first (RED → GREEN → REFACTOR)

### ❌ Testing Implementation Details
**Problem:** Tests break when refactoring  
**Solution:** Test behavior, not internal structure

### ❌ Too Many Assertions Per Test
**Problem:** Hard to know what failed  
**Solution:** One logical assertion per test (or tightly related group)

### ❌ Slow Tests
**Problem:** Developers skip running tests  
**Solution:** Mock external dependencies, optimize setup, use test pyramid

### ❌ Brittle Tests
**Problem:** Tests fail for unrelated changes  
**Solution:** Test public API, avoid over-mocking, use meaningful assertions

### ❌ Not Running Tests Frequently
**Problem:** Long debug cycles when tests fail  
**Solution:** Run tests after every small change, use watch mode

---

## TDD Workflow Example

**Story:** Implement password validation

**Iteration 1:**
```javascript
// RED
test('password must be at least 8 characters', () => {
  expect(validatePassword('short')).toBe(false);
  expect(validatePassword('longenough')).toBe(true);
});

// GREEN
function validatePassword(password) {
  return password.length >= 8;
}

// REFACTOR (nothing to refactor yet)
```

**Iteration 2:**
```javascript
// RED
test('password must contain a number', () => {
  expect(validatePassword('onlyletters')).toBe(false);
  expect(validatePassword('hasnumb3r')).toBe(true);
});

// GREEN
function validatePassword(password) {
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  return hasMinLength && hasNumber;
}

// REFACTOR (extract regex to constant)
const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  NUMBER_REGEX: /\d/
};

function validatePassword(password) {
  return password.length >= PASSWORD_RULES.MIN_LENGTH &&
         PASSWORD_RULES.NUMBER_REGEX.test(password);
}
```

**Iteration 3:** Add uppercase requirement...  
**Iteration 4:** Add special character requirement...

Each iteration: RED → GREEN → REFACTOR.

---

## TDD Checklist

Before writing code:
- [ ] Have I written a failing test first?
- [ ] Does the test describe ONE specific behavior?
- [ ] Is the test name descriptive and readable?

Before moving to next test:
- [ ] Does the test pass?
- [ ] Have I run related tests to check for regression?
- [ ] Have I refactored to remove duplication and improve clarity?
- [ ] Are all tests still green after refactoring?

Before marking task complete:
- [ ] Do I have tests for happy path?
- [ ] Do I have tests for edge cases?
- [ ] Do I have tests for error conditions?
- [ ] Is test coverage at 100% for this task?

---

## Resources & Further Reading

- **Books:**
  - "Test Driven Development: By Example" by Kent Beck
  - "Growing Object-Oriented Software, Guided by Tests" by Freeman & Pryce
  
- **Articles:**
  - Martin Fowler's "Is TDD Dead?" series
  - Uncle Bob's "The Cycles of TDD"

- **Tools:**
  - Jest (JavaScript)
  - pytest (Python)
  - JUnit (Java)
  - RSpec (Ruby)

---

**Remember:** TDD is a discipline, not a religion. The goal is confidence and quality, not dogma. If a test is hard to write, that's feedback about your design—listen to it.
