'use client'
import { useTheme } from '@/lib/theme/useTheme'
import type { Theme } from '@/lib/theme/types'

const NEXT: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const LABEL: Record<Theme, string> = {
  light: 'Theme: Light. Click to switch to Dark.',
  dark: 'Theme: Dark. Click to switch to System.',
  system: 'Theme: System. Click to switch to Light.',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const onClick = () => setTheme(NEXT[theme])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        width: 44,
        height: 44,
        borderRadius: 22,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text)',
        boxShadow: 'var(--shadow-md)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">
        {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'}
      </span>
    </button>
  )
}
