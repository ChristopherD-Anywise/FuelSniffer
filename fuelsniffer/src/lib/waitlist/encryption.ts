/**
 * Waitlist email encryption helpers.
 *
 * Uses Node.js built-in `crypto` module with AES-256-GCM.
 *
 * Env vars required at runtime (not at build time):
 *   WAITLIST_EMAIL_AES_KEY  — 64 hex chars (32 bytes)
 *   WAITLIST_EMAIL_PEPPER   — arbitrary string used as HMAC pepper for email hashing
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.WAITLIST_EMAIL_AES_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('WAITLIST_EMAIL_AES_KEY must be set to a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

function getPepper(): string {
  const pepper = process.env.WAITLIST_EMAIL_PEPPER
  if (!pepper) {
    throw new Error('WAITLIST_EMAIL_PEPPER must be set')
  }
  return pepper
}

/**
 * Encrypts an email address using AES-256-GCM with a random IV.
 * Returns a base64-encoded string in the format: `iv:ciphertext:authTag`
 * where each segment is individually base64-encoded and joined with colons.
 */
export function encryptEmail(email: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(email, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':')
}

/**
 * Decrypts an email address previously encrypted by `encryptEmail`.
 * Throws if the ciphertext is tampered with (GCM auth tag mismatch).
 */
export function decryptEmail(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted email format — expected iv:ciphertext:authTag')
  }

  const [ivB64, ciphertextB64, authTagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Produces a deterministic SHA-256 HMAC hex digest of the email address,
 * keyed with the WAITLIST_EMAIL_PEPPER env var.
 * Used for deduplication — encrypted values are not comparable directly.
 */
export function hashEmail(email: string): string {
  const pepper = getPepper()
  return createHmac('sha256', pepper)
    .update(email.toLowerCase().trim())
    .digest('hex')
}
