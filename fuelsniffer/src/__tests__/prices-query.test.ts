import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getLatestPrices } from '@/lib/db/queries/prices'

const TEST_PREFIX = 'TEST_PRICES_QUERY_'
const FUEL_ID = 2 // ULP91 — any real fuel_type_id works

let stationId: number

async function seedReadings(offsets: Array<{ hoursAgo: number; priceCents: number }>) {
  for (const o of offsets) {
    await db.execute(sql`
      INSERT INTO price_readings (station_id, fuel_type_id, price_cents, recorded_at, source_ts, source_provider)
      VALUES (
        ${stationId}, ${FUEL_ID}, ${o.priceCents},
        NOW() - (${o.hoursAgo} || ' hours')::interval,
        NOW() - (${o.hoursAgo} || ' hours')::interval,
        'qld'
      )
    `)
  }
}

describe('getLatestPrices.price_change', () => {
  afterEach(async () => {
    await db.execute(sql`DELETE FROM price_readings WHERE station_id = ${stationId}`)
    await db.execute(sql`DELETE FROM stations WHERE external_id LIKE ${TEST_PREFIX + '%'}`)
  })

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM stations WHERE external_id LIKE ${TEST_PREFIX + '%'}`)
    const rows = await db.execute(sql`
      INSERT INTO stations (name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES ('PriceTest', '1 Test', 'Test', '4000', -27.0, 153.0, true, NOW(), ${TEST_PREFIX + '1'}, 'test')
      RETURNING id
    `) as unknown as Array<{ id: number }>
    stationId = rows[0].id
  })

  it('computes price_change as current minus oldest bucket within 168h window', async () => {
    await seedReadings([
      { hoursAgo: 160, priceCents: 200 },
      { hoursAgo: 12,  priceCents: 190 },
      { hoursAgo: 0,   priceCents: 180 },
    ])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === stationId)

    expect(station).toBeDefined()
    expect(Number(station!.price_cents)).toBe(180)
    // current (180) - oldest-in-window (200) = -20
    expect(Number(station!.price_change)).toBe(-20)
  })

  it('returns null price_change when station has no readings in the 168h window', async () => {
    await seedReadings([{ hoursAgo: 300, priceCents: 200 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === stationId)

    if (station) {
      expect(station.price_change).toBeNull()
    }
  })

  it('returns 0 price_change when only a single reading exists in the window', async () => {
    await seedReadings([{ hoursAgo: 1, priceCents: 175 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === stationId)

    expect(station).toBeDefined()
    expect(Number(station!.price_change)).toBe(0)
  })
})
