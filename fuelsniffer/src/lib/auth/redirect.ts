/**
 * Validate a `?next=` redirect target.
 * Returns the path if safe, '/dashboard' if not.
 *
 * Rules (§9.4):
 * - Must start with '/'
 * - Must not start with '//'
 * - Must not contain '\' or ':'
 */
export function validateNextRedirect(next: string | null): string {
  if (!next) return '/dashboard'
  if (!next.startsWith('/')) return '/dashboard'
  if (next.startsWith('//')) return '/dashboard'
  if (next.includes('\\') || next.includes(':')) return '/dashboard'
  return next
}
