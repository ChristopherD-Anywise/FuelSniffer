/**
 * SP-5 Alerts — POST /api/me/favourites/:stationId, DELETE /api/me/favourites/:stationId
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { favouriteStations } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

type Params = { params: Promise<{ stationId: string }> }

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { stationId } = await params
  const sid = parseInt(stationId, 10)
  if (isNaN(sid)) return NextResponse.json({ error: 'Invalid stationId' }, { status: 400 })

  await db
    .insert(favouriteStations)
    .values({ userId: session.userId, stationId: sid })
    .onConflictDoNothing()

  return NextResponse.json({ favourited: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { stationId } = await params
  const sid = parseInt(stationId, 10)
  if (isNaN(sid)) return NextResponse.json({ error: 'Invalid stationId' }, { status: 400 })

  const [deleted] = await db
    .delete(favouriteStations)
    .where(
      and(
        eq(favouriteStations.userId, session.userId),
        eq(favouriteStations.stationId, sid)
      )
    )
    .returning()

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ unfavourited: true })
}
