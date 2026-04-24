/**
 * GET /api/programmes
 *
 * Public endpoint — returns the sanitised programme registry.
 * Omits internal-only fields (notes).
 * No auth required.
 */

import { NextResponse } from 'next/server'
import { getRegistry } from '@/lib/discount/registry'

export async function GET(): Promise<NextResponse> {
  try {
    const programmes = getRegistry().map(({ notes: _notes, ...rest }) => rest)
    return NextResponse.json({ programmes })
  } catch {
    return NextResponse.json({ error: 'Registry unavailable' }, { status: 500 })
  }
}
