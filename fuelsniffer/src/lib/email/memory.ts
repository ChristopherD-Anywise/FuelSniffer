import type { EmailSender } from './types'

export interface CapturedEmail {
  to: string
  subject: string
  text: string
  html: string
}

/**
 * In-memory EmailSender for tests.
 *
 * Records all send() calls. Use lastCall() to retrieve the most recent
 * email, and reset() to clear between tests.
 */
export class MemoryEmailSender implements EmailSender {
  readonly calls: CapturedEmail[] = []

  async send(opts: CapturedEmail): Promise<void> {
    this.calls.push({ ...opts })
  }

  lastCall(): CapturedEmail | undefined {
    return this.calls[this.calls.length - 1]
  }

  reset(): void {
    this.calls.length = 0
  }
}
