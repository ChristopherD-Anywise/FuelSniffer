# Fillip SP-2 — Auth v2 (Magic Link + Google/Apple OAuth) — Design Spec

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§5.3)
**Sub-project:** SP-2 — Auth v2
**Type:** Sub-project design spec (one of several rolling out of the Fillip master)

---

## 1. Purpose & scope

Replace the current invite-code login flow with a modern, low-friction, password-less identity stack suitable for a public AU-wide product:

- **Primary signup/login:** email magic link
- **One-click options:** Google OAuth, Apple Sign In
- **No passwords**, ever
- **Invite codes** demoted from a user-facing gate to an *optional admin-controlled cohort flag* used during the closed beta
- **Existing JWT session model preserved** — only the issuance surface (signup/login) changes; consuming code, middleware, and `/api/*` route protection do not need to change

### Clarification on the "drop passwords" line in the master spec

The master spec says "drop passwords entirely." For the avoidance of doubt: FuelSniffer today uses **invite codes**, not passwords. There is no password column to drop. What this spec does drop is:

1. The user-facing **invite-code field on the signup form**.
2. Any code path that treats possession of an invite code as the authentication factor.

The `invite_codes` table itself is **kept** — repurposed as a beta cohort gate (see §10).

### In scope

- Auth provider abstraction
- Magic-link issuance + redemption
- Google OAuth 2.0 (Authorization Code + PKCE)
- Apple Sign In (Authorization Code + PKCE, with Apple's name-on-first-signin quirk)
- Account linking model (one user, multiple identities)
- Database additions and migration of existing users
- Admin tool to enable/disable invite-code cohort gating
- Email template *contracts* (the visual templates ship with SP-3)
- Test strategy (mocks, integration, E2E)
- Security model (CSRF, OAuth state, replay, token leakage)

### Out of scope

- Password login (won't exist)
- SMS / 2FA (post-MVP)
- Magic-link **deep link into mobile apps** (no native apps in MVP)
- Email template visual design (lives in SP-3)
- Web push subscription onboarding (lives in SP-5)
- Multi-tenant / org accounts (post-MVP, fleet tier)
- Admin role/permission system beyond a single `is_admin` boolean (post-MVP)

---

## 2. User-facing flows (high level)

### 2.1 First-time visitor — magic link

1. User clicks **Sign in** → `/login`.
2. Page shows three options stacked: **Continue with Google**, **Continue with Apple**, divider, **Email me a sign-in link**.
3. User enters email → POST `/api/auth/magic-link/request`.
4. Server returns `{ ok: true }` regardless of whether the email is in our system (enumeration defence). Always show the same "Check your email" screen.
5. Email arrives within ~30 s. Single-use link `https://fillip.com.au/api/auth/magic-link/callback?token=…`.
6. User clicks link → token validated, user created if new (subject to cohort gating, §10), session JWT issued, redirect to `/dashboard`.

### 2.2 First-time visitor — Google or Apple

1. User clicks **Continue with Google** → `/api/auth/oauth/google/start`.
2. Server generates `state` + PKCE `code_verifier`, stores both in a short-lived signed cookie, redirects to Google's authorize endpoint with `code_challenge`.
3. Google redirects back to `/api/auth/oauth/google/callback?code=…&state=…`.
4. Server validates `state`, exchanges code for tokens (using PKCE verifier), validates ID token, looks up or creates user + identity, issues session JWT, redirects to `/dashboard`.
5. Apple flow is the same shape; differences captured in §6.

### 2.3 Returning user

Identical to first-time. Magic link or OAuth re-authenticates and re-issues a session.

### 2.4 Account linking

If a user signs in with an OAuth identity whose email matches an existing magic-link account, we **automatically link** the identity to that user (provided the OAuth provider asserts the email is verified — Google always does, Apple's `email_verified` claim does too). No "merge accounts" UI in MVP.

Edge case — OAuth provider does **not** assert verified email: do not auto-link; create a separate user. This shouldn't happen with Google/Apple but is the safe default if a future provider is added.

---

## 3. Architecture

### 3.1 Module layout

```
src/lib/auth/
├── providers/
│   ├── types.ts            — AuthProvider interface + result types
│   ├── magic-link.ts       — magic-link provider implementation
│   ├── google.ts           — Google OAuth provider implementation
│   ├── apple.ts            — Apple OAuth provider implementation
│   └── index.ts            — registry + factory
├── tokens.ts               — magic-link token generation, hashing, verification
├── linking.ts              — account-linking rules (email-match auto-link)
├── cohort.ts               — invite-code cohort gating (admin-controlled flag)
└── email/
    └── magic-link.ts       — email contract (subject, text, html slot — visuals in SP-3)

src/app/api/auth/
├── magic-link/
│   ├── request/route.ts    — POST: issue magic link
│   └── callback/route.ts   — GET: redeem token, issue session
├── oauth/
│   ├── [provider]/start/route.ts     — GET: redirect to provider
│   └── [provider]/callback/route.ts  — GET: exchange code, issue session
├── logout/route.ts         — POST: clear session cookie (already exists pattern)
└── me/route.ts             — GET: return current user (used by client shell)
```

`src/lib/session.ts` (the existing JWT helper from the master spec) is **not modified**. It exposes `createSession(userId)` and `getSession(req)` and remains the single source of truth for session JWTs. The auth providers all converge on a single call: "given a `users.id`, produce a session and set the cookie."

### 3.2 Provider abstraction

A common interface so the route handlers don't know which provider they're talking to:

```
type AuthProviderId = 'magic-link' | 'google' | 'apple'

interface AuthProvider {
  id: AuthProviderId

  // For redirect-style providers (OAuth). magic-link returns null here
  // and uses its own request/callback shape.
  buildAuthorizeUrl?(opts: { redirectUri: string; state: string; codeVerifier?: string }): string

  // Exchange a callback payload (code, magic-link token, etc.) for a verified identity.
  // Throws on any validation failure.
  resolveIdentity(input: ProviderCallbackInput): Promise<ResolvedIdentity>
}

interface ResolvedIdentity {
  providerId: AuthProviderId
  providerSubject: string         // stable per-provider user ID (sub claim, or hashed email for magic-link)
  email: string                   // normalised lowercase
  emailVerified: boolean
  displayName?: string            // Google gives this; Apple only on first signin
  rawClaims?: Record<string, unknown>  // for debugging only, never persisted in MVP
}
```

The route handler then:

1. `provider.resolveIdentity(...)` → `ResolvedIdentity`
2. `linking.findOrCreateUser(identity)` → `users.id`
3. `cohort.assertAllowed(user, identity)` → throws if invite-cohort gating is on and user is new + has no valid invite
4. `session.createSession(userId)` → set cookie → 302 to `/dashboard`

### 3.3 Why an abstraction (not just three route files)?

- Lets us swap providers without touching the routes (e.g. switch to Auth0 or Clerk later — not the current plan, but cheap insurance).
- Provides one obvious test-mock boundary: tests inject a `FakeProvider` and exercise the routes end-to-end without touching Google/Apple/Resend.
- Makes the cohort + linking logic **provider-agnostic** — written once.

---

## 4. Database additions

### 4.1 Schema (Drizzle, plain SQL migration to follow the project convention in `src/lib/db/migrations/`)

```
users
  id              uuid pk default gen_random_uuid()
  email           citext unique not null
  email_verified  boolean not null default false
  display_name    text
  is_admin        boolean not null default false
  created_at      timestamptz not null default now()
  last_login_at   timestamptz
  -- legacy column from invite-code era; kept for migration; nullable
  legacy_invite_code text

oauth_identities
  id                  uuid pk default gen_random_uuid()
  user_id             uuid not null references users(id) on delete cascade
  provider            text not null         -- 'google' | 'apple'
  provider_subject    text not null         -- the provider's stable subject ID
  email_at_link       text not null         -- email asserted at link time, for audit
  created_at          timestamptz not null default now()
  unique (provider, provider_subject)
  -- a user may have at most one identity per provider:
  unique (user_id, provider)

magic_link_tokens
  id              uuid pk default gen_random_uuid()
  email           citext not null            -- the requested email (may not be a known user yet)
  token_hash      text not null unique       -- sha256 of the random token; raw token never stored
  purpose         text not null              -- 'login' for MVP; reserved for future 'email-change' etc.
  expires_at      timestamptz not null
  consumed_at     timestamptz                -- null until used; non-null = consumed (single-use)
  ip_at_request   inet
  ua_at_request   text
  created_at      timestamptz not null default now()

magic_link_request_log
  -- for rate-limiting; see §5.4
  email_or_ip_hash text not null
  bucket_window    timestamptz not null
  count            integer not null default 1
  primary key (email_or_ip_hash, bucket_window)
```

Notes:

- `users.email` is `citext` so lookups are case-insensitive without `lower()` everywhere.
- `oauth_identities.unique(provider, provider_subject)` is the primary linking key — never trust email alone for re-identification across logins.
- `oauth_identities.unique(user_id, provider)` enforces "one Google identity per user" in MVP; can be relaxed if we ever support multiple Google accounts under one user (we don't plan to).
- `magic_link_tokens.token_hash` — we store **only the SHA-256 of the token**, never the raw token. The raw token lives only in the email URL.
- `magic_link_request_log` is a small table; it can also be in-memory/Redis later. For MVP, Postgres is fine — volume is low.

### 4.2 Existing `invite_codes` table

Keep as-is. Add a single new row to a new `app_settings` table (or a single env var) representing the **cohort gating flag**:

```
app_settings
  key   text primary key
  value jsonb not null
```

With one row: `('require_invite_for_signup', false)` initially. Admin tool flips this.

---

## 5. Magic-link flow — detailed

### 5.1 Token shape

- Generated with `crypto.randomBytes(32)` → base64url → ~43 chars. Sufficient entropy (256 bits).
- Stored as `token_hash = sha256(token)`. Lookup at redemption by hashing the incoming token and querying `where token_hash = $1`.
- TTL: **15 minutes**. Configurable via env (`MAGIC_LINK_TTL_MINUTES`, default 15).
- Single-use: `consumed_at` set atomically inside the redemption transaction. If already non-null, redemption fails.

### 5.2 Request flow

`POST /api/auth/magic-link/request` body `{ email: string }`:

1. Normalise email (lowercase, trim).
2. Validate email shape with Zod.
3. Run rate limit check (§5.4). If exceeded → 429.
4. Generate token + hash. Insert `magic_link_tokens` row.
5. Render the magic-link email (SP-3 ships the visuals; SP-2 ships a working text-only template).
6. Send via the email provider (default: **Resend** — see §11).
7. **Always** return `{ ok: true }`, even on send failure or unknown email. Send failures are logged + alerted internally but never surfaced to the requester (enumeration defence).
8. UI shows "If an account exists for that email, we've sent a sign-in link."

### 5.3 Redemption flow

`GET /api/auth/magic-link/callback?token=…`:

1. Hash the incoming `token`.
2. `BEGIN; SELECT ... FOR UPDATE` on `magic_link_tokens` by hash.
3. Reject if: not found / expired / already consumed.
4. Set `consumed_at = now()`.
5. `findOrCreateUser({ providerId: 'magic-link', providerSubject: sha256(email), email, emailVerified: true })`.
   - For magic-link, `providerSubject` is a deterministic hash of email — magic-link is not stored in `oauth_identities`; the user record itself is the identity. Email arrival is the proof.
6. Apply cohort gate (§10).
7. `session.createSession(user.id)`, set cookie.
8. `COMMIT`.
9. 302 redirect to `/dashboard` (or to a `next` query parameter if it's a same-origin path — strictly validated, see §9.4).

### 5.4 Rate limiting

Two buckets, both sliding 1-hour windows:

- **Per email:** max 5 requests/hour. Hash the email before bucketing (privacy + index size).
- **Per IP:** max 20 requests/hour. Use the same `hashIp` from `src/middleware.ts` for consistency.

Implemented in `magic_link_request_log` for MVP. Burst protection (e.g. max 1 request per email per 60 s) added if abuse appears — keep MVP simple.

---

## 6. OAuth flows — detailed

### 6.1 Google

- **Flow:** Authorization Code with PKCE (no client secret needed in code path; PKCE replaces it for browser-initiated auth).
- **Discovery doc:** `https://accounts.google.com/.well-known/openid-configuration` (load at server startup, cache for 24 h).
- **Scopes:** `openid email profile`. Nothing else — no Drive, no contacts.
- **Redirect URI:** `https://fillip.com.au/api/auth/oauth/google/callback`. Must be pre-registered in Google Cloud Console for the OAuth client. Local dev: `http://localhost:3000/api/auth/oauth/google/callback`.
- **State + PKCE:**
  - `state`: 32 random bytes, base64url. Stored in a `__Host-fillip_oauth_state` cookie (Secure, HttpOnly, SameSite=Lax, Path=/, ~10 min TTL). Compared on callback.
  - `code_verifier`: 32 random bytes, base64url. Stored in a `__Host-fillip_oauth_pkce` cookie alongside state. `code_challenge = base64url(sha256(verifier))`, `code_challenge_method=S256` sent on the authorize URL.
- **ID token validation:** verify signature against Google JWKS, check `iss`, `aud` (our client ID), `exp`, `nonce` (we include a nonce in the authorize URL and check it matches a third cookie value).
- **Identity:** `providerSubject = id_token.sub`, `email = id_token.email`, `emailVerified = id_token.email_verified`, `displayName = id_token.name`.

### 6.2 Apple Sign In (web)

The hardest of the three. Notable quirks:

- **Services ID, not a normal OAuth client:** Apple requires a "Services ID" (e.g. `com.fillip.web`) registered in the Apple Developer portal, with the redirect URI pre-registered. Domain must be verified (Apple sends a `.well-known/apple-developer-domain-association.txt` file).
- **Client secret is a JWT we sign**: Apple does not issue a static client secret. We sign a short-lived (max 6 months) JWT with our **Apple private key (.p8 file)** using ES256. Required claims: `iss=teamID`, `iat`, `exp`, `aud=https://appleid.apple.com`, `sub=servicesID`. Generate fresh per request OR cache for ~1 hour. **Private key (.p8) lives in env var `APPLE_PRIVATE_KEY_P8` (PEM-encoded), never committed.**
- **Name only returned on first sign-in**: Apple sends `user.name = { firstName, lastName }` *only* on the first authorization (and only as a POST form field, not in the ID token). On subsequent sign-ins, the name is **gone forever from Apple's response**. We must capture it on first sign-in and persist to `users.display_name`. If we miss it, the user has no display name from Apple.
- **`response_mode=form_post`**: Apple posts the callback as `application/x-www-form-urlencoded`, not a GET with query params. The `/api/auth/oauth/apple/callback` route must accept **POST** (and parse the form body). This is different from Google.
- **Email may be a relay address**: Users can choose "Hide My Email," giving us an `@privaterelay.appleid.com` forwarding address. Treat it as a normal verified email; replies from our system will be forwarded by Apple.
- **PKCE:** Apple supports PKCE — use it the same way as Google.
- **Scopes:** `name email`. Note: requesting `name` is what triggers the one-time name return.
- **Identity:** `providerSubject = id_token.sub`, `email = id_token.email`, `emailVerified = id_token.email_verified`, `displayName` only on first sign-in.

### 6.3 Shared OAuth concerns

- **CSRF/state:** `state` cookie comparison is mandatory. Reject callback if missing or mismatched.
- **Replay:** `code` is single-use by Google/Apple, but we additionally guard by clearing the state/PKCE cookies on the first callback hit — replay attempts arrive without cookies and are rejected.
- **Open redirect:** the post-login redirect target MUST be a same-origin path starting with `/`, validated server-side. Reject `//evil.com`, full URLs, etc.
- **Provider outages:** if `resolveIdentity` throws, redirect to `/login?error=oauth_failed`. Never surface raw provider errors to the user.

---

## 7. Account linking — rules

| Scenario | Outcome |
|---|---|
| OAuth callback, `(provider, provider_subject)` row exists | Log in as that user. |
| OAuth callback, no identity row, but `users.email` matches and OAuth `email_verified=true` | Auto-link: insert `oauth_identities` row pointing at the existing user. Log in. |
| OAuth callback, no identity row, no matching user, signup allowed | Create user + identity row. Log in. |
| OAuth callback, no identity row, no matching user, **cohort-gated** | 302 to `/login?error=invite_required`. Do not create the user. |
| Magic link redeemed, user exists | Log in. |
| Magic link redeemed, no user, signup allowed | Create user. Log in. |
| Magic link redeemed, no user, cohort-gated | 302 to `/login?error=invite_required`. Token is still consumed (single-use). |

Out of scope: explicit "link this Google account to my existing magic-link account" UI inside settings. Auto-link by verified email handles ~all real cases. Future SP can add a settings UI.

---

## 8. Migration of existing invite-code users

The current FuelSniffer codebase has invite-coded users. We must not break their sessions.

### 8.1 Strategy

1. **Schema migration** runs first: add `users` table (if it doesn't exist in this exact shape — see §13 open question on overlap with whatever `users` already exists), add `oauth_identities`, `magic_link_tokens`, `magic_link_request_log`, `app_settings`. Backfill `users` rows from existing invite-code-registered users (preserving `id`, `email`, mapping the old invite code to `legacy_invite_code`).
2. **Existing JWT sessions stay valid.** The session payload is `{ userId }`; `userId` is preserved across migration. No re-login required.
3. **First time a legacy user logs out / lands on `/login`,** they choose magic-link or OAuth. Magic link to their existing email auto-finds their existing user row. Done.
4. **The old invite-code form is removed.** Routes that used to accept invite codes return 410 Gone. The admin tool retains the ability to issue codes — but only for cohort gating (§10), not for the legacy login flow.

### 8.2 Risk

- If the old `users` table has columns we don't list above (e.g. a `password_hash` column from an even-earlier era), the migration adds the new columns *additively*. We do not drop legacy columns in the same migration — separate cleanup migration in a later release once we confirm nothing reads them.

---

## 9. Security considerations

### 9.1 CSRF on magic-link request

`POST /api/auth/magic-link/request` is a state-changing endpoint. Defences:

- Same-site cookies on session (existing).
- Require `Origin` header to match our host on POST. Reject otherwise. (Same-origin check, not a token — sufficient because the endpoint accepts no auth-required action; the worst a CSRF-forged request can do is *send a magic-link email to the victim's own address*, which the attacker can't intercept anyway.)
- Rate limit (§5.4) caps abuse.

### 9.2 CSRF on magic-link callback

`GET /api/auth/magic-link/callback` is GET-with-token. The token itself is the CSRF defence: an attacker who can forge a navigation but not steal the email cannot supply a valid token.

### 9.3 OAuth state / CSRF / replay

Covered in §6.3 — `state` cookie comparison + clearing on first use.

### 9.4 Open-redirect prevention

`?next=` parameters are validated:

- Must start with `/`.
- Must not start with `//`.
- Must not contain `\` (Windows path tricks) or `:`.
- If invalid, fall back to `/dashboard`.

### 9.5 Email enumeration

`POST /api/auth/magic-link/request` always returns `{ ok: true }`. Same response time (use a constant-time delay or async fire-and-forget the send). UI never reveals whether the email is a known user.

### 9.6 Token leakage

- Magic-link tokens stored hashed (SHA-256). Database compromise does not yield usable tokens.
- Magic-link emails sent over TLS only (Resend handles this).
- Magic-link URLs include the token in the path/query. We accept the standard risk that referrer headers from clicked links could leak — mitigated by the 15-min single-use TTL and our `Referrer-Policy: strict-origin-when-cross-origin` header (already set in `src/lib/security/headers.ts`).

### 9.7 Logging

- Never log raw magic-link tokens or OAuth `code` values.
- Log redacted email (`u***@example.com`) in audit lines.
- `oauth_identities.email_at_link` is the only PII auth audit trail in MVP — kept indefinitely.

### 9.8 Cookie hardening

All auth cookies (session, OAuth state/PKCE/nonce):

- `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
- `__Host-` prefix on the short-lived OAuth ones to lock to host + path.
- Session cookie `SameSite=Lax` (not Strict) so OAuth callback redirect carries the cookie back.

---

## 10. Admin invite-cohort gating

### 10.1 Behaviour

- Single global flag `app_settings.require_invite_for_signup` (boolean).
- Default in MVP: **false** (open signup).
- During closed beta: admin flips it to **true**. New users (no existing `users` row) must present a valid `invite_codes.code` at signup time. Existing users always log in fine.

### 10.2 UX when gating is on

- Magic-link request form gains an optional **Invite code** field. If the email belongs to an existing user, the field is ignored.
- OAuth: after a successful callback, if the user is new and we'd normally create one, we instead set a short-lived signed cookie `pending_signup={ provider, providerSubject, email, displayName }` and redirect to `/login?step=invite`. There the user enters a code, and we then complete user creation atomically.

### 10.3 Admin tool

A protected page at `/dashboard/admin/invites` (gated by `users.is_admin`) — already exists in some form per the master spec; SP-2 just adds the cohort flag toggle and lightly re-skins the existing invite list.

### 10.4 Code redemption

- Codes are single-use (current behaviour, preserved).
- Marking a code consumed and creating the user happen in the same DB transaction.

---

## 11. Email templates (placeholder, real visuals in SP-3)

SP-2 ships a working but visually plain magic-link email. SP-3 replaces the visuals.

**Template contract** (`src/lib/auth/email/magic-link.ts`):

- Inputs: `{ email, magicLinkUrl, ttlMinutes, appName, supportEmail }`
- Outputs: `{ subject, text, html }`
- `subject`: "Your Fillip sign-in link"
- `text`: plain-text fallback always sent
- `html`: simple inline-styled HTML — single CTA button + plain-text URL fallback below it + a "didn't request this? ignore this email" line.

Provider-side: **Resend** (recommended — see §13). The provider boundary is the `EmailSender` interface (`send(to, subject, text, html): Promise<void>`), so swapping to SES later is a single-file change.

---

## 12. Test strategy

### 12.1 Unit tests (Vitest)

- `tokens.ts`: generation entropy, hash determinism, expiry math.
- `linking.ts`: each row of the §7 matrix as a separate test.
- `cohort.ts`: gate on/off behaviour, code consumption atomicity.
- Each provider's `resolveIdentity`:
  - Magic-link: hash mismatch, expired, already consumed.
  - Google: bad ID token signature, wrong `aud`, wrong `iss`, expired, missing nonce.
  - Apple: invalid client-secret JWT generation, name-on-first-signin capture, form_post body parsing, relay-email handling.

### 12.2 Integration tests

- Spin up the Next.js app + a Postgres test database (Docker compose used in CI as it is locally).
- **Provider mocks:** at the `AuthProvider` interface, inject a `FakeOAuthProvider` that returns canned identities. Routes/middleware/DB exercised end-to-end.
- **Email mock:** a `MemoryEmailSender` that records calls; the test then "clicks" the captured URL.
- Scenarios:
  - Cold signup via magic link.
  - Cold signup via Google.
  - Cold signup via Apple (with name on first signin, verify `display_name` persisted).
  - Returning login on each provider.
  - Email auto-link (existing magic-link user signs in with Google for the first time).
  - Cohort-gated signup denied without invite.
  - Cohort-gated signup allowed with invite (code marked consumed).
  - Magic-link replay rejected.
  - OAuth state mismatch rejected.
  - Open-redirect attempt sanitised.

### 12.3 E2E (Playwright) — single happy path per provider

Smoke test only — full coverage lives in integration. Magic-link uses the test inbox via the `MemoryEmailSender` exposed at a `__test/last-email` route in test builds.

### 12.4 Manual verification before launch

- Real Google OAuth round-trip in staging.
- Real Apple Sign In round-trip in staging (requires a paid Apple Developer account — see §13).
- Real Resend send to a real inbox; click on real-world clients (Gmail web, Gmail iOS, Apple Mail, Outlook web).

---

## 13. Open questions & recommended defaults

| # | Question | Recommended default | Status |
|---|---|---|---|
| Q1 | Email provider for magic links? | **Resend** — modern API, generous free tier, AU-friendly DNS docs. SES is the alternative if we already have AWS infra. | **Decision pending** |
| Q2 | Apple Developer account ownership / cost | Personal account under cdenn (USD $99/yr). Required for Apple Sign In. Could defer Apple to a follow-up if cost is a concern. | **Decision pending** |
| Q3 | Where does the Apple `.p8` private key live in production? | Env var `APPLE_PRIVATE_KEY_P8` (PEM, multi-line) loaded into the running container. Never in repo. Rotated annually. | **Decision pending — confirm secret-mgmt approach (env var vs. cloudflared + secrets store)** |
| Q4 | Magic-link TTL | **15 minutes.** Long enough for users on slow inboxes; short enough to limit replay window. | Recommended — overrideable per env |
| Q5 | Magic-link rate limits | **5 / email / hour, 20 / IP / hour.** | Recommended |
| Q6 | Cohort gate default at MVP launch | **Off** (open signup). On only during closed-beta phase before public launch. | Recommended |
| Q7 | Auto-link OAuth identities to existing email accounts? | **Yes**, only when provider asserts `email_verified=true`. Google + Apple both do. | Recommended |
| Q8 | Capture Apple's first-signin name? | **Yes** — persist to `users.display_name` if currently null. | Recommended |
| Q9 | Allow Apple "Hide My Email" relay addresses? | **Yes.** Treat as a normal verified email. | Recommended |
| Q10 | Admin role model | Single `users.is_admin` boolean for MVP. Proper RBAC is a future SP. | Recommended |
| Q11 | Should `/api/auth/magic-link/request` differ in response time for unknown vs. known emails? | **No.** Constant-time, fire-and-forget the send, always 200. | Recommended |
| Q12 | Logout: invalidate JWT or just clear cookie? | Clear cookie. JWT remains technically valid until `exp`. Adding a server-side denylist is a future hardening — not MVP. | Recommended |
| Q13 | Session JWT TTL after this work | **Unchanged from existing `src/lib/session.ts`** (whatever it is today; master spec says "keep"). Not redefining here. | Confirmed |

---

## 14. Rollout plan (sketch — full plan in implementation doc)

1. Schema migration (additive only).
2. Land `src/lib/auth/` modules + provider abstraction with `FakeProvider` only — full unit tests.
3. Land magic-link routes + email integration — flag-gated behind `AUTH_V2_ENABLED=false` env var.
4. Land Google OAuth route — same flag.
5. Land Apple OAuth route — same flag (requires Apple Developer enrolment, may slip).
6. Switch `/login` page to render the new UI when `AUTH_V2_ENABLED=true`.
7. Soak in staging.
8. Flip flag in production. Old invite-code form returns 410.
9. Remove flag + dead code after one stable week.

---

## 15. Dependencies

- **Master spec §5.3** — locks in the no-passwords, magic-link-primary direction.
- **SP-0 Rebrand** — `appName` and email "from" address depend on rebrand decisions; placeholder OK in MVP.
- **SP-3 UX core** — supplies the visual email template + the redesigned `/login` page. SP-2 ships functional but plain versions both can stand on their own.
- **SP-5 Alerts** — depends on this spec for `users.id` being a stable identity to attach alert subscriptions to.

---

## 16. Non-goals (worth restating)

- No passwords. No "set a backup password" option. Ever.
- No email-change flow in MVP (would need a second magic-link `purpose`; trivial to add later).
- No SMS, no TOTP, no WebAuthn — all post-MVP.
- No multi-tenant orgs.
- No GDPR-style data-export/deletion endpoints — handled out-of-band by admin until a dedicated SP lands.
