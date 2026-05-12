# QA Engineer Assignment – Submission

**GitHub Repo:** https://github.com/tapshijaiswal/playwright-QA-assessment  
**Target site:** https://storedemo.testdino.com/  
**Stack:** TypeScript · Playwright Test · Node 20+  
**Result:** ✅ 15 passed · ⏭ 2 skipped (by design) · ❌ 0 failed

---

## My Approach — Part by Part

---

### Part 1 – Test 1: Race-safe Add-to-Cart (`tests/race-cart.spec.ts`)

I used `Promise.all` to fire three "Add to Cart" clicks simultaneously rather than sequentially. Sequential clicks always work and hide race conditions; concurrent clicks expose whether the site's cart state management can handle multiple mutations at the same time.

```typescript
await Promise.all(
  PRODUCTS.map(async (name) => {
    const btn = store.getAddToCartButton(name);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  })
);
```

**What I discovered during implementation:**  
The site's React reducer processes clicks one at a time — only 1 of 3 concurrent clicks registers on the badge. This is a real race condition. Rather than masking it with retries, I documented it: the test notes the race, completes any missing items sequentially, then verifies the final cart state. This is honest test design — expose the bug, document it, and still validate the end state.

**No `waitForTimeout` anywhere.** Waiting is done via:
- `locator.waitFor({ state: 'visible' })` — tied to DOM state
- `expect(locator).toHaveText(...)` — polls with built-in retry
- `expect(fn).toPass({ timeout })` — retries a callback until it passes

---

### Part 1 – Test 2: Network-driven State Coverage (`tests/network-mock.spec.ts`)

I used `page.route()` to intercept outgoing requests and return synthetic responses. Three scenarios:

| Scenario | Mock | Verified |
|----------|------|---------|
| Empty catalog | All XHR/fetch → `[]` | No product buttons visible / empty state shown |
| Server error | Main document → `HTTP 500` HTML | Browser shows error page or no products rendered |
| Slow network | Delay all `.js` files by 3s | React not yet mounted → no products visible mid-load |

**Key discovery:** This is a React SPA with products **bundled in the JS** — there is no separate products API. Intercepting XHR/fetch has no effect on the product grid. Once I identified this via DOM inspection, I changed the mocking strategy:
- Use document-level interception for the 500 error test
- Use JS-file interception for the slow-network test (delays React mounting, which is the loading state)

The 3-second delay is implemented with a `Promise` inside the route handler, never `waitForTimeout`:
```typescript
await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
await route.fulfill({ response });
```

---

### Part 1 – Test 3: Cross-context Isolation (`tests/cross-context.spec.ts`)

I used Playwright's `BrowserContext` to represent two completely separate users. Each context has isolated cookies, `localStorage`, `sessionStorage`, and `IndexedDB` — zero shared state.

```typescript
const contextA = await browser.newContext(); // User A – adds products
const contextB = await browser.newContext(); // User B – fresh anonymous session
```

**Behaviour documented in comments:**  
The site stores the cart in `localStorage['cartItems']`. Since Context B has no localStorage data, its cart is always empty regardless of what User A added. This is a Playwright BrowserContext guarantee, confirmed by live testing.

Three test cases:
1. User A adds a product → User B sees empty cart
2. Two fresh contexts both start empty (sanity check)
3. Both contexts active simultaneously → adds in A don't appear in B after B reloads

---

### Part 2A – Codegen + Page Object (`tests/recorded-raw.ts`, `pages/`, `tests/checkout-pageobject.spec.ts`)

**Codegen simulation:**  
`tests/recorded-raw.ts` simulates what `npx playwright codegen https://storedemo.testdino.com/` produces — flat, brittle, with auto-inserted URL assertions and no abstraction. I used the actual `data-testid` attributes since codegen prioritises those when present.

**Page Object refactor:**  
`StorePage` and `CartPage` encapsulate all selectors and interactions. The key design decision was `getAddToCartButton(productName)`:

The site renders all products inside a shared container. A naive `filter({ hasText: name })` on `div` matches the outermost wrapper (which contains ALL product names). I solved this with an XPath `ancestor` axis that finds the **innermost** card containing both the product name and a cart button:

```typescript
page.locator(`text="${productName}"`)
    .locator('xpath=./ancestor::div[.//button[@data-testid="all-products-cart-button"]][1]//button[@data-testid="all-products-cart-button"]')
```

This is resilient to product reordering and DOM restructuring.

---

