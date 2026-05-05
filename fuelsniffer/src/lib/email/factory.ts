import type { EmailSender } from './types'
import { MemoryEmailSender } from './memory'

/**
 * Returns the appropriate EmailSender for the current environment.
 *
 * In test environments (NODE_ENV=test or VITEST=true), returns a
 * MemoryEmailSender singleton so tests can inspect sent emails without
 * making network calls.
 *
 * In production, returns a ResendEmailSender. The import is lazy to
 * avoid loading the Resend SDK (and requiring RESEND_API_KEY) in tests.
 */
let _testSender: MemoryEmailSender | null = null

export function getEmailSender(): EmailSender {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    if (!_testSender) _testSender = new MemoryEmailSender()
    return _testSender
  }
  // Lazy import to avoid loading Resend SDK during test collection
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ResendEmailSender } = require('./resend') as typeof import('./resend')
  return new ResendEmailSender()
}

/**
 * Reset the test email sender between tests.
 * No-op outside test environments.
 */
export function resetTestEmailSender(): void {
  if (_testSender) _testSender.reset()
}

/**
 * Get the test sender directly (for reading captured emails in tests).
 * Throws if called outside a test environment.
 */
export function getTestEmailSender(): MemoryEmailSender {
  if (!_testSender) {
    throw new Error('No test email sender — call getEmailSender() in test context first')
  }
  return _testSender
}
