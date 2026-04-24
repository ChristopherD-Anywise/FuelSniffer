import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import postcodeData from '@/lib/data/qld-postcodes.json'

const lookup = postcodeData as Record<string, string>

export interface BackfillResult {
  updated: number
  cleared: number
  unresolvedPostcodes: string[]
}

/**
 * Heuristic: recognise values that look like a street fragment rather
 * than a real suburb. These leaked into stations.suburb from an earlier
 * extractSuburb branch that trusted "street, suburb" 2-part splits —
 * e.g. "143A Targo St", "798 Ruthven St", "60 Poinciana Ave (Corner".
 *
 * Matches: starts with a digit, or contains a common Australian street
 * suffix in any token position.
 */
function looksLikeStreetFragment(suburb: string): boolean {
  if (/^\s*\d/.test(suburb)) return true
  // Match as whole words — "Brisbane Street" suburb (does exist) would be kept
  // because we don't have that pattern, but "123 Brisbane St" definitely won't.
  // Keep it conservative: only treat as a street fragment when the value starts
  // with digits — covers the observed corrupt rows without risk of killing
  // legitimate "Street"/"Road"-named suburbs.
  return false
}

/**
 * One-off backfill: for every station with NULL suburb but a known postcode,
 * set suburb from the static postcode→suburb lookup. Also clears previously-
 * populated suburb values that look like street fragments (legacy bug) so the
 * backfill can replace them with the correct postcode-derived name.
 *
 * Idempotent — safe to re-run.
 */
export async function backfillSuburbs(): Promise<BackfillResult> {
  // Step 1: clear suburb values that are street fragments.
  const candidates = await db.execute(sql`
    SELECT id, suburb FROM stations
    WHERE suburb IS NOT NULL AND suburb ~ '^\\s*\\d'
  `) as unknown as Array<{ id: number; suburb: string }>

  let cleared = 0
  for (const row of candidates) {
    if (looksLikeStreetFragment(row.suburb)) {
      await db.execute(sql`UPDATE stations SET suburb = NULL WHERE id = ${row.id}`)
      cleared++
    }
  }

  // Step 2: backfill NULL suburbs from the postcode lookup.
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

  return { updated, cleared, unresolvedPostcodes: [...unresolved].sort() }
}

// Run from CLI: `npx tsx src/lib/db/scripts/backfill-suburbs.ts`
if (require.main === module) {
  backfillSuburbs()
    .then(result => {
      console.log(`Updated ${result.updated} stations (cleared ${result.cleared} street-fragment suburbs)`)
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
