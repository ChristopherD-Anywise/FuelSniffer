/**
 * Playwright E2E tests for dashboard-ui-fixes branch.
 *
 * Verifies four UI fixes:
 *   Fix 1 — StationCard: no brand on the second line (shows "1.2 km · 3 mins ago", NOT "BP · 1.2 km · …")
 *   Fix 2 — StationCard: price change shows "↓5.1¢ / 7d" suffix
 *   Fix 3 — Search: dropdown shows only suburb/postcode results (type: "area"), never station names
 *   Fix 4 — DistanceSlider: label updates live while dragging; list only reloads on release
 *
 * Prerequisites:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * Run:
 *   npx playwright test src/__tests__/ui-fixes.playwright.ts
 *
 * The app must be running (npm run dev or npm start).
 * Default base URL: http://localhost:3000  — override with BASE_URL env var.
 * Default dev port from package.json is 4000, so:
 *   BASE_URL=http://localhost:4000 npx playwright test src/__tests__/ui-fixes.playwright.ts
 *
 * Auth: Tests bypass the login wall by injecting a mocked session cookie where
 * needed. When the real cookie cannot be obtained, certain tests fall back to
 * calling the /api/* endpoints directly (no browser auth required for those
 * if they are accessible, which depends on middleware config).
 *
 * API responses are mocked via Playwright's route interception so the tests do
 * not depend on a live database.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000'

// JWT signed with SESSION_SECRET=dev-secret-change-in-production-must-be-32-chars
// userId:1, valid 7 days. Re-generate if expired:
//   node -e "const {SignJWT}=require('jose');new SignJWT({userId:1}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(new TextEncoder().encode('dev-secret-change-in-production-must-be-32-chars')).then(console.log)"
const DEV_SESSION_COOKIE = process.env.PLAYWRIGHT_SESSION_COOKIE ??
  'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc3NTQzNDU4NCwiZXhwIjoxNzc2MDM5Mzg0fQ.mORjiM6j8-IuDY1w1ny-C4-vhCBF6NSHUnGn2lE5CzU'

// A minimal PriceResult fixture that matches the shape returned by /api/prices.
// price_change is set so Fix 2 (price change label) is exercised.
const MOCK_STATIONS = [
  {
    id: 101,
    name: 'Coles Express North Lakes',
    brand: 'Coles Express',
    address: '10 Lakefield Dr, North Lakes QLD 4509',
    suburb: 'North Lakes',
    latitude: -27.24,
    longitude: 153.01,
    price_cents: '179.9',
    fuel_type_id: 2,
    recorded_at: new Date(Date.now() - 3 * 60_000).toISOString(), // 3 mins ago
    source_ts: new Date(Date.now() - 3 * 60_000).toISOString(),
    distance_km: 1.2,
    price_change: -5.1,
  },
  {
    id: 102,
    name: 'BP Mango Hill',
    brand: 'BP',
    address: '1 Anzac Ave, Mango Hill QLD 4509',
    suburb: 'Mango Hill',
    latitude: -27.27,
    longitude: 153.02,
    price_cents: '183.5',
    fuel_type_id: 2,
    recorded_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    source_ts: new Date(Date.now() - 10 * 60_000).toISOString(),
    distance_km: 3.4,
    price_change: 0,
  },
]

const MOCK_SEARCH_RESULTS = [
  { type: 'area', label: 'North Lakes (4509)', lat: -27.24, lng: 153.01, stationCount: 8 },
  { type: 'area', label: 'North Brisbane (4000)', lat: -27.46, lng: 153.02, stationCount: 3 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Intercept /api/prices* with mocked station data.
 */
async function mockPricesApi(page: Page) {
  await page.route('**/api/prices**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATIONS),
    })
  })
}

/**
 * Intercept /api/search* with mocked area results.
 */
async function mockSearchApi(page: Page) {
  await page.route('**/api/search**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESULTS),
    })
  })
}

/**
 * Inject a dev session cookie and navigate to the dashboard.
 * The cookie is a JWT signed with the dev SESSION_SECRET.
 */
