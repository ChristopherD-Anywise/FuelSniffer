/**
 * getCssVar — read a CSS custom property value at runtime.
 *
 * Used by Leaflet-based components (MapView, TripMap) that build marker HTML
 * as raw template strings and therefore cannot use `var(--token)` directly.
 * Reads from `documentElement` which always has the correct theme applied.
 *
 * Falls back to `fallback` in SSR or if the property is not defined.
 */
export function getCssVar(property: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(property).trim()
  return value || fallback
}
