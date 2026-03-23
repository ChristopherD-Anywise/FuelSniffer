/**
 * Tests for DASH-01: /api/prices route returns sorted price data.
 * Run: npx vitest run src/__tests__/prices-api.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: { execute: vi.fn().mockResolvedValue([]) },
}))

describe('GET /api/prices', () => {
  it.todo('returns 200 with stations array for valid fuel type and radius')
  it.todo('returns 400 when fuel query param is missing')
  it.todo('returns 400 when radius is outside 1–50 range')
  it.todo('returns stations sorted cheapest first')
})
