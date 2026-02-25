# Test Patterns

Common testing patterns and strategies for comprehensive test coverage.

---

## Test Structure Patterns

### 1. Arrange-Act-Assert (AAA)

**Pattern:** Standard structure for test organization.

```javascript
test('calculateTotal applies tax correctly', () => {
  // ARRANGE: Set up test data
  const items = [
    { name: 'Widget', price: 10 },
    { name: 'Gadget', price: 20 }
  ];
  const taxRate = 0.08;
  
  // ACT: Execute the code under test
  const result = calculateTotal(items, taxRate);
  
  // ASSERT: Verify the outcome
  expect(result).toBe(32.40); // 30 + 8% tax = 32.40
});
```

**Benefits:**
- Clear separation of concerns
- Easy to read and understand
- Consistent structure across tests

---

### 2. Given-When-Then (BDD Style)

**Pattern:** Behavior-driven development structure.

```javascript
describe('Order checkout', () => {
  test('applies discount code successfully', () => {
    // GIVEN a valid discount code
    const order = createOrder({ subtotal: 100 });
    const discountCode = 'SAVE10';
    
    // WHEN the user applies the code
    const result = order.applyDiscount(discountCode);
    
    // THEN the discount is applied
    expect(result.discount).toBe(10);
    expect(result.total).toBe(90);
    expect(result.success).toBe(true);
  });
});
```

**Benefits:**
- Reads like a specification
- Focus on behavior, not implementation
- Bridges gap between business and technical

---

## Test Coverage Patterns

### 3. Happy Path + Edge Cases + Error Cases

**Pattern:** Comprehensive coverage of all scenarios.

```javascript
describe('validatePassword', () => {
  // HAPPY PATH: Normal, expected usage
  test('accepts valid password', () => {
    expect(validatePassword('SecurePass123!')).toBe(true);
  });
  
  // EDGE CASES: Boundary conditions
  test('accepts minimum length password', () => {
    expect(validatePassword('Pass123!')).toBe(true); // Exactly 8 chars
  });
  
  test('rejects password one char too short', () => {
    expect(validatePassword('Pas123!')).toBe(false); // 7 chars
  });
  
  test('accepts password with exactly one number', () => {
    expect(validatePassword('Password1')).toBe(true);
  });
  
  // ERROR CASES: Invalid inputs
  test('rejects null password', () => {
    expect(validatePassword(null)).toBe(false);
  });
  
  test('rejects undefined password', () => {
    expect(validatePassword(undefined)).toBe(false);
  });
  
  test('rejects empty string', () => {
    expect(validatePassword('')).toBe(false);
  });
  
  test('rejects password without numbers', () => {
    expect(validatePassword('OnlyLetters')).toBe(false);
  });
});
```

**Checklist:**
- [ ] Happy path (normal usage)
- [ ] Minimum boundary
- [ ] Maximum boundary
- [ ] Just below minimum
- [ ] Just above maximum
- [ ] Null/undefined
- [ ] Empty values
- [ ] Invalid types

---

### 4. Parameterized Tests (Data-Driven)

**Pattern:** Test same logic with multiple inputs.

```javascript
describe('discount calculation', () => {
  test.each([
    // [orderTotal, discountCode, expectedDiscount]
    [100, 'SAVE10', 10],
    [200, 'SAVE10', 20],
    [50, 'SAVE10', 0],      // Below threshold
    [100, 'SAVE20', 20],
    [100, 'INVALID', 0],
    [100, null, 0],
  ])('order total %i with code %s should give discount %i', 
     (total, code, expected) => {
    const result = calculateDiscount(total, code);
    expect(result).toBe(expected);
  });
});
```

**Benefits:**
- Reduces test code duplication
- Easy to add new test cases
- Clear tabular format

---

## Mocking Patterns

### 5. Dependency Injection for Testability

**Pattern:** Inject dependencies so they can be mocked in tests.

