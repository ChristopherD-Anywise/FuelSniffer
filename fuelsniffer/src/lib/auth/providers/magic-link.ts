import { hashToken, redeemToken } from '@/lib/auth/tokens'
import type { AuthProvider, ProviderCallbackInput, ResolvedIdentity } from './types'
import { AuthProviderError } from './types'

/**
 * Magic-link auth provider.
 *
 * resolveIdentity() validates the token from the DB and returns the
 * verified identity. The providerSubject is a deterministic hash of
 * the email — magic-link identities are NOT stored in oauth_identities;
 * the users.email column is the identity itself.
 */
export class MagicLinkProvider implements AuthProvider {
  readonly id = 'magic-link' as const

  async resolveIdentity(input: ProviderCallbackInput): Promise<ResolvedIdentity> {
    if (input.type !== 'magic-link') {
      throw new AuthProviderError('Invalid input type for magic-link provider', 'provider_error')
    }

    const result = await redeemToken(input.token)

    if (!result.ok) {
      const code = {
        not_found: 'token_not_found' as const,
        expired: 'token_expired' as const,
        consumed: 'token_consumed' as const,
      }[result.error]

      throw new AuthProviderError(
        `Magic link token ${result.error}`,
        code
      )
    }

    const email = result.email.toLowerCase().trim()

    return {
      providerId: 'magic-link',
      // Deterministic hash of email — stable across re-logins
      providerSubject: hashToken(email),
      email,
      emailVerified: true,
    }
  }
}
