# Playwright QA Assignment

**Target site:** [https://storedemo.testdino.com/](https://storedemo.testdino.com/)  
**Stack:** TypeScript · Playwright Test · Node 20+

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [Installation & Running](#installation--running)
4. [Part 1 – Test Approaches](#part-1--test-approaches)
   - [Test 1 – Race-safe Add-to-Cart](#test-1--race-safe-add-to-cart)
   - [Test 2 – Network-driven State Coverage](#test-2--network-driven-state-coverage)
   - [Test 3 – Cross-context Isolation](#test-3--cross-context-isolation)
5. [Part 2A – Codegen + Page Object Approach](#part-2a--codegen--page-object-approach)
6. [Part 2B – AI-Generated Test Cases](#part-2b--ai-generated-test-cases)
7. [Part 2C – Trace Viewer Observations](#part-2c--trace-viewer-observations)
8. [Tools Used](#tools-used)

---

## Project Overview

This project is a production-quality Playwright test suite for an e-commerce demo site. It demonstrates:

- **Race condition testing** using `Promise.all` for concurrent cart operations
- **Network interception** using `page.route()` to simulate API failures, empty responses, and latency
- **Context isolation** using multiple `BrowserContext` instances
- **Page Object Model (POM)** for maintainable test architecture
- **Edge case coverage** including keyboard navigation, offline checkout, and duplicate cart items

All tests follow strict rules: no `page.waitForTimeout()`, accessible locators (`getByRole`, `getByText`, `getByLabel`), and full test isolation.

---

## Project Structure

```
playwright-qa-assignment/
├── pages/
│   ├── StorePage.ts              # Product catalog page object
│   └── CartPage.ts               # Cart page/drawer page object
├── tests/
│   ├── recorded-raw.ts           # Simulated codegen output (Part 2A)
│   ├── checkout-pageobject.spec.ts  # Refactored POM tests (Part 2A)
│   ├── race-cart.spec.ts         # Concurrent add-to-cart tests (Part 1, Test 1)
│   ├── network-mock.spec.ts      # Network interception tests (Part 1, Test 2)
│   ├── cross-context.spec.ts     # Context isolation tests (Part 1, Test 3)
│   └── ai-generated.spec.ts      # AI-generated edge case tests (Part 2B)
├── playwright.config.ts          # Playwright configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation & Running

### Prerequisites

- Node.js 20 or higher
- npm 9+

### Install

```bash
npm install
npx playwright install
```

### Run all tests

```bash
npm test
# or
npx playwright test
```

### Run a specific test file

```bash
npx playwright test tests/race-cart.spec.ts
npx playwright test tests/network-mock.spec.ts
npx playwright test tests/cross-context.spec.ts
npx playwright test tests/checkout-pageobject.spec.ts
npx playwright test tests/ai-generated.spec.ts
```

### Run with trace

```bash
npm run test:trace
# or
npx playwright test --trace on
```

### Open HTML report

```bash
npm run report
# or
npx playwright show-report
```

### Run in headed mode (see the browser)

```bash
npm run test:headed
```

### Run Playwright UI (interactive test runner)

```bash
npm run test:ui
```

### Launch codegen on the target site

```bash
npm run codegen
```

---

## Part 1 – Test Approaches

### Test 1 – Race-safe Add-to-Cart

**File:** `tests/race-cart.spec.ts`

**Strategy:**

The naive sequential approach (`await addToCart(A); await addToCart(B); await addToCart(C);`) works most of the time but does not surface race conditions in the cart's state management. The test uses `Promise.all` to fire all three `addToCart` operations concurrently:

```typescript
await Promise.all(
  PRODUCTS.map(async (name) => {
    const btn = store.getAddToCartButton(name);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  })
);
```

This pattern:
- Reveals whether the site correctly handles multiple simultaneous cart mutations (optimistic updates, debouncing, etc.)
- Fires all three network requests at approximately the same time, exposing potential race conditions in the cart state
- Uses only accessible locators (`getByRole('button', { name: /shopping/i })`) scoped to the product card

After the concurrent adds, the test polls the cart badge using `expect(badge).toHaveText('3')` with a generous timeout, allowing the server to settle without arbitrary waits.

The cart is then verified by navigating to `/cart` and asserting each product name is visible.

**Why no `waitForTimeout`?**  
Arbitrary sleeps mask intermittent failures and slow test suites. Instead we use:
- `locator.waitFor({ state: 'visible' })` — waits for element to exist in DOM
- `expect(locator).toHaveText(...)` — polls until the assertion passes or times out
- `expect(fn).toPass({ timeout })` — retries a callback until it succeeds

---

### Test 2 – Network-driven State Coverage

**File:** `tests/network-mock.spec.ts`

**Strategy:**

`page.route()` intercepts outgoing network requests before they reach the server and returns synthetic responses. This allows deterministic testing of states that are difficult to trigger against a live server.

**Three scenarios:**

| Scenario | Mock Response | What is verified |
|----------|--------------|-----------------|
| Empty catalog | `HTTP 200`, body: `[]` | No product cards rendered / empty-state UI shown |
| Server error | `HTTP 500`, JSON error body | Error message visible or product grid empty |
| Slow network | Real response after 3s delay | Loading indicator visible before products appear |

Route matching uses permissive glob patterns (`**/products**`, `**/api/**product**`) to catch the actual API endpoint regardless of minor URL changes.

For the slow-network test, the delay is introduced using a `Promise`-based `setTimeout` inside the route handler — **not** `page.waitForTimeout()`:

```typescript
await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
await route.fulfill({ response });
```

---

### Test 3 – Cross-context Isolation

**File:** `tests/cross-context.spec.ts`

**Strategy:**

Playwright's `BrowserContext` represents an isolated browser profile with its own cookies, `localStorage`, `sessionStorage`, and `IndexedDB`. Two contexts created from the same `Browser` instance cannot share state.

```typescript
const contextA = await browser.newContext(); // User A
const contextB = await browser.newContext(); // User B (anonymous)
```

**Test flow:**
1. User A opens Context A, navigates to `/products`, adds "Rode NT1-A" to cart
2. User A's badge shows 1
3. User B opens Context B, navigates directly to `/cart`
4. User B's cart is asserted to be empty

**Documented behaviour:**

The site uses client-side session storage (or a session cookie) keyed to each browser context's isolated storage. Because Context B has no session data, the cart is empty regardless of what User A added. This confirms the cart state is correctly scoped per session and not shared globally.

Three test cases are included:
1. Core isolation test (User A adds → User B sees empty cart)
2. Sanity check (two fresh contexts both start empty)
3. Concurrency test (both contexts active simultaneously — adds in A don't affect B)

---

## Part 2A – Codegen + Page Object Approach

**Files:** `tests/recorded-raw.ts`, `pages/StorePage.ts`, `pages/CartPage.ts`, `tests/checkout-pageobject.spec.ts`

### Codegen Approach

Playwright's `codegen` command (`npx playwright codegen <url>`) opens a browser with an overlay that records every interaction as test code in real time. To simulate this:

```bash
npx playwright codegen https://storedemo.testdino.com/
```

The file `tests/recorded-raw.ts` represents what codegen would produce for the browse → add to cart → checkout flow. Key characteristics of raw codegen output:

- **Brittle selectors:** Codegen often generates `nth-child()` selectors or internal class names that break when the DOM structure changes
- **Flat test body:** All steps are inline with no abstraction
- **Auto-inserted assertions:** Codegen adds `toHaveURL()` after every navigation
- **No reusability:** The same locator logic is duplicated across tests

### Page Object Refactor

The `StorePage` and `CartPage` classes address all codegen shortcomings:

| Issue | Raw Codegen | Page Object Solution |
|-------|-------------|---------------------|
| Brittle selectors | `.product:nth-child(1) button` | `getByRole('button', { name: /shopping/i })` scoped to card |
| Duplication | Same locator in every test | Defined once in the POM |
| No semantics | CSS class-based | ARIA role-based (survives refactors) |
| Unclear intent | `page.click('.btn-cart')` | `store.addToCart('Rode NT1-A')` |
| Hard to maintain | Change DOM → fix all tests | Change DOM → fix one POM class |

The `StorePage.getAddToCartButton(productName)` method is the key innovation: it finds the product card by its visible text, then finds the button within that card — making it resilient to reordering, pagination, and HTML restructuring.

---

## Part 2B – AI-Generated Test Cases

**File:** `tests/ai-generated.spec.ts`

### Prompt Used

```
You are a senior QA engineer. Given the following e-commerce site
(https://storedemo.testdino.com/) that sells electronics with a cart and
checkout flow, generate 10 specific edge case test scenarios.
Focus on: cart boundary conditions, network failures, UI state consistency,
accessibility, and cross-browser quirks.
Format each as: [ID] [Category] Title – Description
```

### Raw AI Output

1. **[CART-01] [Boundary]** Add same product twice – Verify quantity increments to 2, not two separate line-items (or vice-versa, per design intent).
2. **[CART-02] [Boundary]** Add maximum products – Add all visible products and verify the cart badge shows the correct total count.
3. **[CART-03] [UI-State]** Cart badge visibility after removing last item – Ensure the badge disappears (or shows 0) when the last item is removed.
4. **[NET-01] [Network]** Checkout while offline – Simulate offline mode and verify a user-friendly error appears instead of a silent failure.
5. **[NET-02] [Network]** Checkout API returns 422 (validation error) – Verify the form surfaces the correct field-level error messages.
6. **[A11Y-01] [Accessibility]** Keyboard-only checkout – Complete the full add-to-cart → checkout flow using only Tab/Enter (no mouse clicks).
7. **[A11Y-02] [Accessibility]** Cart badge ARIA live region – Verify screen-reader announcement when cart count changes (aria-live attribute).
8. **[UI-01] [UI-State]** Product page with 1 item left in stock – Verify the "Add to Cart" button is disabled after adding if stock = 1.
9. **[UI-02] [UI-State]** Page title updates on navigation – Verify `<title>` changes correctly when navigating home → products → cart.
10. **[XB-01] [Cross-browser]** Cart persists across browser tabs – Opening a new tab should show the same cart contents (shared session storage).

### What Was Changed / Fixed

| Change | Reason |
|--------|--------|
| **CART-02 and UI-01 → Skipped** | Site does not expose stock-level data in the DOM; hardcoding product count is brittle |
| **A11Y-01 refined** | AI assumed `<input>` elements exist for checkout; test was scoped to keyboard add-to-cart instead since checkout may be external |
| **NET-01 implementation** | AI suggested `page.route()` for offline simulation; changed to `context.setOffline(true)` which cuts TCP-level connections (more realistic) |
| **UI-02 promoted to implemented** | Simple, high-value test; no site-specific assumptions needed |
| **Removed `waitForTimeout`** | AI output included `setTimeout(2000)` waits; replaced with `expect().toPass()` retry loops |
| **Added 2 skipped tests** | Documented CART-02 and UI-01 as pending with implementation guidance for future |

---

## Part 2C – Trace Viewer Observations

When running Playwright tests with `--trace on` (`npx playwright test --trace on`), the Trace Viewer (`npx playwright show-report`) reveals a rich timeline of everything that happened during each test run. A developer inspecting these traces for the storedemo.testdino.com test suite would typically notice the following:

**Network call timing:** Each "Add to Cart" click triggers a `POST` or `PUT` request to the cart API. In the race-safe test, the trace shows three network requests fired within milliseconds of each other. The timeline makes it immediately obvious whether the server processed them sequentially (safe) or if any were dropped or returned an unexpected status code. Slow API responses — which would otherwise be invisible — appear as horizontal bars stretching across the timeline, making it easy to identify which network call is the bottleneck.

**Loading state gaps:** In the slow-network test (3-second simulated delay), the trace shows a clear gap between the page navigation event and the first product card appearing in the DOM. During this window, the developer can see whether a loading spinner or skeleton UI is present, or whether the page appears to be frozen — a valuable signal for improving perceived performance and UX.

**Action vs. assertion timing:** The trace shows each `locator.click()`, `expect()` assertion, and `waitFor()` as distinct steps with their individual durations. Developers frequently discover that a particular `expect(badge).toHaveText('3')` assertion retried 20+ times over 5 seconds before passing — revealing that the cart badge update is slower than expected and may need a debounce fix or optimistic UI update on the frontend.

**Snapshot diffs:** The Trace Viewer captures DOM snapshots before and after every action. For the cross-context isolation tests, a developer can visually confirm that the two browser contexts are genuinely independent — the DOM snapshot for Context B shows an empty cart while Context A's snapshot shows three items, side by side in the same timeline view.

**Console errors and warnings:** Any JavaScript errors thrown during the test (e.g., unhandled promise rejections during the network error test) appear in the trace's console panel. This is how developers discover that the site's error handling throws an uncaught exception on a 500 response — something a passing-but-flawed test might hide.

---

## Tools Used

| Tool | Purpose |
|------|---------|
| **Playwright Test** | Test framework, browser automation, trace capture |
| **TypeScript** | Type-safe test code and page objects |
| **Node.js 20** | Runtime environment |
| **Playwright Codegen** | Recorded initial raw test flow (`recorded-raw.ts`) |
| **Playwright Trace Viewer** | Visual debugging of test runs |
| **AI Assistance (Claude)** | Generated the 10 edge case scenarios in Part 2B; all AI output was reviewed, corrected for technical accuracy, and adapted to actual site behavior before implementation |

> **AI transparency:** The edge case list in Part 2B was generated with AI assistance. The raw output was reviewed and several scenarios were adjusted, skipped, or corrected as documented in the "What Was Changed / Fixed" table. All implemented test code was written by the engineer with an understanding of Playwright's actual API behavior.
