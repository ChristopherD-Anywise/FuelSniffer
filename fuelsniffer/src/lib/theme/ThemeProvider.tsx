'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from './types'
import { THEME_COOKIE } from './types'

type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (next: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ProviderProps {
  initial: Theme
  children: ReactNode
}

function detectSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function persist(theme: Theme): void {
  try { localStorage.setItem(THEME_COOKIE, theme) } catch { /* ignore */ }
  // 1 year, lax, root path. SameSite=Lax so it travels on top-level GETs (the SSR read).
  document.cookie = `${THEME_COOKIE}=${theme}; max-age=31536000; path=/; samesite=lax`
}

function applyAttribute(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ initial, children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initial)
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(detectSystem)

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => theme === 'system' ? systemPref : theme,
    [theme, systemPref],
  )

  // DOM side-effect only — no state set.
  useEffect(() => {
    applyAttribute(resolvedTheme)
  }, [resolvedTheme])

  // Subscribe to OS preference changes when on 'system'. setState here is the
  // documented "external store" exception to react-hooks/set-state-in-effect:
  // we call setSystemPref only in response to an external matchMedia event.
  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystemPref(detectSystem())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    persist(next)
    // Synchronous DOM write for first-paint of the new theme. The useEffect
    // above reconciles on the next React render — both writes produce the
    // same value; the synchronous one prevents a one-frame flash of the
    // prior theme between click and effect run.
    const r = next === 'system' ? detectSystem() : next
    applyAttribute(r)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
