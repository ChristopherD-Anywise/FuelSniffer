/**
 * SP-5 Alerts — weekly_digest email template.
 */
import { buildEmailFooter, type FooterData } from './footer'

export interface WeeklyDigestTemplateData extends FooterData {
  fuelName: string
  suburbDisplay: string
  bestDayToFill: string
  signalState: string
  signalLabel: string
  topStations: Array<{ name: string; priceCents: number; distanceKm: number }>
  alertLabel?: string | null
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fillip.clarily.au'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(1)}`
}

function signalColor(state: string): string {
  switch (state) {
    case 'FILL_NOW': return '#16a34a'
    case 'HOLD': return '#d97706'
    case 'WAIT_FOR_DROP': return '#0ea5e9'
    default: return '#64748b'
  }
}

function signalBg(state: string): string {
  switch (state) {
    case 'FILL_NOW': return '#dcfce7'
    case 'HOLD': return '#fef3c7'
    case 'WAIT_FOR_DROP': return '#e0f2fe'
    default: return '#f1f5f9'
  }
}

export async function renderWeeklyDigestEmail(
  data: WeeklyDigestTemplateData
): Promise<{ subject: string; html: string; text: string }> {
  const subject = 'Your fuel outlook for this week'.substring(0, 50)

  const footer = await buildEmailFooter(data)

  const stationsHtml = data.topStations
    .map(s => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#0f172a;">${s.name}</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(s.priceCents)}</td>
        <td style="padding:8px 0;font-size:12px;color:#64748b;text-align:right;">${s.distanceKm.toFixed(1)} km</td>
      </tr>`)
    .join('')

  const stationsText = data.topStations
    .map(s => `  ${s.name}: ${formatPrice(s.priceCents)} (${s.distanceKm.toFixed(1)} km)`)
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">
      Your fuel outlook for this week
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">
      ${data.fuelName} &middot; ${data.suburbDisplay} area
    </p>

    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Best day to fill</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;">${data.bestDayToFill}</div>
      </div>
      <div style="flex:1;background:${signalBg(data.signalState)};border-radius:8px;padding:16px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Today's signal</div>
        <div style="font-size:14px;font-weight:700;color:${signalColor(data.signalState)};">${data.signalLabel}</div>
      </div>
    </div>

    <h2 style="font-size:14px;color:#64748b;text-transform:uppercase;margin:0 0 12px;">
      Top 3 nearby stations now
    </h2>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${stationsHtml}</tbody>
    </table>

    <div style="margin-top:24px;">
      <a href="${BASE_URL}/dashboard?utm_source=email&utm_medium=alert&utm_campaign=weekly_digest" style="display:block;text-align:center;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
        Open Fillip dashboard
      </a>
    </div>
    ${footer.html}
  </div>
</body>
</html>`

  const text = `Your fuel outlook for this week
${data.fuelName} · ${data.suburbDisplay} area

Best day to fill: ${data.bestDayToFill}
Today's signal: ${data.signalLabel} (${data.signalState})

Top 3 stations:
${stationsText}

Open dashboard: ${BASE_URL}/dashboard?utm_source=email&utm_medium=alert&utm_campaign=weekly_digest
${footer.text}`

  return { subject, html, text }
}