```javascript
// PRODUCTION CODE
class OrderService {
  constructor(paymentGateway, emailService) {
    this.paymentGateway = paymentGateway;
    this.emailService = emailService;
  }
  
  async processOrder(order) {
    await this.paymentGateway.charge(order.total);
    await this.emailService.sendConfirmation(order);
    return { success: true };
  }
}

// TEST CODE
describe('OrderService', () => {
  test('processes payment and sends confirmation', async () => {
    // Mock dependencies
    const mockPayment = {
      charge: jest.fn().mockResolvedValue({ success: true })
    };
    const mockEmail = {
      sendConfirmation: jest.fn().mockResolvedValue({ sent: true })
    };
    
    // Inject mocks
    const service = new OrderService(mockPayment, mockEmail);
    
    // Test
    const order = { id: 1, total: 100 };
    await service.processOrder(order);
    
    // Verify interactions
    expect(mockPayment.charge).toHaveBeenCalledWith(100);
    expect(mockEmail.sendConfirmation).toHaveBeenCalledWith(order);
  });
});
```

---

### 6. Spy Pattern (Verify Behavior)

**Pattern:** Verify that methods are called correctly.

```javascript
test('logger records order processing', async () => {
  const logger = {
    info: jest.fn(),
    error: jest.fn()
  };
  
  const service = new OrderService(mockPayment, mockEmail, logger);
  
  await service.processOrder(order);
  
  expect(logger.info).toHaveBeenCalledWith('Processing order', order.id);
  expect(logger.info).toHaveBeenCalledTimes(1);
  expect(logger.error).not.toHaveBeenCalled();
});
```

---

### 7. Stub Pattern (Control Responses)

**Pattern:** Return predetermined responses.

```javascript
test('handles payment gateway failure', async () => {
  const mockPayment = {
    charge: jest.fn().mockRejectedValue(new Error('Payment declined'))
  };
  
  const service = new OrderService(mockPayment, mockEmail);
  
  await expect(service.processOrder(order)).rejects.toThrow('Payment declined');
});
```

---

## Integration Test Patterns

### 8. Test Containers Pattern

**Pattern:** Use real dependencies (database, cache) in Docker containers.

```javascript
describe('OrderRepository integration tests', () => {
  let container;
  let repository;
  
  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer().start();
    const connectionString = container.getConnectionString();
    repository = new OrderRepository(connectionString);
  });
  
  afterAll(async () => {
    await container.stop();
  });
  
  test('saves and retrieves order', async () => {
    const order = { userId: 1, total: 100, items: [...] };
    
    const saved = await repository.save(order);
    const retrieved = await repository.findById(saved.id);
    
    expect(retrieved).toEqual(saved);
  });
});
```

---

### 9. API Contract Testing

**Pattern:** Test that API matches expected contract.

```javascript
describe('GET /api/orders/:id', () => {
  test('returns order with correct schema', async () => {
    const response = await request(app)
      .get('/api/orders/123')
      .expect(200)
      .expect('Content-Type', /json/);
    
    // Validate response schema
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      userId: expect.any(Number),
      status: expect.stringMatching(/^(pending|completed|cancelled)$/),
      total: expect.any(Number),
      items: expect.arrayContaining([
        expect.objectContaining({
          productId: expect.any(Number),
          quantity: expect.any(Number),
          price: expect.any(Number)
        })
      ]),
      createdAt: expect.any(String) // ISO 8601
    });
  });
});
```

---

## Test Isolation Patterns

### 10. Setup and Teardown

**Pattern:** Ensure clean state between tests.

```javascript
describe('UserService', () => {
  let service;
  let database;
  
  beforeEach(async () => {
    // Fresh state for each test
    database = await setupTestDatabase();
    service = new UserService(database);
  });
  
  afterEach(async () => {
    // Clean up after each test
    await database.clear();
    await database.close();
  });
  
  test('creates user', async () => {
    const user = await service.createUser({ name: 'Alice' });
    expect(user.id).toBeDefined();
  });
  
  test('finds user by id', async () => {
    const created = await service.createUser({ name: 'Bob' });
    const found = await service.findById(created.id);
    expect(found.name).toBe('Bob');
  });
});
```

---

### 11. Test Factories

**Pattern:** Create test data consistently.

```javascript
// factories/order.factory.js
export function createOrder(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    userId: 1,
    status: 'pending',
    total: 100,
    items: [
      { productId: 1, quantity: 2, price: 25 },
      { productId: 2, quantity: 1, price: 50 }
    ],
    createdAt: new Date().toISOString(),
    ...overrides // Allow customization
  };
}

// usage in tests
test('calculates tax correctly', () => {
  const order = createOrder({ total: 200 });
  expect(calculateTax(order)).toBe(16); // 8% of 200
});

test('handles large orders', () => {
  const order = createOrder({ total: 10000 });
  expect(order.total).toBeGreaterThan(5000);
});
```

