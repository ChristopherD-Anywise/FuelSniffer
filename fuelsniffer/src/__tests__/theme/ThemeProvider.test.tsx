// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { useTheme } from '@/lib/theme/useTheme'

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="to-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="to-system" onClick={() => setTheme('system')}>system</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    document.cookie = 'fillip-theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('applies the initial theme to <html data-theme>', () => {
    render(<ThemeProvider initial="light"><Probe /></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme("dark") updates <html data-theme> and persists to localStorage and cookie', () => {
    const { getByTestId } = render(<ThemeProvider initial="light"><Probe /></ThemeProvider>)
    act(() => { getByTestId('to-dark').click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getByTestId('theme').textContent).toBe('dark')
    expect(localStorage.getItem('fillip-theme')).toBe('dark')
    expect(document.cookie).toMatch(/fillip-theme=dark/)
  })

  it('initial "system" resolves via prefers-color-scheme', () => {
    // happy-dom defaults prefers-color-scheme to 'light'
    const { getByTestId } = render(<ThemeProvider initial="system"><Probe /></ThemeProvider>)
    expect(getByTestId('theme').textContent).toBe('system')
    // resolvedTheme should be 'light' or 'dark' — never 'system'
    const resolved = getByTestId('resolved').textContent
    expect(['light', 'dark']).toContain(resolved)
    expect(document.documentElement.getAttribute('data-theme')).toBe(resolved)
  })

  it('useTheme throws when used outside the provider', () => {
    function Bare() { useTheme(); return null }
    // Suppress React error boundary noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/)
    spy.mockRestore()
  })
})
