/**
 * SP-5 Alerts — AlertEmailSender interface.
 *
 * Extends the base EmailSender from SP-2 with return value containing
 * provider message ID for delivery tracking.
 */

export interface AlertEmailOpts {
  to: string
  subject: string
  html: string
  text: string
  /** Optional custom from override (defaults to RESEND_FROM env) */
  from?: string
  /** Optional reply-to address */
  replyTo?: string
}

export interface AlertEmailSender {
  send(opts: AlertEmailOpts): Promise<{ id?: string }>
}

/**
 * Memory implementation for tests.
 */
export class MemoryAlertEmailSender implements AlertEmailSender {
  public sent: AlertEmailOpts[] = []

  async send(opts: AlertEmailOpts): Promise<{ id?: string }> {
    this.sent.push(opts)
    return { id: `memory-${Date.now()}` }
  }

  reset() {
    this.sent = []
  }
}
