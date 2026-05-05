import { describe, it, expect } from 'vitest'
import { normaliseBrand } from '@/lib/providers/fuel/brand-normaliser'

describe('normaliseBrand', () => {
  it('normalises known QLD aliases', () => {
    expect(normaliseBrand('7-ELEVEN')).toBe('7-Eleven')
    expect(normaliseBrand('7-eleven')).toBe('7-Eleven')
    expect(normaliseBrand('7 Eleven')).toBe('7-Eleven')
  })

  it('normalises case variations of known brands', () => {
    expect(normaliseBrand('SHELL')).toBe('Shell')
    expect(normaliseBrand('shell')).toBe('Shell')
    expect(normaliseBrand('BP')).toBe('BP')
    expect(normaliseBrand('bp')).toBe('BP')
  })

  it('trims whitespace', () => {
    expect(normaliseBrand('  Shell  ')).toBe('Shell')
  })

  it('passes through unknown brands unchanged except for trim', () => {
    expect(normaliseBrand('Some New Brand')).toBe('Some New Brand')
  })

  it('returns null for null input', () => {
    expect(normaliseBrand(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normaliseBrand('')).toBeNull()
  })
})
