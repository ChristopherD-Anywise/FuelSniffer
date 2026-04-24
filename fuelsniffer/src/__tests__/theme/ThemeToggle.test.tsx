// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

function renderWith(initial: 'light' | 'dark' | 'system' = 'light') {
  return render(<ThemeProvider initial={initial}><ThemeToggle /></ThemeProvider>)
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })
  afterEach(() => { localStorage.clear() })

  it('renders an accessible button', () => {
    renderWith('light')
    const btn = screen.getByRole('button', { name: /theme/i })
    expect(btn).toBeTruthy()
  })

  it('cycles light → dark → system → light on click', () => {
    renderWith('light')
    const btn = screen.getByRole('button', { name: /theme/i })
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)

    fireEvent.click(btn)
    expect(btn.getAttribute('aria-label')).toMatch(/system/i)

    fireEvent.click(btn)
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)
  })
})
