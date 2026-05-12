import { test, expect, Browser } from '@playwright/test';
import { StorePage } from '../pages/StorePage';
import { CartPage } from '../pages/CartPage';

/**
 * PART 1 – Test 3: Cross-context Cart Isolation
 *
 * Strategy:
 * ─────────
 * Playwright's BrowserContext is an isolated browser profile with its own
 * cookies, localStorage, sessionStorage, and IndexedDB. Two contexts created
 * from the same Browser cannot share state.
 *
 * storedemo.testdino.com stores cart data in localStorage. Each BrowserContext
 * has a completely separate localStorage, so User B's cart is always empty
 * regardless of what User A added.
 *
 * No page.waitForTimeout() is used anywhere.
 */

test.describe('Cross-context Cart Isolation', () => {

  /**
   * Core isolation test:
   * User A adds a product → User B (fresh context) sees empty cart.
   */
  test('User B sees empty cart while User A has items', async ({ browser }: { browser: Browser }) => {
    // ── Context A – User A ──────────────────────────────────────────────────
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const storeA = new StorePage(pageA);

    await storeA.goto();
    await storeA.addToCart('Rode NT1-A Condenser Mic');
    await storeA.expectCartCount(1);

    // ── Context B – User B (anonymous, fresh context) ───────────────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const cartB = new CartPage(pageB);

    await cartB.goto();

    /**
     * BEHAVIOUR NOTE:
     * ───────────────
     * Context B has no localStorage data (fresh context). The site reads cart
     * items from localStorage on mount. With no data present, the cart renders
     * empty – confirming per-session isolation.
     *
     * This is a BrowserContext guarantee in Playwright: localStorage is strictly
     * isolated between contexts, even within the same Browser instance.
     */
    await cartB.expectEmpty();

    await contextA.close();
    await contextB.close();
  });

  /**
   * Sanity: two fresh contexts both start with empty carts.
   */
  test('two fresh contexts both start with empty carts', async ({ browser }: { browser: Browser }) => {
    const ctxAlpha = await browser.newContext();
    const ctxBeta = await browser.newContext();

    const pageAlpha = await ctxAlpha.newPage();
    const pageBeta = await ctxBeta.newPage();

    await Promise.all([
      pageAlpha.goto('/cart'),
      pageBeta.goto('/cart'),
    ]);

    const cartAlpha = new CartPage(pageAlpha);
    const cartBeta = new CartPage(pageBeta);

    // Read item counts from both contexts simultaneously.
    const [countAlpha, countBeta] = await Promise.all([
      cartAlpha.cartItems.count(),
      cartBeta.cartItems.count(),
    ]);

    expect(countAlpha).toBe(0);
    expect(countBeta).toBe(0);

    await ctxAlpha.close();
    await ctxBeta.close();
  });

  /**
   * Simultaneous isolation: adding items in A while B is active should not
   * affect B after a reload.
   */
  test('carts remain isolated when both contexts are active simultaneously', async ({ browser }: { browser: Browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const storeA = new StorePage(pageA);
    const cartB = new CartPage(pageB);

    // Both navigate at the same time.
    await Promise.all([
      storeA.goto(),
      pageB.goto('/cart'),
    ]);

    // User A adds two products concurrently.
    await Promise.all([
      storeA.addToCart('JBL Charge 4 Bluetooth Speaker'),
    ]);
    await storeA.addToCart('Seagate 4TB External Hard Drive');

    // Reload User B's cart to ensure no stale cache.
    await pageB.reload();
    await pageB.waitForURL('**/cart');
    await pageB.waitForLoadState('domcontentloaded');

    /**
     * BEHAVIOUR NOTE:
     * ───────────────
     * After reload, User B's page re-reads localStorage. Since Context B's
     * localStorage was never written to, the cart is still empty.
     * This confirms localStorage isolation is enforced per-context by the
     * browser (and by Playwright's context model).
     */
    await cartB.expectEmpty();

    await contextA.close();
    await contextB.close();
  });
});
