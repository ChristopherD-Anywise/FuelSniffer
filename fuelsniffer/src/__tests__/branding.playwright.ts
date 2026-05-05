/**
 * Playwright E2E smoke test for Fillip branding.
 *
 * Verifies:
 *   - Root page title contains "Fillip"
 *   - HTML element has data-theme attribute (light or dark)
 *   - No "FuelSniffer" references remain in page HTML
 *   - Theme toggle button is present and switches data-theme
 *
 * Prerequisites:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * Run:
 *   npx playwright test src/__tests__/branding.playwright.ts
 *
 * The app must be running (npm run dev or npm start).
 * Default base URL: http://localhost:4000  — override with BASE_URL env var.
 */

import { test, expect } from '@playwright/test'

test.describe('Fillip — branding smoke', () => {
  test('root page title contains Fillip', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Fillip/)
  })

  test('root page sets data-theme on <html>', async ({ page }) => {
    await page.goto('/')
    const value = await page.locator('html').getAttribute('data-theme')
    expect(['light', 'dark']).toContain(value)
  })

  test('root page does not contain "FuelSniffer"', async ({ page }) => {
    await page.goto('/')
    const html = await page.content()
    expect(html).not.toMatch(/FuelSniffer/)
  })

  test('theme toggle is present and clickable', async ({ page }) => {
    await page.goto('/')
    const button = page.getByRole('button', { name: /theme/i })
    await expect(button).toBeVisible()
    const before = await page.locator('html').getAttribute('data-theme')
    await button.click()
    const after = await page.locator('html').getAttribute('data-theme')
    expect(after).not.toBe(before)
  })
})
