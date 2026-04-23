'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from './getInitialTheme'
import { THEME_COOKIE } from './getInitialTheme'

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

function resolve(theme: Theme): ResolvedTheme {
  return theme === 'system' ? detectSystem() : theme
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
  const [resolvedTheme, setResolved] = useState<ResolvedTheme>(() => resolve(initial))

  // Apply initial attribute synchronously on mount in case the SSR pass
  // emitted a different value (e.g. the user just toggled and reloaded
  // and the cookie hasn't round-tripped yet).
  useEffect(() => {
    const r = resolve(theme)
    setResolved(r)
    applyAttribute(r)
  }, [theme])

  // Listen to OS theme changes when the user is on "system"
  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const r = detectSystem()
      setResolved(r)
      applyAttribute(r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    persist(next)
    const r = resolve(next)
    setResolved(r)
    applyAttribute(r)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
