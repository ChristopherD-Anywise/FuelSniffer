import { Resend } from 'resend'
import type { EmailSender } from './types'
import { getDefaultSender } from './sender'

/**
 * Resend transport implementing EmailSender.
 *
 * Reads RESEND_API_KEY from env. In development/test environments
 * with no key set, the send() call will throw — use MemoryEmailSender
 * in tests instead.
 */
export class ResendEmailSender implements EmailSender {
  private client: Resend

  constructor() {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY environment variable is required for ResendEmailSender'
      )
    }
    this.client = new Resend(apiKey)
  }

  async send(opts: {
    to: string
    subject: string
    text: string
    html: string
  }): Promise<void> {
    const sender = getDefaultSender()
    const from = `${sender.name} <${sender.address}>`

    const { error } = await this.client.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`)
    }
  }
}
