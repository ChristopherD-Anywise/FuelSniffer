/**
 * SP-8: Weekly cheapest-postcode composer.
 *
 * Queries last 7 days of price data, finds the cheapest postcode per fuel type,
 * and builds social_posts records ready for dispatch.
 *
 * Fallback rules:
 * 1. Insufficient data → status='cancelled', error='insufficient_data'
 * 2. Tie (within 0.2¢) → append "(tied with N other postcodes)"
 * 3. Implausibly low price (< 80% of 90-day 5th percentile) → skip, use runner-up
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getPublicUrl } from '@/lib/config/publicUrl'
import { renderCardPng } from '@/lib/share/render-node'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ComposedPost {
  network: 'x' | 'bluesky' | 'mastodon'
  contentText: string
  contentImageUrl: string | null
  deepLink: string
  status: 'approved' | 'cancelled'
  errorText?: string
}

const TEXT_BUDGETS: Record<'x' | 'bluesky' | 'mastodon', number> = {
  x: 280,
  bluesky: 300,
  mastodon: 500,
}

// Minimum number of total readings across all postcodes to consider data sufficient
const MIN_TOTAL_READINGS = 30

const NETWORKS: Array<'x' | 'bluesky' | 'mastodon'> = ['x', 'bluesky', 'mastodon']

interface PostcodeRow {
  postcode: string
  avg_price: number
  reading_count: number
}

function cancelled(
  network: 'x' | 'bluesky' | 'mastodon',
  reason: string
): ComposedPost {
  return {
    network,
    contentText: '',
    contentImageUrl: null,
    deepLink: '',
    status: 'cancelled',
    errorText: reason,
  }
}

function getISOWeek(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(
    (((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  )
  return `${d.getUTCFullYear()}W${String(weekNum).padStart(2, '0')}`
}

function buildText(
  network: 'x' | 'bluesky' | 'mastodon',
  fuelCode: string,
  postcode: string,
  priceDisplay: string,
  tieNote: string,
  deepLink: string
): string {
  const body = `Cheapest ${fuelCode} postcode in AU last week: ${postcode} at ${priceDisplay} avg${tieNote}`
  const urlLine = `\n${deepLink}`
  const tags = '\n#Fillip #FuelPrices #Australia'
  const budget = TEXT_BUDGETS[network]
  const full = `${body}${urlLine}${tags}`
  if (full.length <= budget) return full
  // Trim — keep body + URL, drop hashtags
  const withUrl = `${body}${urlLine}`
  if (withUrl.length <= budget) return withUrl
  return withUrl.slice(0, budget)
}

async function renderBotImagePath(
  postcode: string,
  fuelCode: string,
  avgPriceCents: number
): Promise<string | null> {
  try {
    const png = await renderCardPng({
      stationName: postcode,
      brand: null,
      priceCents: Math.round(avgPriceCents),
      fuelCode,
      variant: 'weekly_postcode',
      postcodeLabel: `Postcode ${postcode}`,
    })
    const tmpPath = join('/tmp', `fillip-bot-${postcode}-${Date.now()}.png`)
    await writeFile(tmpPath, png)
    return tmpPath
  } catch (err) {
    console.error('[social-bot:composer] image render failed (non-fatal):', err)
    return null
  }
}

/**
 * Compose weekly cheapest-postcode posts for all networks.
 * @param fuelCode - Fuel type code to query (default 'U91')
 */
export async function composeWeeklyPost(fuelCode = 'U91'): Promise<ComposedPost[]> {
  const base = getPublicUrl().href.replace(/\/$/, '')

  // Resolve fuel_type_id
  type FuelTypeRow = { id: number }
  const fuelRows = await db.execute(sql`
    SELECT id FROM fuel_types WHERE code = ${fuelCode} LIMIT 1
  `) as unknown as FuelTypeRow[]

  if (!fuelRows.length) {
    console.warn(`[social-bot:composer] Unknown fuel code: ${fuelCode}`)
    return NETWORKS.map(n => cancelled(n, `unknown_fuel_code:${fuelCode}`))
  }

  const fuelTypeId = fuelRows[0].id

  // Query last 7 days — postcode averages
  const rows = await db.execute(sql`
    SELECT
      s.postcode,
      AVG(dp.avg_price_cents)::float  AS avg_price,
      SUM(dp.reading_count)::int       AS reading_count
    FROM daily_prices dp
    JOIN stations s ON s.id = dp.station_id
    WHERE dp.fuel_type_id = ${fuelTypeId}
      AND dp.day >= CURRENT_DATE - INTERVAL '7 days'
      AND s.postcode IS NOT NULL
      AND s.postcode != ''
    GROUP BY s.postcode
    HAVING SUM(dp.reading_count) >= 2
    ORDER BY avg_price ASC
    LIMIT 20
  `) as unknown as PostcodeRow[]

  if (!rows.length) {
    console.warn('[social-bot:composer] No postcode data — skipping')
    return NETWORKS.map(n => cancelled(n, 'insufficient_data'))
  }

  const totalReadings = rows.reduce((sum, r) => sum + r.reading_count, 0)
  if (totalReadings < MIN_TOTAL_READINGS) {
    console.warn(`[social-bot:composer] Insufficient data (${totalReadings} readings) — skipping`)
    return NETWORKS.map(n => cancelled(n, 'insufficient_data'))
  }

  // Implausibility check: compare to 90-day 5th percentile
  type PctRow = { pct5: number | null }
  const pctRows = await db.execute(sql`
    SELECT PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY avg_price_cents) AS pct5
    FROM daily_prices
    WHERE fuel_type_id = ${fuelTypeId}
      AND day >= CURRENT_DATE - INTERVAL '90 days'
  `) as unknown as PctRow[]
  const pct5 = pctRows[0]?.pct5 ?? 0

  // Find winner (skip implausibly cheap prices)
  let winner: PostcodeRow | null = null
  for (const row of rows) {
    if (pct5 === 0 || row.avg_price >= pct5 * 0.8) {
      winner = row
      break
    }
    console.warn(`[social-bot:composer] Skipping implausible price ${row.avg_price} at postcode ${row.postcode} (5th pct: ${pct5})`)
  }

  if (!winner) {
    console.warn('[social-bot:composer] All candidates implausibly cheap — skipping')
    return NETWORKS.map(n => cancelled(n, 'implausible_price'))
  }

  // Tie detection (within 0.2¢ of winner)
  const tied = rows.filter(r => Math.abs(r.avg_price - winner!.avg_price) <= 0.2)
  const tieNote = tied.length > 1
    ? ` (tied with ${tied.length - 1} other postcode${tied.length > 2 ? 's' : ''})`
    : ''

  const priceDisplay = `$${(winner.avg_price / 100).toFixed(2)}`
  const week = getISOWeek()

  // Render image
  const imageLocalPath = await renderBotImagePath(winner.postcode, fuelCode, winner.avg_price)

  return NETWORKS.map(n => {
    const deepLink = `${base}/share/s/weekly-${fuelCode}-${week}?utm_source=social-bot&utm_medium=${n}&utm_campaign=weekly_cheapest_postcode&utm_content=${week}`
    return {
      network: n,
      contentText: buildText(n, fuelCode, winner!.postcode, priceDisplay, tieNote, deepLink),
      contentImageUrl: imageLocalPath,
      deepLink,
      status: 'approved' as const,
    }
  })
}
