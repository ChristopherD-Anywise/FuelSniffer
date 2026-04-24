/**
 * SP-5 Alerts — Resend implementation of AlertEmailSender.
 *
 * Wraps the existing ResendEmailSender from SP-2 to provide
 * the AlertEmailSender interface with message ID return.
 */
import { Resend } from 'resend'
import type { AlertEmailSender, AlertEmailOpts } from './index'

export class ResendAlertEmailSender implements AlertEmailSender {
  private client: Resend
  private fromAddress: string

  constructor() {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required for ResendAlertEmailSender')
    }
    const from = process.env.RESEND_FROM
    if (!from) {
      throw new Error('RESEND_FROM environment variable is required for ResendAlertEmailSender')
    }
    this.client = new Resend(apiKey)
    this.fromAddress = from
  }

  async send(opts: AlertEmailOpts): Promise<{ id?: string }> {
    const from = opts.from ?? `Fillip Alerts <${this.fromAddress}>`

    const { data, error } = await this.client.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    })

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`)
    }

    return { id: data?.id }
  }
}
