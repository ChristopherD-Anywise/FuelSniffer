import { describe, it, expect } from 'vitest'
import { postcodeToSuburb } from '@/lib/data/qld-postcodes'
import postcodeData from '@/lib/data/qld-postcodes.json'

describe('postcodeToSuburb', () => {
  it('returns a suburb name for a known QLD postcode', () => {
    expect(postcodeToSuburb('4000')).toBe('Brisbane City')
  })

  it('returns null for an unknown postcode', () => {
    expect(postcodeToSuburb('9999')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(postcodeToSuburb(null)).toBeNull()
  })

  it('covers the bulk of QLD postcodes', () => {
    // The Australia Post public dataset has ~460 unique QLD postcodes.
    // Threshold set at 400 to be robust against future dataset trimming
    // while still catching a broken/empty lookup.
    expect(Object.keys(postcodeData as Record<string, string>).length).toBeGreaterThanOrEqual(400)
  })
})
