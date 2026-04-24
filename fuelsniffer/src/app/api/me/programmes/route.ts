/**
 * GET /api/me/programmes
 *
 * Returns the merged view of the programme registry + user's enrolment state.
 * One entry per programme in the registry.
 * Requires authentication.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getRegistry } from '@/lib/discount/registry'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

interface UserProgrammeRow {
  programme_id: string
  enabled_at: string
  paused: boolean
  paused_until: string | null
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db.execute(sql`
      SELECT programme_id, enabled_at, paused, paused_until
      FROM user_programmes
      WHERE user_id = ${session.userId}
    `) as unknown as UserProgrammeRow[]

    const enrolmentMap = new Map(rows.map(r => [r.programme_id, r]))

    const programmes = getRegistry().map(prog => {
      const enrolment = enrolmentMap.get(prog.id)
      return {
        id: prog.id,
        name: prog.name,
        type: prog.type,
        discount_cents_per_litre: prog.discount_cents_per_litre,
        eligible_brand_codes: prog.eligible_brand_codes,
        eligible_fuel_types: prog.eligible_fuel_types,
        conditions_text: prog.conditions_text,
        source_url: prog.source_url,
        last_verified_at: prog.last_verified_at,
        // User state
        enrolled: !!enrolment,
        paused: enrolment?.paused ?? false,
        paused_until: enrolment?.paused_until ?? null,
      }
    })

    return NextResponse.json({ programmes })
  } catch (err) {
    console.error('[/api/me/programmes] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
