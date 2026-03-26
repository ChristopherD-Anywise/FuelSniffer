/**
 * Compute a pin colour using HSL linear interpolation.
 * Cheapest (t=0): hsl(120, 70%, 35%) — green
 * Most expensive (t=1): hsl(0, 75%, 45%) — red
 * Median (t=0.5): hsl(60, ~82%, ~40%) — amber-ish
 *
 * Colouring is relative within the currently displayed fuel type because
 * the caller (MapView) computes min/max from the filtered station list.
 * Diesel stations (~300¢) get the full green→red range just like ULP (~245¢).
 */
export function getPinColour(price: number, min: number, max: number): string {
  const t = max === min ? 0 : (price - min) / (max - min)  // 0 = cheapest, 1 = most expensive

  // Interpolate hue: 120 (green) → 0 (red)
  const hue = Math.round(120 * (1 - t))

  // Interpolate saturation: 70% → 75%
  const sat = Math.round(70 + 5 * t)

  // Interpolate lightness: 35% → 45%
  const lit = Math.round(35 + 10 * t)

  return `hsl(${hue},${sat}%,${lit}%)`
}
