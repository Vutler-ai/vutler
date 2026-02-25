# Implementation Patterns & Anti-Patterns

Common patterns to follow and anti-patterns to avoid during story implementation.

---

## ✅ Good Patterns

### 1. Single Responsibility Principle (SRP)

**Pattern:** Each function/class does ONE thing well.

**Good:**
```javascript
// Each function has single, clear responsibility
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function sendWelcomeEmail(user) {
  const template = loadTemplate('welcome');
  return emailService.send(user.email, template);
}

function registerUser(userData) {
  if (!validateEmail(userData.email)) {
    throw new Error('Invalid email');
  }
  const user = userRepository.create(userData);
  await sendWelcomeEmail(user);
  return user;
}
```

**Bad:**
```javascript
// God function doing too much
function registerUser(userData) {
  // Validation
  if (!userData.email.includes('@')) throw new Error('Invalid email');
  // Database logic
  const user = db.query('INSERT INTO users...');
  // Email logic
  const html = `<html><body>Welcome ${user.name}!</body></html>`;
  smtp.send(user.email, html);
  // Analytics
  analytics.track('user_registered', user.id);
  return user;
}
```

---

### 2. Dependency Injection

**Pattern:** Inject dependencies instead of hardcoding them.

**Good:**
```javascript
class OrderService {
  constructor(paymentGateway, emailService, logger) {
    this.paymentGateway = paymentGateway;
    this.emailService = emailService;
    this.logger = logger;
  }
  
  async processOrder(order) {
    try {
      await this.paymentGateway.charge(order.total);
      await this.emailService.sendConfirmation(order);
    } catch (error) {
      this.logger.error('Order processing failed', error);
      throw error;
    }
  }
}

// Easy to test with mocks
const mockPayment = { charge: jest.fn() };
const service = new OrderService(mockPayment, mockEmail, mockLogger);
```

**Bad:**
```javascript
class OrderService {
  async processOrder(order) {
    // Hardcoded dependencies - impossible to test
    await StripeGateway.charge(order.total);
    await SendGridService.sendConfirmation(order);
    console.log('Order processed'); // No logger injection
  }
}
```

---

### 3. Early Returns / Guard Clauses

**Pattern:** Handle edge cases early and return, keeping happy path unindented.

**Good:**
```javascript
function calculateDiscount(user, order) {
  if (!user) return 0;
  if (!user.isPremium) return 0;
  if (order.total < 100) return 0;
  
  // Happy path - clear and unindented
  const discount = order.total * 0.1;
  return Math.min(discount, user.maxDiscount);
}
```

**Bad:**
```javascript
function calculateDiscount(user, order) {
  if (user) {
    if (user.isPremium) {
      if (order.total >= 100) {
        // Happy path buried 3 levels deep
        const discount = order.total * 0.1;
        return Math.min(discount, user.maxDiscount);
      }
    }
  }
  return 0;
}
```

---

### 4. Immutability

**Pattern:** Don't modify input objects, create new ones.

**Good:**
```javascript
function addDiscount(order, discount) {
  return {
    ...order,
    discount,
    total: order.subtotal - discount
  };
}

// Original unchanged
const original = { subtotal: 100, total: 100 };
const updated = addDiscount(original, 10);
// original.total === 100 ✅
// updated.total === 90 ✅
```

**Bad:**
```javascript
function addDiscount(order, discount) {
  order.discount = discount;
  order.total = order.subtotal - discount;
  return order; // Mutated input - bugs and confusion
}
```

---

### 5. Explicit Error Handling

**Pattern:** Handle errors explicitly, provide context.

**Good:**
```javascript
async function fetchUserOrders(userId) {
  try {
    const orders = await orderRepository.findByUser(userId);
    if (!orders || orders.length === 0) {
      return { success: true, orders: [], message: 'No orders found' };
    }
    return { success: true, orders };
  } catch (error) {
    logger.error('Failed to fetch orders', { userId, error });
    throw new UserOrdersError(`Unable to load orders for user ${userId}`, error);
  }
}
```

**Bad:**
```javascript
async function fetchUserOrders(userId) {
  const orders = await orderRepository.findByUser(userId);
  return orders; // What if it throws? What if null?
}
```

