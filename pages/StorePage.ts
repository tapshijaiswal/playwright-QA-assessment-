import { type Page, type Locator, expect } from '@playwright/test';

/**
 * StorePage – Page Object for the product catalog at /products.
 *
 * DOM facts (from live DOM inspection of storedemo.testdino.com):
 * ─────────────────────────────────────────────────────────────────────────
 * - Add-to-cart btn:  data-testid="all-products-cart-button"  (14 on page)
 * - Cart badge:       data-testid="header-cart-count"
 * - Cart icon:        data-testid="header-cart-icon" (SVG)
 * - Nav – Home:       data-testid="header-menu-home"
 * - Nav – Products:   data-testid="header-menu-all-products"
 * - Price label:      data-testid="all-products-price"
 *
 * SITE QUIRKS:
 * - Clicking the same product twice shows "Already added!" toast; count stays at 1.
 * - Product names are full strings (e.g., "Rode NT1-A Condenser Mic"), not short.
 * - Cart state is stored in localStorage and React state.
 *
 * No waitForTimeout() anywhere.
 */
export class StorePage {
  readonly page: Page;

  // ── Navigation ──────────────────────────────────────────────────────────────
  readonly productsLink: Locator;
  readonly homeLink: Locator;

  // ── Cart / header ───────────────────────────────────────────────────────────
  /** Numeric badge showing cart item count */
  readonly cartBadge: Locator;

  /** The SVG cart icon – clicking opens the side drawer */
  readonly cartIcon: Locator;

  // ── Product grid ────────────────────────────────────────────────────────────
  /** All "Add to Cart" buttons in the product grid */
  readonly allAddToCartButtons: Locator;

  constructor(page: Page) {
    this.page = page;

    this.productsLink = page.getByTestId('header-menu-all-products');
    this.homeLink = page.getByTestId('header-menu-home');

    this.cartBadge = page.getByTestId('header-cart-count');
    this.cartIcon = page.getByTestId('header-cart-icon');
    this.allAddToCartButtons = page.getByTestId('all-products-cart-button');
  }

  // ── Navigation helpers ───────────────────────────────────────────────────────

  /** Navigate to /products and wait for products to be visible. */
  async goto(): Promise<void> {
    await this.page.goto('/products');
    await this.waitForProducts();
  }

  /** Wait until at least one add-to-cart button is visible (no arbitrary sleep). */
  async waitForProducts(): Promise<void> {
    await this.allAddToCartButtons.first().waitFor({ state: 'visible' });
  }

  // ── Product helpers ──────────────────────────────────────────────────────────

  /**
   * Return the add-to-cart button for a product identified by its visible name.
   *
   * DOM structure (each product card):
   *   <div ...>
   *     <h3 or p>Rode NT1-A Condenser Mic</h3>   ← product name
   *     ...
   *     <button data-testid="all-products-cart-button">...</button>
   *   </div>
   *
   * We find the closest ancestor that contains both the name text AND the
   * cart button, then return the button within it.
   */
  getAddToCartButton(productName: string): Locator {
    // Strategy: Find the text element for the product name, then walk up the
    // DOM tree to the closest ancestor that also contains a cart button.
    //
    // Using XPath 'ancestor' axis to find the closest div that has BOTH:
    //   1. the product name text (case-sensitive match)
    //   2. an add-to-cart button
    //
    // The [1] at the end picks the innermost (closest) such ancestor.
    return this.page
      .locator(`text="${productName}"`)
      .locator(
        'xpath=./ancestor::div[.//button[@data-testid="all-products-cart-button"]][1]' +
        '//button[@data-testid="all-products-cart-button"]'
      )
      .first();
  }

  /** Return a locator for the product name text. */
  getProductName(partialName: string): Locator {
    return this.page.getByText(partialName, { exact: false }).first();
  }

  /**
   * Click the add-to-cart button for a product and wait for the badge to update.
   * NOTE: Adding the same product twice will show "Already added!" and NOT
   * increment the count. Use different products for multi-item tests.
   */
  async addToCart(productName: string): Promise<void> {
    const btn = this.getAddToCartButton(productName);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Wait for cart badge to appear (confirms state was updated).
    await this.cartBadge.waitFor({ state: 'visible', timeout: 10_000 });
  }

  // ── Cart helpers ─────────────────────────────────────────────────────────────

  /** Read numeric value from the cart badge. Returns 0 if badge not visible. */
  async getCartCount(): Promise<number> {
    try {
      const isVisible = await this.cartBadge.isVisible();
      if (!isVisible) return 0;
      const text = await this.cartBadge.innerText();
      return parseInt(text.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /** Open the cart side drawer by clicking the cart icon. */
  async openCart(): Promise<void> {
    await this.cartIcon.click();
    // Wait for the drawer's header to appear.
    await this.page
      .getByTestId('cart-header')
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Navigate directly to the /cart page. */
  async gotoCart(): Promise<void> {
    await this.page.goto('/cart');
    await this.page.waitForURL('**/cart');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Assert the cart badge shows exactly the expected count. */
  async expectCartCount(expected: number): Promise<void> {
    await expect(this.cartBadge).toHaveText(String(expected), {
      timeout: 15_000,
    });
  }

  /** Open the cart drawer and click "View Cart" to navigate to /cart. */
  async viewCart(): Promise<void> {
    await this.openCart();
    await this.page.getByRole('button', { name: /view cart/i }).click();
    await this.page.waitForURL('**/cart');
  }
}
