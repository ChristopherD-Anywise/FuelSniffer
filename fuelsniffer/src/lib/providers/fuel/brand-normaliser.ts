/**
 * Brand name normalisation.
 *
 * Fuel station brand names vary wildly between providers and even within
 * a single provider (e.g., "7-ELEVEN" vs "7 Eleven" vs "7-eleven").
 * This module maps known aliases to a canonical name.
 *
 * Unknown brands pass through with whitespace trimmed — we don't reject
 * data we don't recognise.
 */

// Aliases map: lowercase lookup key → canonical name
const ALIASES: Record<string, string> = {
  // 7-Eleven variants
  '7-eleven': '7-Eleven',
  '7 eleven': '7-Eleven',
  '7eleven': '7-Eleven',
  // BP
  'bp': 'BP',
  // Shell / Coles
  'shell': 'Shell',
  'shell coles express': 'Shell Coles Express',
  'coles express': 'Shell Coles Express',
  // Ampol
  'ampol': 'Ampol',
  'caltex': 'Ampol', // Caltex rebranded to Ampol in AU
  // United
  'united': 'United',
  'united petroleum': 'United',
  // Puma
  'puma': 'Puma',
  'puma energy': 'Puma',
  // Liberty
  'liberty': 'Liberty',
  'liberty oil': 'Liberty',
  // Metro
  'metro': 'Metro',
  'metro petroleum': 'Metro',
  // Woolworths / EG
  'woolworths': 'Woolworths',
  'eg australia': 'Woolworths', // EG Group operates Woolworths fuel
  // Costco
  'costco': 'Costco',
  // Independent
  'independent': 'Independent',
  // Lowes
  'lowes': 'Lowes',
  'lowes petroleum': 'Lowes',
  // Mobil
  'mobil': 'Mobil',
  // Freedom
  'freedom': 'Freedom',
  'freedom fuels': 'Freedom',
  // Vibe
  'vibe': 'Vibe',
  // Night Owl (QLD chain)
  'night owl': 'Night Owl',
  // APCO
  'apco': 'APCO',
  // Enhance
  'enhance': 'Enhance',
}

export function normaliseBrand(raw: string | null): string | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim()
  const lookup = trimmed.toLowerCase()
  return ALIASES[lookup] ?? trimmed
}
