/**
 * Returns the public-facing URL for this Fillip deployment.
 * Reads APP_PUBLIC_URL; defaults to http://localhost:4000 for dev.
 * Throws at call time if APP_PUBLIC_URL is set but unparseable.
 */
export function getPublicUrl(): URL {
  const raw = process.env.APP_PUBLIC_URL
  if (!raw) return new URL('http://localhost:4000')
  try {
    return new URL(raw)
  } catch (cause) {
    throw new Error(`Invalid APP_PUBLIC_URL: ${raw}`, { cause })
  }
}
