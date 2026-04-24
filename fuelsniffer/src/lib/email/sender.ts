/**
 * Returns the default "from" identity for transactional Fillip email.
 *
 * SP-0 only ships this stub — there is NO transport, NO templating,
 * NO sending. SP-2 (auth: magic link) introduces Resend as the
 * transport and imports getDefaultSender() to populate the From header.
 *
 * Two env vars: EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS. Both fall back to
 * a placeholder so dev environments work without any setup.
 */
export function getDefaultSender(): { name: string; address: string } {
  return {
    name: process.env.EMAIL_FROM_NAME ?? 'Fillip',
    address: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@fillip.local',
  }
}
