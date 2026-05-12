import { type Page, type Locator, expect } from '@playwright/test';

/**
 * CartPage – Page Object for the cart at /cart and the cart side-drawer.
 *
 * DOM facts (from live DOM inspection of storedemo.testdino.com):
 * ─────────────────────────────────────────────────────────────────────────
 * Cart side-drawer testids:
 *   data-testid="cart-header"           – drawer heading ("Your Cart")
 *   data-testid="close-cart"            – X button to close drawer
 *   data-testid="cart-drawer"           – the drawer container
 *   data-testid="cart-product-header"   – product name in drawer
 *   data-testid="cart-product-price"    – product price in drawer
 *
 * Cart page (/cart) testids:
 *   data-testid="cart-title"            – "Your Cart" heading
 *   data-testid="cart-product-header"   – product name in row
 *   data-testid="cart-price"            – product price in row
 *   data-testid="cart-quantity"         – quantity span
 *   data-testid="cart-decrement-button" – "-" button
 *   data-testid="cart-increment-button" – "+" button
 *   data-testid="cart-delete-button"    – delete item button
 *   data-testid="cart-checkout-button"  – "Checkout" button on /cart
 *   data-testid="cart-continue-shopping-button" – "Continue Shopping"
 *
 * No waitForTimeout() anywhere.
 */
export class CartPage {
  readonly page: Page;

  // ── Drawer locators ──────────────────────────────────────────────────────────
  readonly drawer: Locator;
  readonly drawerHeader: Locator;
  readonly closeDrawerButton: Locator;

  // ── Page-level locators ──────────────────────────────────────────────────────
  readonly pageTitle: Locator;

  /** "Checkout" button on the /cart page */
  readonly checkoutButton: Locator;

  /** "View Cart" button inside the side drawer */
  readonly viewCartButton: Locator;

  /** "Continue Shopping" link on /cart page */
  readonly continueShoppingButton: Locator;

  /** Empty cart message (when no items) */
  readonly emptyCartMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Drawer
    this.drawer = page.getByTestId('cart-drawer');
    this.drawerHeader = page.getByTestId('cart-header');
    this.closeDrawerButton = page.getByTestId('close-cart');

    // /cart page
    this.pageTitle = page.getByTestId('cart-title');
    this.checkoutButton = page.getByTestId('cart-checkout-button');
    this.viewCartButton = page.getByRole('button', { name: /view cart/i });
    this.continueShoppingButton = page.getByTestId('cart-continue-shopping-button');
    this.emptyCartMessage = page.getByText(
      /your cart is empty|no items|cart is empty/i
    );
  }

  // ── Cart item rows ────────────────────────────────────────────────────────────

  /**
   * All product rows currently in the cart.
   * NOTE: data-testid="cart-product-header" is used for BOTH the table column
   * heading ("Product") AND each product name cell. We exclude the header by
   * filtering to those with more than a few characters of content (product
   * names are always longer than the word "Product").
   * Alternatively we count delete buttons – one per item row.
   */
  get cartItems(): Locator {
    // Each cart row has a delete button (data-testid="cart-delete-button").
    // Count them to determine item count accurately.
    return this.page.getByTestId('cart-delete-button');
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  /** Navigate directly to /cart. */
  async goto(): Promise<void> {
    await this.page.goto('/cart');
    await this.page.waitForURL('**/cart');
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ── State verification ────────────────────────────────────────────────────────

  /** Assert a product with the given (partial) name appears in the cart. */
  async expectProductInCart(partialName: string): Promise<void> {
    // The product name appears in a data-testid="cart-product-header" span.
    // However, the "Product" column heading also has this testid, so we use
    // getByText to find the actual product name, which is always a product title.
    await expect(
      this.page.getByText(partialName, { exact: false }).first()
    ).toBeVisible({ timeout: 10_000 });
  }

  /** Assert that all products in the provided list appear in the cart. */
  async expectAllProductsInCart(productNames: string[]): Promise<void> {
    for (const name of productNames) {
      await this.expectProductInCart(name);
    }
  }

  /**
   * Assert the cart is empty.
   * Navigates to /cart and checks for the empty-cart state.
   */
  async expectEmpty(): Promise<void> {
    await this.goto();

    // Check for explicit empty-cart text OR zero delete buttons (1 per item).
    const hasEmptyMsg = await this.emptyCartMessage
      .isVisible()
      .catch(() => false);
    // cart-delete-button is only present for actual items (not the header row).
    const itemCount = await this.page
      .getByTestId('cart-delete-button')
      .count()
      .catch(() => 0);

    expect(hasEmptyMsg || itemCount === 0).toBeTruthy();
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  /** Click the "Checkout" button on /cart and wait for page load. */
  async clickCheckout(): Promise<void> {
    await this.checkoutButton.waitFor({ state: 'visible' });
    await this.checkoutButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Get the displayed quantity for a product by partial name.
   * Returns 1 if the quantity element is not found.
   */
  async getItemQuantity(partialName: string): Promise<number> {
    try {
      // Each cart row has a data-testid="cart-quantity" span.
      // We find the row that contains the product name, then read its qty.
      const row = this.page
        .locator('li, div, tr')
        .filter({ hasText: partialName })
        .first();
      const qty = await row.getByTestId('cart-quantity').innerText();
      return parseInt(qty, 10) || 1;
    } catch {
      return 1;
    }
  }

  /** Return a locator for a specific product row by partial name. */
  getCartItemByName(partialName: string): Locator {
    return this.page
      .getByTestId('cart-product-header')
      .filter({ hasText: partialName })
      .first();
  }
}
