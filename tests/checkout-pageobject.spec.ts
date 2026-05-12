import { test, expect } from '@playwright/test';
import { StorePage } from '../pages/StorePage';
import { CartPage } from '../pages/CartPage';

/**
 * PART 2A – Checkout Flow using Page Objects
 *
 * Key DOM testids (storedemo.testdino.com):
 *   data-testid="all-products-cart-button"  – add to cart button
 *   data-testid="header-cart-count"         – badge count
 *   data-testid="cart-header"               – drawer heading
 *   data-testid="cart-product-header"       – product name (drawer + /cart table)
 *   data-testid="cart-checkout-button"      – checkout button on /cart page
 *   data-testid="cart-delete-button"        – delete item button (1 per row)
 *
 * NOTE: "cart-product-header" is used for BOTH the table heading "Product"
 * AND the actual product name cells. We use getByText() for product assertions.
 *
 * CART PERSISTENCE: The site stores cart in localStorage['cartItems'].
 * Cart survives page reload within the same BrowserContext.
 *
 * No waitForTimeout() anywhere.
 */

test.describe('Checkout flow – Page Object version', () => {

  test('browse → add two products → view cart → checkout', async ({ page }) => {
    const store = new StorePage(page);
    const cart = new CartPage(page);

    // ── Step 1: Navigate to the product catalog ──────────────────────────────
    await store.goto();
    await expect(page).toHaveTitle(/testdino|store|products/i);

    // ── Step 2: Add two products ─────────────────────────────────────────────
    const PRODUCT_A = 'Rode NT1-A Condenser Mic';
    const PRODUCT_B = 'JBL Charge 4 Bluetooth Speaker';

    await store.addToCart(PRODUCT_A);
    await store.expectCartCount(1);

    await store.addToCart(PRODUCT_B);
    await store.expectCartCount(2);

    // ── Step 3: Open the cart drawer ────────────────────────────────────────
    await store.openCart();
    await expect(page.getByTestId('cart-header')).toBeVisible();

    // Products must appear in the drawer by their names.
    await expect(page.getByText(PRODUCT_A, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PRODUCT_B, { exact: false }).first()).toBeVisible();

    // ── Step 4: Navigate to /cart ────────────────────────────────────────────
    await cart.viewCartButton.click();
    await page.waitForURL('**/cart');
    await page.waitForLoadState('domcontentloaded');

    // Both products must be on the /cart page.
    await cart.expectProductInCart(PRODUCT_A);
    await cart.expectProductInCart(PRODUCT_B);

    // ── Step 5: Proceed to checkout ─────────────────────────────────────────
    await cart.clickCheckout();

    // Verify we left /cart or a checkout element appeared.
    await expect(async () => {
      const url = page.url();
      const leftCart = !url.endsWith('/cart') && !url.endsWith('/cart/');
      const checkoutVisible = await page
        .getByText(/checkout|order|payment|shipping|place order/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(leftCart || checkoutVisible).toBeTruthy();
    }).toPass({ timeout: 15_000 });
  });

  test('cart remembers items after page reload (localStorage persistence)', async ({ page }) => {
    const store = new StorePage(page);
    const cart = new CartPage(page);

    // Add a product.
    await store.goto();
    await store.addToCart('Seagate 4TB External Hard Drive');
    await store.expectCartCount(1);

    // Reload the page – React re-hydrates from localStorage.
    await page.reload();
    // Wait for the SPA to mount and re-load cart from localStorage.
    await store.waitForProducts();

    // Badge must still show 1 after reload.
    // We poll because React needs time to re-read localStorage.
    await expect(async () => {
      const count = await store.getCartCount();
      expect(count).toBe(1);
    }).toPass({ timeout: 10_000 });

    // Navigate to /cart and confirm the product is still there.
    await cart.goto();
    await cart.expectProductInCart('Seagate 4TB External Hard Drive');
  });

  test('product added to store appears correctly in cart', async ({ page }) => {
    const store = new StorePage(page);
    const cart = new CartPage(page);

    // Confirm product is visible on store page before adding.
    await store.goto();
    await expect(store.getProductName('SanDisk Ultra')).toBeVisible();

    // Use the exact product name shown in the product grid.
    const PRODUCT = 'SanDisk Ultra Dual Drive 32GB USB 3.0';
    await store.addToCart(PRODUCT);
    await store.expectCartCount(1);

    // Navigate to /cart and verify the product appears.
    await cart.goto();

    // The full product name should be visible in the cart table.
    await cart.expectProductInCart('SanDisk Ultra');
  });
});
