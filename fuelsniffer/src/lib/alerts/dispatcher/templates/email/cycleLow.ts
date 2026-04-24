/**
 * SP-5 Alerts — cycle_low email template.
 */
import { buildEmailFooter, type FooterData } from './footer'

export interface CycleLowTemplateData extends FooterData {
  fuelName: string
  suburbDisplay: string
  topStations: Array<{ name: string; priceCents: number; distanceKm: number }>
  alertLabel?: string | null
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fillip.clarily.au'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(1)}`
}

export async function renderCycleLowEmail(
  data: CycleLowTemplateData
): Promise<{ subject: string; html: string; text: string }> {
  const subject = `Fill now — cycle low for ${data.suburbDisplay}`.substring(0, 50)

  const footer = await buildEmailFooter(data)

  const stationsHtml = data.topStations
    .map(s => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#0f172a;">${s.name}</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#16a34a;text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(s.priceCents)}</td>
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
    <div style="display:inline-block;background:#dcfce7;color:#16a34a;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;">
      FILL NOW
    </div>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">
      Cycle low detected for ${data.suburbDisplay}
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">
      ${data.fuelName} prices are at a cycle low. This is the best time to fill up this week.
    </p>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;padding-bottom:8px;">Station</th>
          <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;padding-bottom:8px;">Price</th>
          <th style="text-align:right;font-size:11px;color:#94a3b8;text-transform:uppercase;padding-bottom:8px;">Distance</th>
        </tr>
      </thead>
      <tbody>${stationsHtml}</tbody>
    </table>

    <div style="margin-top:24px;">
      <a href="${BASE_URL}/dashboard?utm_source=email&utm_medium=alert&utm_campaign=cycle_low" style="display:block;text-align:center;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
        See all nearby stations
      </a>
    </div>
    ${footer.html}
  </div>
</body>
</html>`

  const text = `Fill now — cycle low for ${data.suburbDisplay}

${data.fuelName} prices are at a cycle low. Best time to fill up this week.

Nearby stations:
${stationsText}

See all stations: ${BASE_URL}/dashboard?utm_source=email&utm_medium=alert&utm_campaign=cycle_low
${footer.text}`

  return { subject, html, text }
}