---

## Snapshot Testing

### 12. Component Snapshot Testing

**Pattern:** Capture and verify component output.

```javascript
test('renders order summary correctly', () => {
  const order = createOrder();
  const component = render(<OrderSummary order={order} />);
  
  expect(component).toMatchSnapshot();
});
```

**When to use:**
- UI components
- Large data structures
- API responses

**When NOT to use:**
- Frequently changing data (dates, IDs)
- Non-deterministic output
- Binary data

---

## Performance Testing Patterns

### 13. Benchmark Testing

**Pattern:** Ensure code meets performance requirements.

```javascript
test('processes 1000 orders in under 100ms', async () => {
  const orders = Array.from({ length: 1000 }, () => createOrder());
  
  const start = Date.now();
  await Promise.all(orders.map(o => processOrder(o)));
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(100);
});
```

---

## Test Smells (What to Avoid)

### ❌ Test Interdependence

**Bad:** Tests depend on execution order.

```javascript
// 🚨 BAD: Test 2 depends on Test 1
let userId;

test('creates user', async () => {
  const user = await createUser({ name: 'Alice' });
  userId = user.id; // Leaking state
});

test('finds user', async () => {
  const user = await findUser(userId); // Depends on previous test
  expect(user.name).toBe('Alice');
});
```

**Good:** Each test is independent.

```javascript
// ✅ GOOD: Independent tests
test('creates user', async () => {
  const user = await createUser({ name: 'Alice' });
  expect(user.id).toBeDefined();
});

test('finds user', async () => {
  const created = await createUser({ name: 'Bob' });
  const found = await findUser(created.id);
  expect(found.name).toBe('Bob');
});
```

---

### ❌ Testing Implementation Details

**Bad:** Test internal structure instead of behavior.

```javascript
// 🚨 BAD: Testing private methods
test('_validateEmail is called', () => {
  const spy = jest.spyOn(service, '_validateEmail');
  service.registerUser({ email: 'test@example.com' });
  expect(spy).toHaveBeenCalled();
});
```

**Good:** Test public API behavior.

```javascript
// ✅ GOOD: Testing behavior
test('rejects invalid email', () => {
  expect(() => {
    service.registerUser({ email: 'invalid' });
  }).toThrow('Invalid email');
});
```

---

### ❌ Fragile Tests

**Bad:** Tests break on irrelevant changes.

```javascript
// 🚨 BAD: Brittle test
test('renders welcome message', () => {
  const html = render(<Welcome user={user} />);
  expect(html).toBe('<div class="welcome">Hello, Alice!</div>');
  // Breaks if class name changes, even if functionality same
});
```

**Good:** Test behavior, not implementation.

```javascript
// ✅ GOOD: Resilient test
test('displays user name in welcome message', () => {
  const component = render(<Welcome user={user} />);
  expect(component.text()).toContain('Hello, Alice!');
  // Works regardless of HTML structure
});
```

---

## Test Checklist

Before marking a task complete, verify:

### Unit Tests
- [ ] Happy path covered
- [ ] Edge cases covered (boundaries, null, empty)
- [ ] Error cases covered (exceptions, invalid input)
- [ ] All public methods tested
- [ ] Test names describe behavior clearly
- [ ] Tests are isolated (no interdependence)
- [ ] Tests use AAA or Given-When-Then structure

### Integration Tests
- [ ] Component interactions tested
- [ ] Database operations tested
- [ ] API contracts validated
- [ ] External dependencies mocked or containerized
- [ ] Tests clean up after themselves

### E2E Tests (if applicable)
- [ ] Critical user flows covered
- [ ] Tests run in CI environment
- [ ] Tests are deterministic (no flaky tests)
- [ ] Proper waits/timeouts configured

### General
- [ ] All tests pass locally
- [ ] All tests pass in CI
- [ ] No skipped/ignored tests without documentation
- [ ] Test coverage meets team standard (usually ≥80%)
- [ ] Tests run in reasonable time
- [ ] No console warnings during test run

---

**Remember:** Tests are documentation. They show how your code should be used and what it does. Write tests that you'd want to read six months from now when you've forgotten how the code works.
