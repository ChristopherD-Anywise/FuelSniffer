import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { backfillSuburbs } from '@/lib/db/scripts/backfill-suburbs'

describe('backfillSuburbs', () => {
  beforeEach(async () => {
    // Use high station id range to avoid colliding with real/seed data.
    // Delete price_readings first to satisfy FK constraint before deleting stations.
    await db.execute(sql`DELETE FROM price_readings WHERE station_id BETWEEN 9000000 AND 9000099`)
    await db.execute(sql`DELETE FROM stations WHERE id BETWEEN 9000000 AND 9000099`)
    await db.execute(sql`
      INSERT INTO stations (id, name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES
        (9000001, 'A', '1 Test St', NULL, '4000', -27.0, 153.0, true, NOW(), '9000001', 'qld'),
        (9000002, 'B', '2 Test St', NULL, '9999', -27.0, 153.0, true, NOW(), '9000002', 'qld'),
        (9000003, 'C', '3 Test St', 'Already Set', '4000', -27.0, 153.0, true, NOW(), '9000003', 'qld')
    `)
  })

  it('fills NULL suburb where postcode resolves, skips unknown and existing', async () => {
    const result = await backfillSuburbs()

    expect(result.updated).toBeGreaterThanOrEqual(1)

    const rows = await db.execute(sql`
      SELECT id, suburb FROM stations WHERE id BETWEEN 9000001 AND 9000003 ORDER BY id
    `) as unknown as Array<{ id: number; suburb: string | null }>

    expect(rows[0].suburb).toBe('Brisbane City')   // 4000 resolved
    expect(rows[1].suburb).toBeNull()               // 9999 unknown
    expect(rows[2].suburb).toBe('Already Set')      // not overwritten
  })

  it('is idempotent', async () => {
    await backfillSuburbs()
    const second = await backfillSuburbs()
    expect(second.updated).toBe(0)
  })
})
