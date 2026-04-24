/**
 * Magic-link email template contract.
 *
 * SP-2 ships a working but visually plain email.
 * SP-3 replaces the visual design without changing this contract.
 */

export interface MagicLinkEmailOpts {
  email: string
  magicLinkUrl: string
  ttlMinutes: number
  appName: string
  supportEmail: string
}

export interface MagicLinkEmailResult {
  subject: string
  text: string
  html: string
}

export function renderMagicLinkEmail(opts: MagicLinkEmailOpts): MagicLinkEmailResult {
  const { email, magicLinkUrl, ttlMinutes, appName, supportEmail } = opts

  const subject = `Your ${appName} sign-in link`

  const text = [
    `Sign in to ${appName}`,
    '',
    `We received a sign-in request for ${email}.`,
    '',
    `Click this link to sign in (expires in ${ttlMinutes} minutes):`,
    magicLinkUrl,
    '',
    `If you didn't request this, you can safely ignore this email.`,
    `Someone may have entered your email address by mistake.`,
    '',
    `Questions? Contact us at ${supportEmail}`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto;">
    <tr>
      <td style="background: #ffffff; border-radius: 8px; padding: 40px; border: 1px solid #e5e7eb;">
        <h1 style="color: #111827; font-size: 22px; font-weight: 700; margin: 0 0 8px;">
          Sign in to ${appName}
        </h1>
        <p style="color: #6b7280; font-size: 15px; margin: 0 0 24px;">
          Click the button below to sign in. This link expires in ${ttlMinutes} minutes.
        </p>
        <a href="${magicLinkUrl}"
           style="display: inline-block; background: #f59e0b; color: #ffffff; font-weight: 600;
                  font-size: 15px; padding: 12px 28px; border-radius: 6px; text-decoration: none;">
          Sign in to ${appName}
        </a>
        <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 8px;">
          Or copy and paste this URL into your browser:
        </p>
        <p style="color: #4b5563; font-size: 13px; word-break: break-all; margin: 0 0 24px;
                  background: #f3f4f6; padding: 10px 12px; border-radius: 4px;">
          ${magicLinkUrl}
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          If you didn't request this sign-in link, you can safely ignore this email.
          Someone may have entered your email address by mistake.
          <br><br>
          Questions? <a href="mailto:${supportEmail}" style="color: #6b7280;">${supportEmail}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
