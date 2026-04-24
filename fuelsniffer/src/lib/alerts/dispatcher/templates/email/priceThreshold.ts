/**
 * SP-5 Alerts — price_threshold email template.
 */
import { buildEmailFooter, type FooterData } from './footer'

export interface PriceThresholdTemplateData extends FooterData {
  fuelName: string
  stationName: string
  stationId: number
  priceCents: number
  maxPriceCents: number
  distanceKm: number
  suburbDisplay?: string
  alertLabel?: string | null
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fillip.clarily.au'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(1)}`
}

export async function renderPriceThresholdEmail(
  data: PriceThresholdTemplateData
): Promise<{ subject: string; html: string; text: string }> {
  const price = formatPrice(data.priceCents)
  const stationUrl = `${BASE_URL}/dashboard/station/${data.stationId}?utm_source=email&utm_medium=alert&utm_campaign=price_threshold`

  const subject = `${data.fuelName} just hit ${price} near you`
    .substring(0, 50)

  const footer = await buildEmailFooter(data)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin:0 0 8px;font-size:24px;color:#0f172a;">
      ${data.fuelName} hit ${price}
    </h1>
    <p style="margin:0 0 24px;font-size:16px;color:#475569;">
      Below your ${formatPrice(data.maxPriceCents)} alert threshold.
    </p>

    <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:24px;">
      <div style="font-size:32px;font-weight:700;color:#16a34a;font-variant-numeric:tabular-nums;">
        ${price}
      </div>
      <div style="font-size:14px;color:#15803d;margin-top:4px;">
        ${data.stationName}${data.distanceKm ? ` &middot; ${data.distanceKm.toFixed(1)} km away` : ''}
      </div>
    </div>

    <a href="${stationUrl}" style="display:block;text-align:center;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
      View station &amp; get directions
    </a>
    ${footer.html}
  </div>
</body>
</html>`

  const text = `${data.fuelName} just hit ${price} near you

${data.stationName}${data.distanceKm ? ` (${data.distanceKm.toFixed(1)} km away)` : ''}
Price: ${price} — below your ${formatPrice(data.maxPriceCents)} threshold.

View station: ${stationUrl}
${footer.text}`

  return { subject, html, text }
}
