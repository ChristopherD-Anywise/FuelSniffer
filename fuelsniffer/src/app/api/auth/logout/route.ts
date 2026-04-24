import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/session'

export async function POST(_req: Request): Promise<NextResponse> {
  const sessionCookie = clearSession()
  const response = NextResponse.json({ ok: true }, { status: 200 })
  response.headers.set('Set-Cookie', sessionCookie)
  return response
}