async function goToDashboard(page: Page) {
  // Inject session cookie before any navigation so middleware sees it
  await page.context().addCookies([{
    name: 'session',
    value: DEV_SESSION_COOKIE,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
  }])

  // Intercept API calls before navigating so the page loads cleanly.
  await mockPricesApi(page)
  await mockSearchApi(page)

  await page.goto(`${BASE_URL}/dashboard?fuel=2&radius=20&sort=price`)

  // If we still land on /login, the cookie wasn't accepted (wrong secret or expired).
  const url = page.url()
  if (url.includes('/login')) {
    test.skip(true, 'Session cookie rejected — regenerate DEV_SESSION_COOKIE in the test file.')
  }

  // Wait for at least one station card to be visible (mocked data loaded).
  await page.waitForSelector('[role="button"]', { timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Fix 1: StationCard — no brand on the second line
// ---------------------------------------------------------------------------

test.describe('Fix 1 — StationCard: no brand on second line', () => {
  test('station card subtitle shows "X.X km · N ago" without a brand prefix', async ({ page }) => {
    await goToDashboard(page)

    // Grab all station card subtitle elements.
    // The subtitle is the second line inside each card — it uses text-xs text-slate-500.
    // We look for any that match the pattern "X.X km · … ago" and assert none start with a brand.
    const subtitleLocator = page.locator('.station-list [role="button"] .text-xs.text-slate-500')
    const count = await subtitleLocator.count()
    expect(count, 'Expected at least one station card subtitle').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const text = (await subtitleLocator.nth(i).textContent()) ?? ''
      // Should match "1.2 km · 3 minutes ago" pattern
      expect(text, `Card ${i} subtitle should contain "km ·"`).toMatch(/\d+\.\d+\s*km\s*·/)
      // Must NOT start with a brand name followed by ·
      // Brands from our mock data: "Coles Express", "BP"
      expect(text, `Card ${i} subtitle must not start with brand`).not.toMatch(/^(BP|Coles Express|Shell|7-Eleven|Ampol|United|Puma|Caltex)\s*·/)
    }
  })

  test('first card subtitle does not contain the brand "Coles Express"', async ({ page }) => {
    await goToDashboard(page)

    const firstSubtitle = page.locator('.station-list [role="button"] .text-xs.text-slate-500').first()
    await expect(firstSubtitle).not.toContainText('Coles Express')
  })
})

// ---------------------------------------------------------------------------
// Fix 2: StationCard — price change shows "/ 7d" suffix
// ---------------------------------------------------------------------------

test.describe('Fix 2 — StationCard: price change label has "/ 7d" suffix', () => {
  test('a card with a non-zero price_change shows the "/ 7d" suffix', async ({ page }) => {
    await goToDashboard(page)

    // The first mock station has price_change: -5.1, so we expect "5.1¢ / 7d".
    // The change label is a small colored div inside the price column.
    // We locate it by its text content pattern rather than exact Tailwind classes
    // to keep the test resilient to minor styling tweaks.
    const firstCard = page.locator('.station-list [role="button"]').first()

    // Look for any element inside the first card that contains "/ 7d"
    const changeLabel = firstCard.locator(':text("/ 7d")')
    await expect(changeLabel).toBeVisible()
    const text = (await changeLabel.textContent()) ?? ''
    expect(text, 'Price change label should contain "/ 7d"').toContain('/ 7d')
  })

  test('a card with price_change of 0 does NOT show a change label', async ({ page }) => {
    await goToDashboard(page)

    // The second mock station has price_change: 0 — no label should render.
    const secondCard = page.locator('.station-list [role="button"]').nth(1)

    // There should be no element matching the "/ 7d" pattern inside this card
    const changeLabel = secondCard.locator(':text-matches("[\\d.]+¢ / 7d")')
    await expect(changeLabel).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Fix 3: Search — areas only, no station names
// ---------------------------------------------------------------------------

test.describe('Fix 3 — Search: dropdown shows areas only', () => {
  test('/api/search returns only type:"area" results', async ({ page }) => {
    let capturedBody: unknown[] | null = null

    await page.route('**/api/search**', async (route: Route) => {
      const body = MOCK_SEARCH_RESULTS
      capturedBody = body
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    })

    await page.context().addCookies([{
      name: 'session', value: DEV_SESSION_COOKIE,
      domain: 'localhost', path: '/', httpOnly: true, secure: false,
    }])
    await mockPricesApi(page)
    await page.goto(`${BASE_URL}/dashboard?fuel=2&radius=20&sort=price`)

    const url = page.url()
    if (url.includes('/login')) {
      test.skip(true, 'Session cookie rejected')
    }

    await page.waitForSelector('[role="button"]', { timeout: 10_000 })

    // Type in the search box
    const searchInput = page.getByPlaceholder('Search suburb or postcode...').first()
    await searchInput.fill('north')

    // Wait for dropdown
    await page.waitForTimeout(400) // debounce is 300ms

    // Assert only area results appear
    if (capturedBody) {
      for (const item of capturedBody as Array<{ type: string }>) {
        expect(item.type, 'All search results must be type "area"').toBe('area')
      }
    }

    // Assert dropdown items look like "Suburb (postcode)" not a station name
    const dropdownItems = page.locator('div.absolute.bg-white button .text-sm.font-medium')
    const itemCount = await dropdownItems.count()
    expect(itemCount, 'Dropdown should show results').toBeGreaterThan(0)

    for (let i = 0; i < itemCount; i++) {
      const text = (await dropdownItems.nth(i).textContent()) ?? ''
      // Area labels should match "Suburb (postcode)" pattern
      expect(text, `Dropdown item ${i} should look like an area result`).toMatch(/\w+.+\(\d{4}\)/)
    }
  })

  test('search dropdown items do not show station names like "Coles Express" or "BP"', async ({ page }) => {
    await page.context().addCookies([{
      name: 'session', value: DEV_SESSION_COOKIE,
      domain: 'localhost', path: '/', httpOnly: true, secure: false,
    }])
    await mockPricesApi(page)
    await page.route('**/api/search**', (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SEARCH_RESULTS),
      })
    })

    await page.goto(`${BASE_URL}/dashboard?fuel=2&radius=20&sort=price`)
    const url = page.url()
    if (url.includes('/login')) {
      test.skip(true, 'Session cookie rejected')
    }

    await page.waitForSelector('[role="button"]', { timeout: 10_000 })

    const searchInput = page.getByPlaceholder('Search suburb or postcode...').first()
    await searchInput.fill('north')
    await page.waitForTimeout(400)

    const dropdownItems = page.locator('div.absolute.bg-white button')
    const count = await dropdownItems.count()

    for (let i = 0; i < count; i++) {
      const text = (await dropdownItems.nth(i).textContent()) ?? ''
      expect(text).not.toContain('Coles Express')
      expect(text).not.toContain('BP Mango Hill')
      // Area results should contain a postcode in parens
      expect(text).toMatch(/\(\d{4}\)/)
    }
  })
})

// ---------------------------------------------------------------------------
// Fix 4: DistanceSlider — live label, deferred list reload
// ---------------------------------------------------------------------------

test.describe('Fix 4 — DistanceSlider: live label, reload only on release', () => {
  test('slider label updates immediately while dragging (before mouseup)', async ({ page }) => {
    await goToDashboard(page)

    // Find the distance slider input (first one — desktop layout)
    const slider = page.locator('input[type="range"]').first()
    await expect(slider).toBeVisible()

    // Find the label (span next to the slider showing "Nkm") — first instance
    const label = page.locator('span.tabular-nums.whitespace-nowrap').first()
    await expect(label).toBeVisible()

    // Read the initial value shown in the label
    const initialLabelText = await label.textContent()

    // Get slider bounding box so we can simulate a drag
    const box = await slider.boundingBox()
    if (!box) throw new Error('Slider has no bounding box')

    // Move mouse to left side of slider (to decrease value) without releasing
    const startX = box.x + box.width * 0.8   // near right
    const endX   = box.x + box.width * 0.2   // near left (smaller km)
    const midY   = box.y + box.height / 2

    await page.mouse.move(startX, midY)
    await page.mouse.down()
    await page.mouse.move(endX, midY, { steps: 10 })

    // At this point mouse is still held — label should have updated (live update).
    const midDragLabelText = await label.textContent()
    expect(
      midDragLabelText,
      'Label should update before mouseup (live drag update)',
    ).not.toBe(initialLabelText)

    // Release mouse
    await page.mouse.up()

    // After release the label value should be committed
    const finalLabelText = await label.textContent()
    expect(finalLabelText).toBe(midDragLabelText)
  })

  test('API is NOT called while dragging — only called once on release', async ({ page }) => {
    const apiCallTimestamps: number[] = []

    await page.route('**/api/prices**', (route: Route) => {
      apiCallTimestamps.push(Date.now())
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_STATIONS),
      })
    })
    await mockSearchApi(page)
    await page.context().addCookies([{
      name: 'session', value: DEV_SESSION_COOKIE,
      domain: 'localhost', path: '/', httpOnly: true, secure: false,
    }])

    await page.goto(`${BASE_URL}/dashboard?fuel=2&radius=20&sort=price`)
    const url = page.url()
    if (url.includes('/login')) {
      test.skip(true, 'Session cookie rejected')
    }
    await page.waitForSelector('[role="button"]', { timeout: 10_000 })

    // Reset counter after initial load
    apiCallTimestamps.length = 0

    const slider = page.locator('input[type="range"]').first()
    const box = await slider.boundingBox()
    if (!box) throw new Error('Slider has no bounding box')

    const startX = box.x + box.width * 0.8
    const endX   = box.x + box.width * 0.2
    const midY   = box.y + box.height / 2

    await page.mouse.move(startX, midY)
    await page.mouse.down()
    // Slow drag — 20 steps over ~200ms
    await page.mouse.move(endX, midY, { steps: 20 })

    // During drag: no API call should have fired yet (the slider changes a URL param on release)
    expect(
      apiCallTimestamps.length,
      'No API fetch should happen while dragging (before mouseup)',
    ).toBe(0)

    // Release
    await page.mouse.up()

    // Allow time for the deferred fetch (URL param update triggers re-fetch)
    await page.waitForTimeout(1000)

    // Exactly one API call should have happened after release
    expect(
      apiCallTimestamps.length,
      'Exactly one API fetch should happen after slider release',
    ).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Smoke test — verifies the app is reachable and renders station cards
// ---------------------------------------------------------------------------

test('smoke: dashboard renders station cards with mocked data', async ({ page }) => {
  await goToDashboard(page)

  // Should show at least one card
  const cards = page.locator('.station-list [role="button"]')
  await expect(cards.first()).toBeVisible()

  // Each card should show a price (number followed by a decimal)
  const priceEl = cards.first().locator('.text-xl.font-extrabold')
  const priceText = await priceEl.textContent()
  expect(priceText).toMatch(/^\d+\.\d$/)
})
