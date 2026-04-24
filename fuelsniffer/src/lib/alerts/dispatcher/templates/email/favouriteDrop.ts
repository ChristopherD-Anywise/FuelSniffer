/**
 * SP-5 Alerts — favourite_drop email template.
 */
import { buildEmailFooter, type FooterData } from './footer'

export interface FavouriteDropTemplateData extends FooterData {
  fuelName: string
  stationName: string
  stationId: number
  priceCents: number
  dropCents: number
  alertLabel?: string | null
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fillip.clarily.au'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(1)}`
}

export async function renderFavouriteDropEmail(
  data: FavouriteDropTemplateData
): Promise<{ subject: string; html: string; text: string }> {
  const price = formatPrice(data.priceCents)
  const stationUrl = `${BASE_URL}/dashboard/station/${data.stationId}?utm_source=email&utm_medium=alert&utm_campaign=favourite_drop`

  const subject = `${data.stationName} dropped ${data.dropCents}¢ — fill up`.substring(0, 50)

  const footer = await buildEmailFooter(data)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">
      Price drop at your favourite station
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">
      ${data.stationName} dropped ${data.dropCents}¢ for ${data.fuelName}.
    </p>

    <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:24px;">
      <div style="font-size:32px;font-weight:700;color:#16a34a;font-variant-numeric:tabular-nums;">
        ${price}
      </div>
      <div style="font-size:14px;color:#15803d;margin-top:4px;">
        Down ${data.dropCents}¢ from earlier today &middot; ${data.fuelName}
      </div>
    </div>

    <a href="${stationUrl}" style="display:block;text-align:center;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
      View ${data.stationName}
    </a>
    ${footer.html}
  </div>
</body>
</html>`

  const text = `Price drop at your favourite station

${data.stationName} — ${data.fuelName}: ${price} (down ${data.dropCents}¢)

View station: ${stationUrl}
${footer.text}`

  return { subject, html, text }
}
