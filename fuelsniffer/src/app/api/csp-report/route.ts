import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const report = body['csp-report'] || body

    await db.execute(sql`
      INSERT INTO csp_violations (document_uri, violated_directive, blocked_uri, source_file, line_number, raw_report)
      VALUES (
        ${report['document-uri'] ?? null},
        ${report['violated-directive'] ?? null},
        ${report['blocked-uri'] ?? null},
        ${report['source-file'] ?? null},
        ${report['line-number'] ?? null},
        ${JSON.stringify(body)}::jsonb
      )
    `)

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 }) // Never error on reports
  }
}
