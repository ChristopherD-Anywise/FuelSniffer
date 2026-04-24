/**
 * EmailSender interface — provider-agnostic abstraction for transactional email.
 *
 * SP-0 ships the identity stub (getDefaultSender).
 * SP-2 wires this interface to Resend (production) and MemoryEmailSender (tests).
 */
export interface EmailSender {
  send(opts: {
    to: string
    subject: string
    text: string
    html: string
  }): Promise<void>
}
