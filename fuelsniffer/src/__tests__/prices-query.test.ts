import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getLatestPrices } from '@/lib/db/queries/prices'

const STATION_ID = 9100001
const FUEL_ID = 2 // ULP91 — any real fuel_type_id works

async function seedReadings(offsets: Array<{ hoursAgo: number; priceCents: number }>) {
  for (const o of offsets) {
    await db.execute(sql`
      INSERT INTO price_readings (station_id, fuel_type_id, price_cents, recorded_at, source_ts, source_provider)
      VALUES (
        ${STATION_ID}, ${FUEL_ID}, ${o.priceCents},
        NOW() - (${o.hoursAgo} || ' hours')::interval,
        NOW() - (${o.hoursAgo} || ' hours')::interval,
        'qld'
      )
    `)
  }
}

describe('getLatestPrices.price_change', () => {
  afterEach(async () => {
    await db.execute(sql`DELETE FROM price_readings WHERE station_id = ${STATION_ID}`)
    await db.execute(sql`DELETE FROM stations WHERE id = ${STATION_ID}`)
  })

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM price_readings WHERE station_id = ${STATION_ID}`)
    await db.execute(sql`DELETE FROM stations WHERE id = ${STATION_ID}`)
    await db.execute(sql`
      INSERT INTO stations (id, name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES (${STATION_ID}, 'PriceTest', '1 Test', 'Test', '4000', -27.0, 153.0, true, NOW(), ${STATION_ID}::text, 'qld')
    `)
  })

  it('computes price_change as current minus oldest bucket within 168h window', async () => {
    await seedReadings([
      { hoursAgo: 160, priceCents: 200 },
      { hoursAgo: 12,  priceCents: 190 },
      { hoursAgo: 0,   priceCents: 180 },
    ])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    expect(station).toBeDefined()
    expect(Number(station!.price_cents)).toBe(180)
    // current (180) - oldest-in-window (200) = -20
    expect(Number(station!.price_change)).toBe(-20)
  })

  it('returns null price_change when station has no readings in the 168h window', async () => {
    await seedReadings([{ hoursAgo: 300, priceCents: 200 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    if (station) {
      expect(station.price_change).toBeNull()
    }
  })

  it('returns 0 price_change when only a single reading exists in the window', async () => {
    await seedReadings([{ hoursAgo: 1, priceCents: 175 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    expect(station).toBeDefined()
    expect(Number(station!.price_change)).toBe(0)
  })
})
