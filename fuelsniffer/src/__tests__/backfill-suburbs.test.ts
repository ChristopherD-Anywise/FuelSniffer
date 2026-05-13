import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { backfillSuburbs } from '@/lib/db/scripts/backfill-suburbs'

const TEST_PREFIX = 'TEST_BACKFILL_'

async function cleanupTestRows() {
  await db.execute(sql`
    DELETE FROM price_readings
    WHERE station_id IN (
      SELECT id FROM stations WHERE external_id LIKE ${TEST_PREFIX + '%'}
    )
  `)
  await db.execute(sql`DELETE FROM stations WHERE external_id LIKE ${TEST_PREFIX + '%'}`)
}

describe('backfillSuburbs', () => {
  beforeEach(async () => {
    await cleanupTestRows()
    await db.execute(sql`
      INSERT INTO stations (name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES
        ('A', '1 Test St', NULL, '4000', -27.0, 153.0, true, NOW(), ${TEST_PREFIX + '001'}, 'test'),
        ('B', '2 Test St', NULL, '9999', -27.0, 153.0, true, NOW(), ${TEST_PREFIX + '002'}, 'test'),
        ('C', '3 Test St', 'Already Set', '4000', -27.0, 153.0, true, NOW(), ${TEST_PREFIX + '003'}, 'test')
    `)
  })

  afterEach(async () => {
    await cleanupTestRows()
  })

  it('fills NULL suburb where postcode resolves, skips unknown and existing', async () => {
    const result = await backfillSuburbs()

    expect(result.updated).toBeGreaterThanOrEqual(1)

    const rows = await db.execute(sql`
      SELECT external_id, suburb FROM stations
      WHERE external_id LIKE ${TEST_PREFIX + '%'}
      ORDER BY external_id
    `) as unknown as Array<{ external_id: string; suburb: string | null }>

    const rowA = rows.find(r => r.external_id === TEST_PREFIX + '001')
    const rowB = rows.find(r => r.external_id === TEST_PREFIX + '002')
    const rowC = rows.find(r => r.external_id === TEST_PREFIX + '003')

    expect(rowA?.suburb).toBe('Brisbane City')   // 4000 resolved
    expect(rowB?.suburb).toBeNull()               // 9999 unknown
    expect(rowC?.suburb).toBe('Already Set')      // not overwritten
  })

  it('is idempotent', async () => {
    await backfillSuburbs()
    const second = await backfillSuburbs()
    expect(second.updated).toBe(0)
    expect(second.cleared).toBe(0)
  })

  it('clears street-fragment suburbs and repopulates from postcode', async () => {
    // Legacy bug: "143A Targo St" ended up in the suburb column for
    // 2-comma addresses like "143A Targo St, Kedron". Clear + refill.
    await cleanupTestRows()
    await db.execute(sql`
      INSERT INTO stations (name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES ('X', '143A Targo St, Kedron', '143A Targo St', '4031', -27.0, 153.0, true, NOW(), ${TEST_PREFIX + '010'}, 'test')
    `)

    const result = await backfillSuburbs()
    expect(result.cleared).toBe(1)

    const rows = await db.execute(sql`
      SELECT suburb FROM stations WHERE external_id = ${TEST_PREFIX + '010'}
    `) as unknown as Array<{ suburb: string | null }>
    // '4031' → 'Chermside' in the QLD lookup; any real suburb name is fine so long as it isn't the street fragment.
    expect(rows[0].suburb).not.toBe('143A Targo St')
    expect(rows[0].suburb).not.toBeNull()
  })
})
