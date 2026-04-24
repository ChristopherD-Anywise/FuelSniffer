/**
 * SP-5 Alerts — quiet hours predicate.
 *
 * Pure function — no DB access. TZ-aware: converts the given UTC time
 * to the user's local timezone before checking the quiet window.
 *
 * Quiet hours apply ONLY to push channel. Email always delivers.
 */

export interface QuietHoursConfig {
  timezone: string            // IANA timezone e.g. 'Australia/Brisbane'
  quiet_hours_start: string   // 'HH:MM' e.g. '21:00'
  quiet_hours_end: string     // 'HH:MM' e.g. '07:00'
}

/**
 * Returns true if the given UTC time falls within the user's quiet hours.
 * Handles overnight windows (e.g. 21:00–07:00 which wraps midnight).
 */
export function isInQuietHours(
  config: QuietHoursConfig,
  now: Date = new Date()
): boolean {
  const { timezone, quiet_hours_start, quiet_hours_end } = config

  // Get local hour and minute in user's timezone
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const hourPart = parts.find(p => p.type === 'hour')?.value ?? '00'
  const minutePart = parts.find(p => p.type === 'minute')?.value ?? '00'
  const localTimeMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10)

  const [startH, startM] = quiet_hours_start.split(':').map(Number)
  const [endH, endM] = quiet_hours_end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  if (startMinutes < endMinutes) {
    // Normal window (doesn't cross midnight) e.g. 09:00–17:00
    return localTimeMinutes >= startMinutes && localTimeMinutes < endMinutes
  } else {
    // Overnight window e.g. 21:00–07:00
    return localTimeMinutes >= startMinutes || localTimeMinutes < endMinutes
  }
}