---

### 6. Configuration Over Hardcoding

**Pattern:** Extract magic numbers and strings to configuration.

**Good:**
```javascript
const CONFIG = {
  DISCOUNT_THRESHOLD: 100,
  PREMIUM_DISCOUNT_RATE: 0.1,
  MAX_DISCOUNT: 50
};

function calculateDiscount(order, user) {
  if (order.total < CONFIG.DISCOUNT_THRESHOLD) return 0;
  if (!user.isPremium) return 0;
  
  const discount = order.total * CONFIG.PREMIUM_DISCOUNT_RATE;
  return Math.min(discount, CONFIG.MAX_DISCOUNT);
}
```

**Bad:**
```javascript
function calculateDiscount(order, user) {
  if (order.total < 100) return 0; // What is 100?
  if (!user.isPremium) return 0;
  
  const discount = order.total * 0.1; // What is 0.1?
  return Math.min(discount, 50); // What is 50?
}
```

---

## ❌ Anti-Patterns to Avoid

### 1. God Object / God Function

**Anti-Pattern:** One class/function that does everything.

**Why Bad:** Hard to test, understand, modify. Violates SRP.

**Example:**
```javascript
// 🚨 God Class - handles everything
class Application {
  constructor() {
    this.users = [];
    this.orders = [];
    this.payments = [];
  }
  
  registerUser(data) { /* ... */ }
  loginUser(email, password) { /* ... */ }
  createOrder(userId, items) { /* ... */ }
  processPayment(orderId, card) { /* ... */ }
  sendEmail(to, subject, body) { /* ... */ }
  generateReport(type) { /* ... */ }
  // ... 50 more methods
}
```

**Fix:** Split into focused classes (UserService, OrderService, PaymentService, etc.)

---

### 2. Shotgun Surgery

**Anti-Pattern:** Single change requires modifications in many places.

**Why Bad:** High risk of missing a spot, hard to maintain.

**Example:**
```javascript
// 🚨 Discount rate hardcoded everywhere
function calculateOrderDiscount(order) {
  return order.total * 0.1; // Discount rate
}

function displayDiscount(order) {
  const savings = order.total * 0.1; // Same rate duplicated
  return `You save $${savings}`;
}

function emailDiscount(user) {
  const estimated = 100 * 0.1; // Again!
  return `Potential savings: $${estimated}`;
}
```

**Fix:** Extract to configuration constant (`CONFIG.DISCOUNT_RATE`), use everywhere.

---

### 3. Primitive Obsession

**Anti-Pattern:** Using primitives instead of small objects/types.

**Why Bad:** Lose type safety, validation, encapsulation.

**Example:**
```javascript
// 🚨 Email is just a string - no validation
function sendEmail(email, subject, body) {
  // What if email is invalid?
  smtp.send(email, subject, body);
}

sendEmail('not-an-email', 'Hi', 'Body'); // Runtime error
```

**Fix:**
```javascript
class Email {
  constructor(address) {
    if (!this.isValid(address)) {
      throw new Error(`Invalid email: ${address}`);
    }
    this.address = address;
  }
  
  isValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  toString() {
    return this.address;
  }
}

function sendEmail(email, subject, body) {
  smtp.send(email.toString(), subject, body);
}

sendEmail(new Email('test@example.com'), 'Hi', 'Body'); // ✅ Validated
```

---

### 4. Cargo Cult Programming

**Anti-Pattern:** Copying code without understanding it.

**Why Bad:** Brings in bugs, unnecessary complexity, tech debt.

**Example:**
```javascript
// 🚨 Copied from StackOverflow without understanding
function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// Only needed simple delay, not debounce
```

**Fix:** Understand what you copy, or use well-tested library (lodash.debounce).

---

### 5. Magic Numbers/Strings

**Anti-Pattern:** Hardcoded values with no explanation.

**Why Bad:** Unclear intent, hard to change, error-prone.

**Example:**
```javascript
// 🚨 What do these numbers mean?
if (user.status === 3) {
  user.discount = order.total * 0.15;
  if (order.total > 500) {
    user.shipping = 0;
  }
}
```

