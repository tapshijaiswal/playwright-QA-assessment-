/**
 * PART 2A – Simulated Playwright Codegen Output
 * ─────────────────────────────────────────────
 * This file simulates what `playwright codegen https://storedemo.testdino.com/`
 * would record for the browse → add to cart → checkout flow.
 *
 * To run codegen yourself:
 *   npx playwright codegen https://storedemo.testdino.com/
 *
 * Codegen characteristics preserved here:
 *  - Uses page.goto, page.click with generated selectors
 *  - Codegen picks data-testid attributes when available (highest priority)
 *  - Includes auto-inserted assertions (toHaveURL, toBeVisible)
 *  - No abstraction – everything is inline in one flat test body
 *  - This is intentionally NOT refactored (see checkout-pageobject.spec.ts for
 *    the refactored Page Object version)
 *
 * NOTE: This file is *.ts (not *.spec.ts) so it is NOT picked up by the default
 * Playwright testMatch glob. It serves as documentation of the codegen starting
 * point. To execute it: npx playwright test tests/recorded-raw.ts
 */

import { test, expect } from '@playwright/test';

test('browse → add to cart → checkout (raw codegen simulation)', async ({ page }) => {
  // ── 1. Open the home page ────────────────────────────────────────────────────
  await page.goto('https://storedemo.testdino.com/');

  // ── 2. Navigate to All Products via nav link ──────────────────────────────────
  // Codegen records a click on the element with data-testid="header-menu-all-products".
  await page.getByTestId('header-menu-all-products').click();

  // Codegen auto-inserts URL assertion after navigation.
  await expect(page).toHaveURL(/.*products/);

  // ── 3. Add first product to cart ─────────────────────────────────────────────
  // Codegen uses .first() when multiple matching elements exist.
  await page.getByTestId('all-products-cart-button').first().click();

  // ── 4. Add a second product ──────────────────────────────────────────────────
  await page.getByTestId('all-products-cart-button').nth(1).click();

  // ── 5. Open the cart side drawer ─────────────────────────────────────────────
  await page.getByTestId('header-cart-icon').click();

  // Codegen asserts the cart drawer header is visible.
  await expect(page.getByTestId('cart-header')).toBeVisible();

  // ── 6. Navigate to /cart via "View Cart" button ───────────────────────────────
  await page.getByRole('button', { name: /view cart/i }).click();

  await expect(page).toHaveURL(/.*cart/);

  // ── 7. Proceed to checkout ────────────────────────────────────────────────────
  // The Checkout button on /cart has data-testid="cart-checkout-button".
  await page.getByTestId('cart-checkout-button').click();

  // Codegen records whatever state the page is in after click.
  await page.waitForLoadState('domcontentloaded');

  // ── End of recorded flow ──────────────────────────────────────────────────────
});
