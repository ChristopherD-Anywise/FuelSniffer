import { cookies } from 'next/headers'

export type Theme = 'light' | 'dark' | 'system'

const VALID: ReadonlySet<Theme> = new Set(['light', 'dark', 'system'])
export const THEME_COOKIE = 'fillip-theme'

function coerce(value: string | undefined): Theme | null {
  if (value && VALID.has(value as Theme)) return value as Theme
  return null
}

/**
 * Returns the initial theme to render on the server.
 * Precedence: cookie > APP_DEFAULT_THEME env > 'system'.
 * Invalid values silently fall through to the next layer.
 */
export async function getInitialTheme(): Promise<Theme> {
  const jar = await cookies()
  const fromCookie = coerce(jar.get(THEME_COOKIE)?.value)
  if (fromCookie) return fromCookie
  const fromEnv = coerce(process.env.APP_DEFAULT_THEME)
  if (fromEnv) return fromEnv
  return 'system'
}
