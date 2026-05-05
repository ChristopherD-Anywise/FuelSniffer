import type {
  AuthProvider,
  AuthProviderId,
  ProviderCallbackInput,
  ResolvedIdentity,
} from './types'
import { AuthProviderError } from './types'

/**
 * FakeProvider — deterministic identity for testing.
 *
 * Constructed with a canned ResolvedIdentity. resolveIdentity() returns
 * it immediately without any network calls or DB lookups. Can also be
 * configured to throw on the next call (for error-path testing).
 */
export class FakeProvider implements AuthProvider {
  readonly id: AuthProviderId
  private identity: ResolvedIdentity
  private shouldThrow: AuthProviderError | null = null

  constructor(opts: {
    id?: AuthProviderId
    identity: ResolvedIdentity
  }) {
    this.id = opts.id ?? opts.identity.providerId
    this.identity = opts.identity
  }

  /** Configure the provider to throw on the next resolveIdentity() call */
  throwNext(error: AuthProviderError): void {
    this.shouldThrow = error
  }

  buildAuthorizeUrl(opts: {
    redirectUri: string
    state: string
    codeVerifier?: string
    nonce?: string
  }): string {
    return `https://fake-provider.test/authorize?state=${opts.state}&redirect_uri=${encodeURIComponent(opts.redirectUri)}`
  }

  async resolveIdentity(_input: ProviderCallbackInput): Promise<ResolvedIdentity> { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (this.shouldThrow) {
      const err = this.shouldThrow
      this.shouldThrow = null
      throw err
    }
    return { ...this.identity }
  }
}

/** Convenience factory for tests */
export function makeFakeIdentity(
  overrides: Partial<ResolvedIdentity> = {}
): ResolvedIdentity {
  return {
    providerId: 'google',
    providerSubject: 'fake-subject-001',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Test User',
    ...overrides,
  }
}