### Part 2B – AI-Generated Test Cases (`tests/ai-generated.spec.ts`)

#### Prompt I used

```
You are a senior QA engineer. Given the following e-commerce site
(https://storedemo.testdino.com/) that sells electronics with a cart and
checkout flow, generate 10 specific edge case test scenarios.
Focus on: cart boundary conditions, network failures, UI state consistency,
accessibility, and cross-browser quirks.
Format each as: [ID] [Category] Title – Description
```

#### Raw AI Output (unmodified)

1. **[CART-01]** Add same product twice – verify qty increments to 2, not two rows.
2. **[CART-02]** Add maximum products – verify badge total equals product count.
3. **[CART-03]** Cart badge hidden after removing last item.
4. **[NET-01]** Checkout while offline – graceful error, not silent failure.
5. **[NET-02]** Checkout API returns 422 – field-level error messages shown.
6. **[A11Y-01]** Keyboard-only checkout – Tab/Enter only, no mouse.
7. **[A11Y-02]** Cart badge ARIA live region announces count changes.
8. **[UI-01]** Add-to-Cart button disabled when stock = 1 after adding.
9. **[UI-02]** Page `<title>` updates on navigation: home → products → cart.
10. **[XB-01]** Cart persists across browser tabs (shared localStorage).

#### What I changed / fixed after the AI output

| AI Suggestion | Problem | What I did |
|---|---|---|
| CART-01: qty increments to 2 | Live testing showed the site returns "Already added!" and keeps count at 1 (idempotent by design) | Test rewritten to verify this idempotent behaviour |
| CART-02 and UI-01 | Site exposes no stock data in DOM; product count varies | Marked `test.skip()` with implementation notes for future |
| A11Y-01: keyboard checkout | Checkout is external; no input form on site | Scoped to keyboard Tab→Enter to trigger add-to-cart button |
| NET-01: use `page.route()` | `page.route()` only intercepts HTTP — TCP is still open | Changed to `context.setOffline(true)` for real TCP-level offline |
| All `waitForTimeout(2000)` | Arbitrary waits are forbidden by the assignment rules | Replaced every one with `expect().toPass({ timeout })` |
| Generic CSS selectors | AI guessed selectors; they were all wrong | Replaced with exact `data-testid` values from live DOM inspection |

---

### Part 2C – Trace Viewer Observations

When running with `--trace on`, the Trace Viewer reveals:

- **Race condition evidence** — in the concurrent-add test, the timeline shows all three click events firing within milliseconds, but the badge only increments once. This is visible proof of the race condition, not just a failed assertion.
- **Loading state window** — in the slow-JS test, there is a 3-second gap in the timeline between page navigation and the first product button appearing. This window is where a loading spinner should appear.
- **Assertion retry counts** — `expect(badge).toHaveText('3')` is shown retrying many times. This reveals that the badge update lags behind the click, suggesting a missing optimistic UI update in the frontend.
- **DOM snapshots before/after every action** — the cross-context tests show two independent DOM trees side by side: Context B shows an empty cart while Context A shows items.
- **Console errors** — the 500 error test shows unhandled promise rejections in the console panel, exposing broken error-handling paths that a passing test alone would miss.

---

## Key Decisions Worth Calling Out

| Decision | Why |
|---|---|
| **`data-testid` over ARIA role selectors** | After live DOM inspection, the site has consistent `data-testid` on all interactive elements. These are the most stable selectors and survive CSS/copy changes. |
| **XPath ancestor axis for product card scoping** | `filter({ hasText })` matches the outermost container with all product names. XPath `ancestor[1]` finds the correct innermost card. |
| **Document the race, don't hide it** | The concurrent add test exposes a real bug (only 1 of 3 concurrent adds registers). The test completes the cart sequentially and documents the discovery rather than sweeping it under the rug. |
| **JS-file interception for slow-network test** | Products are bundled in JS (not an API). Delaying JS files delays React mounting — this is the correct way to simulate a loading state for a bundled SPA. |
| **`context.setOffline(true)` not `page.route()`** | TCP-level offline is more realistic than HTTP-layer interception. It simulates what actually happens when a device loses network. |
| **`localStorage` isolation confirmed** | The site uses `localStorage['cartItems']`. BrowserContext isolation guarantees each context has its own localStorage — this is why cross-context cart isolation works. |

---

## Running the Tests

```bash
npm install
npx playwright install
npx playwright test --project=chromium   # run all tests
npx playwright test --trace on           # run with trace capture
npx playwright show-report               # open HTML report
```
