import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

interface UserRow {
  id: string
  email: string
  display_name: string | null
  is_admin: boolean
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db.execute(sql`
      SELECT id, email, display_name, is_admin FROM users WHERE id = ${session.userId}
    `) as unknown as UserRow[]

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = rows[0]
    return NextResponse.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      isAdmin: user.is_admin,
    })
  } catch (err) {
    console.error('[/api/auth/me] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