**Fix:**
```javascript
const USER_STATUS = {
  ACTIVE: 1,
  SUSPENDED: 2,
  PREMIUM: 3
};

const PREMIUM_DISCOUNT_RATE = 0.15;
const FREE_SHIPPING_THRESHOLD = 500;

if (user.status === USER_STATUS.PREMIUM) {
  user.discount = order.total * PREMIUM_DISCOUNT_RATE;
  if (order.total > FREE_SHIPPING_THRESHOLD) {
    user.shipping = 0;
  }
}
```

---

### 6. Callback Hell

**Anti-Pattern:** Deeply nested callbacks.

**Why Bad:** Unreadable, hard to debug, error handling nightmare.

**Example:**
```javascript
// 🚨 Pyramid of doom
getUser(userId, (err, user) => {
  if (err) return handleError(err);
  getOrders(user.id, (err, orders) => {
    if (err) return handleError(err);
    processPayment(orders[0].id, (err, payment) => {
      if (err) return handleError(err);
      sendConfirmation(user.email, payment, (err, result) => {
        if (err) return handleError(err);
        console.log('Done!');
      });
    });
  });
});
```

**Fix:** Use async/await:
```javascript
async function processUserOrder(userId) {
  try {
    const user = await getUser(userId);
    const orders = await getOrders(user.id);
    const payment = await processPayment(orders[0].id);
    const result = await sendConfirmation(user.email, payment);
    console.log('Done!');
  } catch (error) {
    handleError(error);
  }
}
```

---

### 7. Copy-Paste Programming

**Anti-Pattern:** Duplicating code instead of abstracting.

**Why Bad:** Bugs multiply, changes require shotgun surgery.

**Example:**
```javascript
// 🚨 Same logic duplicated 3 times
function validateUserEmail(email) {
  if (!email) return false;
  if (!email.includes('@')) return false;
  if (email.length < 5) return false;
  return true;
}

function validateAdminEmail(email) {
  if (!email) return false;
  if (!email.includes('@')) return false;
  if (email.length < 5) return false;
  return true;
}

function validateGuestEmail(email) {
  if (!email) return false;
  if (!email.includes('@')) return false;
  if (email.length < 5) return false;
  return true;
}
```

**Fix:** Extract common logic:
```javascript
function validateEmail(email) {
  if (!email) return false;
  if (!email.includes('@')) return false;
  if (email.length < 5) return false;
  return true;
}

// Use single function for all cases
const isUserEmailValid = validateEmail(userEmail);
const isAdminEmailValid = validateEmail(adminEmail);
```

---

### 8. Not Invented Here (NIH) Syndrome

**Anti-Pattern:** Rewriting everything instead of using libraries.

**Why Bad:** Wastes time, introduces bugs, reinvents wheel.

**Example:**
```javascript
// 🚨 Custom date formatting (buggy, incomplete)
function formatDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
  // What about timezones? Locales? Leap years?
}
```

**Fix:** Use established library:
```javascript
import { format } from 'date-fns';

const formatted = format(new Date(), 'MM/dd/yyyy');
// Handles edge cases, tested, maintained
```

---

## Decision Framework

When implementing a story, ask yourself:

1. **Does this follow SOLID principles?**
   - Single Responsibility
   - Open/Closed
   - Liskov Substitution
   - Interface Segregation
   - Dependency Inversion

2. **Is this code testable?**
   - Can I write a unit test easily?
   - Are dependencies injectable?
   - Is logic separated from side effects?

3. **Is this readable?**
   - Would a new team member understand this?
   - Are names clear and meaningful?
   - Is complexity justified?

4. **Is this maintainable?**
   - Can I change this later without breaking everything?
   - Is there duplication?
   - Is configuration externalized?

5. **Is this secure?**
   - Is user input validated?
   - Are there injection vulnerabilities?
   - Are secrets protected?

If you answer "no" to any of these, refactor before proceeding.

---

**Remember:** Patterns are tools, not rules. Use them when they add value. Don't force patterns where they don't fit. Simplicity beats cleverness every time.
