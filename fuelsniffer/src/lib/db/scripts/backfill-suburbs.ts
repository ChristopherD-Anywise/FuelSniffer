import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import postcodeData from '@/lib/data/qld-postcodes.json'

const lookup = postcodeData as Record<string, string>

export interface BackfillResult {
  updated: number
  unresolvedPostcodes: string[]
}

/**
 * One-off backfill: for every station with NULL suburb but a known postcode,
 * set suburb from the static postcode→suburb lookup.
 *
 * Idempotent — safe to re-run.
 */
export async function backfillSuburbs(): Promise<BackfillResult> {
  const rows = await db.execute(sql`
    SELECT id, postcode FROM stations
    WHERE suburb IS NULL AND postcode IS NOT NULL
  `) as unknown as Array<{ id: number; postcode: string }>

  let updated = 0
  const unresolved = new Set<string>()

  for (const row of rows) {
    const suburb = lookup[row.postcode]
    if (!suburb) {
      unresolved.add(row.postcode)
      continue
    }
    await db.execute(sql`
      UPDATE stations SET suburb = ${suburb} WHERE id = ${row.id}
    `)
    updated++
  }

  return { updated, unresolvedPostcodes: [...unresolved].sort() }
}

// Run from CLI: `npx tsx src/lib/db/scripts/backfill-suburbs.ts`
if (require.main === module) {
  backfillSuburbs()
    .then(result => {
      console.log(`Updated ${result.updated} stations`)
      if (result.unresolvedPostcodes.length > 0) {
        console.warn(
          `Unresolved postcodes (${result.unresolvedPostcodes.length}): ${result.unresolvedPostcodes.join(', ')}`
        )
      }
      process.exit(0)
    })
    .catch(err => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
}
