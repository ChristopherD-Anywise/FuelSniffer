/**
 * SP-5 Alerts — shared email footer.
 *
 * Spam Act 2003 (AU) compliance: one-click unsubscribe + pause links,
 * sender identification, no login required.
 */
import { createAlertToken } from '../../../unsubscribe'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fillip.clarily.au'

export interface FooterData {
  alertId: number
  userEmail: string
}

export async function buildEmailFooter(data: FooterData): Promise<{ html: string; text: string }> {
  const [unsubToken, pauseToken] = await Promise.all([
    createAlertToken(data.alertId, 'unsubscribe'),
    createAlertToken(data.alertId, 'pause'),
  ])

  const unsubUrl = `${BASE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`
  const pauseUrl = `${BASE_URL}/api/alerts/pause?token=${encodeURIComponent(pauseToken)}`
  const prefsUrl = `${BASE_URL}/dashboard/alerts`

  const html = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.6;">
  <p>
    You're receiving this because you set up a Fillip price alert for <strong>${data.userEmail}</strong>.
  </p>
  <p>
    <a href="${pauseUrl}" style="color:#64748b;">Pause this alert</a> &middot;
    <a href="${unsubUrl}" style="color:#64748b;">Unsubscribe from this alert</a> &middot;
    <a href="${prefsUrl}" style="color:#64748b;">Manage all alerts</a>
  </p>
  <p>
    Fillip &mdash; Fuel price tracking for Australians.<br>
    This email was sent to ${data.userEmail}.
  </p>
</div>`

  const text = `
---
You're receiving this because you set up a Fillip price alert for ${data.userEmail}.

Pause this alert: ${pauseUrl}
Unsubscribe from this alert: ${unsubUrl}
Manage all alerts: ${prefsUrl}

Fillip — Fuel price tracking for Australians.`

  return { html, text }
}
