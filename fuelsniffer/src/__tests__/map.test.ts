/**
 * Tests for DASH-04: map pin colour generation from price data.
 * Run: npx vitest run src/__tests__/map.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('getPinColour()', () => {
  it.todo('returns hsl(120,...) green for the cheapest station in a set')
  it.todo('returns hsl(0,...) red for the most expensive station in a set')
  it.todo('returns hsl(55,...) amber for a station at the median price')
})
