import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => {
  let store: Map<string, string> = new Map()
  return {
    __setCookie: (name: string, value: string) => store.set(name, value),
    __clearCookies: () => { store = new Map() },
    cookies: async () => ({
      get: (name: string) => {
        const v = store.get(name)
        return v ? { name, value: v } : undefined
      },
    }),
  }
})

import * as headers from 'next/headers'
import { getInitialTheme, type Theme } from '@/lib/theme/getInitialTheme'

const setCookie = (headers as unknown as { __setCookie: (n: string, v: string) => void }).__setCookie
const clearCookies = (headers as unknown as { __clearCookies: () => void }).__clearCookies

describe('getInitialTheme', () => {
  let originalEnv: string | undefined
  beforeEach(() => {
    originalEnv = process.env.APP_DEFAULT_THEME
    clearCookies()
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.APP_DEFAULT_THEME
    else process.env.APP_DEFAULT_THEME = originalEnv
  })

  it('defaults to "system" when no cookie and no env', async () => {
    delete process.env.APP_DEFAULT_THEME
    const t: Theme = await getInitialTheme()
    expect(t).toBe('system')
  })

  it('respects APP_DEFAULT_THEME env when set', async () => {
    process.env.APP_DEFAULT_THEME = 'dark'
    expect(await getInitialTheme()).toBe('dark')
  })

  it('cookie wins over env', async () => {
    process.env.APP_DEFAULT_THEME = 'dark'
    setCookie('fillip-theme', 'light')
    expect(await getInitialTheme()).toBe('light')
  })

  it('rejects invalid values from env, falling back to system', async () => {
    process.env.APP_DEFAULT_THEME = 'rainbow'
    expect(await getInitialTheme()).toBe('system')
  })

  it('rejects invalid values from cookie, falling back to env or system', async () => {
    delete process.env.APP_DEFAULT_THEME
    setCookie('fillip-theme', 'rainbow')
    expect(await getInitialTheme()).toBe('system')
  })
})
