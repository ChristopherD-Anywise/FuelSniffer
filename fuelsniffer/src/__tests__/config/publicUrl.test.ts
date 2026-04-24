import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPublicUrl } from '@/lib/config/publicUrl'

describe('getPublicUrl', () => {
  let original: string | undefined
  beforeEach(() => { original = process.env.APP_PUBLIC_URL })
  afterEach(() => {
    if (original === undefined) delete process.env.APP_PUBLIC_URL
    else process.env.APP_PUBLIC_URL = original
  })

  it('returns http://localhost:4000 when APP_PUBLIC_URL is unset', () => {
    delete process.env.APP_PUBLIC_URL
    expect(getPublicUrl().toString()).toBe('http://localhost:4000/')
  })

  it('returns the configured URL when APP_PUBLIC_URL is valid', () => {
    process.env.APP_PUBLIC_URL = 'https://fillip.clarily.au'
    expect(getPublicUrl().toString()).toBe('https://fillip.clarily.au/')
  })

  it('throws when APP_PUBLIC_URL is set but malformed', () => {
    process.env.APP_PUBLIC_URL = 'not a url'
    expect(() => getPublicUrl()).toThrow(/Invalid APP_PUBLIC_URL/)
  })
})
