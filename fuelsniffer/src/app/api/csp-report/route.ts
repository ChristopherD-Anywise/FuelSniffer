import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const MAX_BODY_BYTES = 10 * 1024 // 10KB

export async function POST(req: Request) {
  try {
    // Enforce body size limit
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }

    const rawText = await req.text()
    if (rawText.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawText)
    } catch {
      return new NextResponse(null, { status: 400 })
    }

    // Validate CSP report schema — must be an object containing a 'csp-report' key or
    // top-level fields matching the CSP report structure.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return new NextResponse(null, { status: 400 })
    }

    const bodyObj = body as Record<string, unknown>
    const report = (bodyObj['csp-report'] ?? bodyObj) as Record<string, unknown>

    if (typeof report !== 'object' || report === null || Array.isArray(report)) {
      return new NextResponse(null, { status: 400 })
    }

    // At minimum a valid CSP report must have violated-directive
    if (typeof report['violated-directive'] !== 'string' || !report['violated-directive']) {
      return new NextResponse(null, { status: 400 })
    }

    await db.execute(sql`
      INSERT INTO csp_violations (document_uri, violated_directive, blocked_uri, source_file, line_number, raw_report)
      VALUES (
        ${typeof report['document-uri'] === 'string' ? report['document-uri'] : null},
        ${report['violated-directive']},
        ${typeof report['blocked-uri'] === 'string' ? report['blocked-uri'] : null},
        ${typeof report['source-file'] === 'string' ? report['source-file'] : null},
        ${typeof report['line-number'] === 'number' ? report['line-number'] : null},
        ${JSON.stringify(body)}::jsonb
      )
    `)

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 }) // Never error on reports
  }
}
