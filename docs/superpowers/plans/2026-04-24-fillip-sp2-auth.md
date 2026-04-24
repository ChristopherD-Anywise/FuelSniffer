# Fillip SP-2 — Auth v2 (Magic Link + Google/Apple OAuth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invite-code login model with a password-less identity stack: email magic links (via Resend), Google OAuth (PKCE), and Apple Sign In (Services ID + .p8 client secret JWT). One abstraction (`AuthProvider`) drives all three flows through shared account-linking and cohort-gating logic. Existing JWT sessions (jose) are preserved; only the issuance surface changes.

**Baseline findings from worktree audit:**
- `src/lib/session.ts` — does NOT exist. SP-2 creates it from scratch.
- `src/app/api/auth/` — does NOT exist. SP-2 creates it from scratch.
- `src/lib/email/sender.ts` — EXISTS (SP-0 stub). SP-2 plugs Resend behind the `EmailSender` interface it defines.
- `src/lib/security/rate-limit.ts` — EXISTS (in-memory token-bucket). SP-2 adds DB-backed `magic_link_request_log` for cross-restart persistence (in-memory fallback acceptable in MVP).
- `src/lib/security/headers.ts` — EXISTS. Already sets `Referrer-Policy: strict-origin-when-cross-origin`. No changes needed.
- `src/middleware.ts` — EXISTS. Has `hashIp()` helper; auth routes not yet protected. SP-2 extends middleware to gate `/dashboard` routes behind session check.
- `src/lib/db/migrations/` — migrations 0000–0012 exist. SP-2 adds migration 0013.
- `invite_codes` + `sessions` tables — exist (migration 0003). SP-2 adds `users`, `oauth_identities`, `magic_link_tokens`, `magic_link_request_log`, `app_settings`.
- `resend` npm package — NOT installed. SP-2 installs it.

**Architecture:** `src/lib/auth/` contains the provider abstraction + token/linking/cohort utilities. `src/app/api/auth/` contains the route handlers (magic-link request + callback; OAuth start + callback; logout; me). `src/lib/session.ts` is the JWT session boundary. The middleware gains session-gate logic for the `/dashboard` tree.

**Tech Stack:** Next.js 16 App Router · TypeScript · PostgreSQL 17 · Drizzle (plain SQL migrations) · jose (JWT sessions) · Resend SDK (email) · Vitest · node:crypto (token generation + hashing).

---

## File Structure

**Files created** (all under `fuelsniffer/` unless noted):

| Path | Responsibility |
|---|---|
| `src/lib/session.ts` | JWT session helpers — `createSession(userId)`, `getSession(req)`, `clearSession(res)` |
| `src/lib/auth/providers/types.ts` | `AuthProvider` interface, `ResolvedIdentity`, `ProviderCallbackInput` types |
| `src/lib/auth/providers/magic-link.ts` | Magic-link provider — `resolveIdentity` validates token from DB |
| `src/lib/auth/providers/google.ts` | Google OAuth provider — `buildAuthorizeUrl`, `resolveIdentity` (ID token validation) |
| `src/lib/auth/providers/apple.ts` | Apple Sign In provider — `buildAuthorizeUrl`, `resolveIdentity` (form_post, .p8 JWT, name capture) |
| `src/lib/auth/providers/fake.ts` | `FakeProvider` for tests — deterministic identity without network calls |
| `src/lib/auth/providers/index.ts` | Provider registry + factory |
| `src/lib/auth/tokens.ts` | `generateToken()`, `hashToken()`, `storeToken()`, `redeemToken()` |
| `src/lib/auth/linking.ts` | `findOrCreateUser(identity)` — implements §7 matrix |
| `src/lib/auth/cohort.ts` | `assertAllowed(userId, isNewUser, inviteCode?)` — reads `app_settings` |
| `src/lib/auth/email/magic-link.ts` | Email template contract — subject, text, html |
| `src/lib/email/resend.ts` | Resend transport implementing `EmailSender` interface |
| `src/lib/email/types.ts` | `EmailSender` interface |
| `src/lib/email/memory.ts` | `MemoryEmailSender` for tests |
| `src/app/api/auth/magic-link/request/route.ts` | POST — issue magic link |
| `src/app/api/auth/magic-link/callback/route.ts` | GET — redeem token, issue session |
| `src/app/api/auth/oauth/[provider]/start/route.ts` | GET — redirect to OAuth provider |
| `src/app/api/auth/oauth/[provider]/callback/route.ts` | GET/POST — exchange code, issue session |
| `src/app/api/auth/logout/route.ts` | POST — clear session cookie |
| `src/app/api/auth/me/route.ts` | GET — return current user |
| `src/app/login/page.tsx` | Login page — magic link form + Google/Apple buttons |
| `src/app/dashboard/admin/invites/page.tsx` | Admin invites page with cohort flag toggle |
| `src/lib/db/migrations/0013_auth_v2.sql` | New tables: users, oauth_identities, magic_link_tokens, magic_link_request_log, app_settings |
| `src/__tests__/auth/tokens.test.ts` | Token generation, hash determinism, expiry |
| `src/__tests__/auth/linking.test.ts` | Account-linking matrix (§7) |
| `src/__tests__/auth/cohort.test.ts` | Cohort gate on/off |
| `src/__tests__/auth/magic-link-provider.test.ts` | Magic-link provider — hash mismatch, expired, consumed |
| `src/__tests__/auth/google-provider.test.ts` | Google provider — bad token, wrong aud/iss |
| `src/__tests__/auth/apple-provider.test.ts` | Apple provider — .p8 JWT gen, name capture, form_post |
| `src/__tests__/auth/session.test.ts` | createSession/getSession round-trip |
| `src/__tests__/auth/magic-link-route.test.ts` | Integration: magic-link request + callback via FakeProvider |
| `src/__tests__/auth/oauth-route.test.ts` | Integration: OAuth start/callback, state mismatch, open-redirect |

**Files modified:**

| Path | Change |
|---|---|
| `src/middleware.ts` | Add session gate for `/dashboard` routes; skip `/api/auth/*` |
| `docker-compose.yml` | Add RESEND_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_P8 to app environment |
| `.env.example` | Document all new auth env vars with safe placeholders |
| `package.json` | No change expected — resend installed via npm |
| `src/lib/security/rate-limit.ts` | Add `/api/auth/magic-link/request` rate limit config |

---

## Task 0: Setup

- [ ] **Step 0.1: Install resend SDK**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp2/fuelsniffer && npm install resend
```

- [ ] **Step 0.2: Verify baseline tests pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp2/fuelsniffer && npm run test:run 2>&1 | tail -20
```

Note any pre-existing failures (4 DB-dependent tests are expected to fail without a live Postgres).

---

## Task 1: EmailSender interface + Resend + MemoryEmailSender

**Files:** `src/lib/email/types.ts`, `src/lib/email/resend.ts`, `src/lib/email/memory.ts`

SP-0's `sender.ts` exposes `getDefaultSender()` but no `EmailSender` interface. SP-2 adds the interface so the auth code stays provider-agnostic.

- [ ] **Step 1.1: Create `src/lib/email/types.ts`** — `EmailSender` interface with `send(to, subject, text, html): Promise<void>`

- [ ] **Step 1.2: Create `src/lib/email/resend.ts`** — `ResendEmailSender` class implementing `EmailSender`:
  - Reads `RESEND_API_KEY` env var; throws on missing key in production
  - Uses `getDefaultSender()` for the From header
  - `new Resend(apiKey).emails.send(...)` call

- [ ] **Step 1.3: Create `src/lib/email/memory.ts`** — `MemoryEmailSender` class for tests:
  - Records all `send()` calls to `calls: { to, subject, text, html }[]`
  - `lastCall()`, `reset()` helpers

- [ ] **Step 1.4: Create factory `getEmailSender(): EmailSender`** in `src/lib/email/sender.ts` extension or a new `src/lib/email/factory.ts`:
  - Returns `ResendEmailSender` in production (env-driven)
  - Returns `MemoryEmailSender` singleton in test env

- [ ] **Step 1.5: Run lint + tests** — no new failures

---

## Task 2: Database migration (0013)

**Files:** `src/lib/db/migrations/0013_auth_v2.sql`

- [ ] **Step 2.1: Write migration** with these tables (citext extension assumed from existing migrations — verify, add `CREATE EXTENSION IF NOT EXISTS citext` if not already present):

  - `users(id uuid pk, email citext unique not null, email_verified boolean default false, display_name text, is_admin boolean default false, created_at timestamptz, last_login_at timestamptz, legacy_invite_code text)`
  - `oauth_identities(id uuid pk, user_id uuid refs users(id) cascade, provider text, provider_subject text, email_at_link text, created_at timestamptz)` — unique(provider, provider_subject), unique(user_id, provider)
  - `magic_link_tokens(id uuid pk, email citext, token_hash text unique, purpose text default 'login', expires_at timestamptz, consumed_at timestamptz, ip_at_request inet, ua_at_request text, created_at timestamptz)`
  - `magic_link_request_log(email_or_ip_hash text, bucket_window timestamptz, count integer default 1, primary key(email_or_ip_hash, bucket_window))`
  - `app_settings(key text primary key, value jsonb not null)` — seed `('require_invite_for_signup', 'false'::jsonb)`

  **Backfill strategy:** Insert a `users` row for every existing `sessions` row that has a non-null `code_id`. Since the current sessions table only stores `code_id` (not user email), and there's no users table yet, the backfill is effectively a no-op for existing sessions — they will expire naturally and users will re-authenticate via magic link. Document this decision in the migration comment.

- [ ] **Step 2.2: Update `src/lib/db/schema.ts`** (if Drizzle schema is used for TypeScript types) to add the new table definitions for type-safe query results.

---

## Task 3: Session helpers (`src/lib/session.ts`)

**Files:** `src/lib/session.ts`, `src/__tests__/auth/session.test.ts`

The spec notes `session.ts` did not exist. SP-2 creates it from scratch using `jose` (already installed).

- [ ] **Step 3.1: TDD — write `session.test.ts` first:**
  - `createSession(userId)` returns a signed JWT
  - `getSession(req)` with a valid cookie returns `{ userId }`
  - `getSession(req)` with a missing/expired/tampered cookie returns `null`
  - `clearSession()` returns a `Set-Cookie` header that expires the cookie

- [ ] **Step 3.2: Implement `src/lib/session.ts`:**
  - `SESSION_SECRET` env var check — throws if missing
  - `createSession(userId: string): Promise<{ cookie: string, userId: string }>` — signs a JWT with `jose` SignJWT, sets `fillip-session` cookie (Secure, HttpOnly, SameSite=Lax, Path=/, 7-day TTL)
  - `getSession(req: NextRequest): Promise<{ userId: string } | null>` — reads the `fillip-session` cookie, verifies with `jose` jwtVerify
  - `clearSession(): string` — returns a `Set-Cookie` string that expires the `fillip-session` cookie
  - Cookie name: `fillip-session`
  - JWT TTL: 7 days (consistent with migration 0003's `sessions.expires_at` 7-day pattern)

- [ ] **Step 3.3: Run tests** — session tests green

---

## Task 4: Auth provider abstraction + FakeProvider

**Files:** `src/lib/auth/providers/types.ts`, `src/lib/auth/providers/fake.ts`, `src/lib/auth/providers/index.ts`

- [ ] **Step 4.1: Create `types.ts`** with:
  - `AuthProviderId = 'magic-link' | 'google' | 'apple'`
  - `AuthProvider` interface (as spec §3.2)
  - `ResolvedIdentity` interface (as spec §3.2)
  - `ProviderCallbackInput` union type

- [ ] **Step 4.2: Create `fake.ts`** — `FakeProvider` that accepts canned identity at construction, returns it from `resolveIdentity`. Used in all integration tests.

- [ ] **Step 4.3: Create `index.ts`** — provider registry and `getProvider(id)` factory. Initially returns `FakeProvider` in test env.

---

## Task 5: Token utilities (`src/lib/auth/tokens.ts`)

**Files:** `src/lib/auth/tokens.ts`, `src/__tests__/auth/tokens.test.ts`

- [ ] **Step 5.1: TDD — write `tokens.test.ts` first:**
  - `generateToken()` returns a string ≥32 chars (base64url of 32 random bytes)
  - `hashToken(token)` is deterministic (same input → same output)
  - `hashToken` uses SHA-256 (Node.js `crypto.createHash('sha256')`)
  - Two different tokens produce different hashes
  - `storeToken(email, ip, ua)` returns a token and inserts a DB row — **skip DB call in unit test; mock the DB**
  - `redeemToken(token)` returns the email — test happy path + expired + consumed

- [ ] **Step 5.2: Implement `tokens.ts`:**
  - `generateToken(): string` — `crypto.randomBytes(32).toString('base64url')`
  - `hashToken(token: string): string` — SHA-256 hex
  - `storeToken(email, ip?, ua?): Promise<string>` — generates token, hashes it, inserts `magic_link_tokens` row, returns raw token
  - `redeemToken(tokenRaw: string): Promise<{ email: string } | { error: 'not_found' | 'expired' | 'consumed' }>` — hashes incoming token, runs SELECT FOR UPDATE + UPDATE consumed_at atomically

- [ ] **Step 5.3: Run tests** — tokens tests green

---

## Task 6: Magic-link provider + email template

**Files:** `src/lib/auth/providers/magic-link.ts`, `src/lib/auth/email/magic-link.ts`, `src/__tests__/auth/magic-link-provider.test.ts`

- [ ] **Step 6.1: Create email template `src/lib/auth/email/magic-link.ts`:**
  - Contract: `renderMagicLinkEmail(opts: { email, magicLinkUrl, ttlMinutes, appName, supportEmail }): { subject, text, html }`
  - subject: "Your Fillip sign-in link"
  - text: plain-text fallback
  - html: simple inline-styled HTML — single CTA button + URL + ignore line

- [ ] **Step 6.2: Create `magic-link.ts` provider:**
  - `resolveIdentity` — calls `redeemToken(token)`, returns `ResolvedIdentity` on success, throws on error
  - `providerSubject` = `hashToken(email)` (deterministic, email is the stable ID)
  - `emailVerified: true` (magic-link arrival proves email access)

- [ ] **Step 6.3: TDD `magic-link-provider.test.ts`:**
  - Token not found → throws
  - Token expired → throws
  - Token consumed → throws
  - Valid token → `ResolvedIdentity` with correct fields

- [ ] **Step 6.4: Run tests** green

---

## Task 7: Account linking + cohort gating

**Files:** `src/lib/auth/linking.ts`, `src/lib/auth/cohort.ts`, `src/__tests__/auth/linking.test.ts`, `src/__tests__/auth/cohort.test.ts`

- [ ] **Step 7.1: TDD `linking.test.ts`** — each row of §7 matrix:
  - `(provider, providerSubject)` row exists → returns existing user id
  - No identity, matching email + emailVerified=true → auto-links, returns user id
  - No identity, no matching email, signup allowed → creates user + identity, returns new id
  - `emailVerified=false` → does NOT auto-link, creates separate user
  - Magic-link (no oauth_identities row) → creates user if new

- [ ] **Step 7.2: Implement `linking.ts`:**
  - `findOrCreateUser(identity: ResolvedIdentity): Promise<{ userId: string; isNew: boolean }>` 
  - Queries `oauth_identities` by provider+subject (for OAuth providers)
  - Falls back to `users` email match with `email_verified=true` filter
  - Creates user and/or identity row as needed
  - All in a single DB transaction

- [ ] **Step 7.3: TDD `cohort.test.ts`:**
  - Gate off → always allows
  - Gate on, existing user → allows
  - Gate on, new user, valid invite → allows + marks code consumed
  - Gate on, new user, invalid invite → throws `invite_required`
  - Gate on, new user, no invite → throws `invite_required`

- [ ] **Step 7.4: Implement `cohort.ts`:**
  - `assertAllowed(userId: string, isNew: boolean, inviteCode?: string): Promise<void>`
  - Reads `app_settings` row for `require_invite_for_signup`
  - If gate off or user is not new: return
  - If gate on and new: validate invite code (active, not consumed) → update `last_used_at` + consume, or throw

- [ ] **Step 7.5: Run tests** green

---

## Task 8: Magic-link API routes

**Files:** `src/app/api/auth/magic-link/request/route.ts`, `src/app/api/auth/magic-link/callback/route.ts`, `src/__tests__/auth/magic-link-route.test.ts`

- [ ] **Step 8.1: Create `request/route.ts` — POST:**
  - Zod-validate body `{ email: string }`
  - Normalise email (lowercase, trim)
  - Origin header check (must match APP_PUBLIC_URL host)
  - Rate limit check (per-email hash: 5/hr; per-IP hash: 20/hr) via `magic_link_request_log`
  - `storeToken(email, ip, ua)` → raw token
  - Build magic-link URL: `${APP_PUBLIC_URL}/api/auth/magic-link/callback?token=${rawToken}`
  - Add `next` query param if provided (validated same-origin path)
  - Send email via `getEmailSender().send(...)` with `renderMagicLinkEmail(...)`
  - **Always** return `{ ok: true }` (200), even on send failure
  - Log send failures internally

- [ ] **Step 8.2: Create `callback/route.ts` — GET:**
  - Extract `token` query param; return 400 if missing
  - `redeemToken(token)` — on error redirect to `/login?error=invalid_link`
  - `findOrCreateUser({ providerId: 'magic-link', providerSubject: hashToken(email), email, emailVerified: true })` 
  - `assertAllowed(userId, isNew, inviteCode from query)` — on failure redirect to `/login?error=invite_required`
  - `createSession(userId)` — set `Set-Cookie` header
  - Update `users.last_login_at`
  - Validate `next` param (§9.4 rules), redirect to it or `/dashboard`

- [ ] **Step 8.3: TDD `magic-link-route.test.ts`** — integration test using `FakeProvider` + `MemoryEmailSender`:
  - POST request → email captured → GET callback → session cookie set → redirect to /dashboard
  - Invalid token → redirect to /login?error=invalid_link
  - Rate limit exceeded → 429
  - Origin mismatch → 403
  - Open-redirect `?next=//evil.com` → redirect to /dashboard
  - Valid same-origin `?next=/dashboard/trip` → redirect to /dashboard/trip

- [ ] **Step 8.4: Run tests** green

---

## Task 9: Google OAuth provider

**Files:** `src/lib/auth/providers/google.ts`, `src/__tests__/auth/google-provider.test.ts`

Note: SP-2 implements the provider but uses env vars for client credentials. The PKCE/state generation is shared between Google and Apple.

- [ ] **Step 9.1: Create `src/lib/auth/pkce.ts`** — shared PKCE helpers:
  - `generateState(): string` — 32 random bytes base64url
  - `generateCodeVerifier(): string` — 32 random bytes base64url
  - `deriveCodeChallenge(verifier: string): string` — base64url(SHA-256(verifier))

- [ ] **Step 9.2: Create `google.ts`:**
  - `buildAuthorizeUrl(opts)` — builds Google authorize URL with PKCE, state, nonce
    - Scopes: `openid email profile`
    - Redirect URI from opts
    - Reads `GOOGLE_CLIENT_ID`
  - `resolveIdentity(input)` — exchanges `code` for tokens using PKCE verifier
    - Validates ID token: iss=`https://accounts.google.com`, aud=clientId, exp, nonce
    - Uses `jose` for JWT verification against Google JWKS (JWKS URL from discovery doc cached in memory)
    - Returns `ResolvedIdentity`

- [ ] **Step 9.3: TDD `google-provider.test.ts`:**
  - Bad ID token signature → throws
  - Wrong `aud` → throws
  - Wrong `iss` → throws
  - Expired token → throws
  - Nonce mismatch → throws
  - Valid token → returns correct `ResolvedIdentity`
  - (Use MSW to mock Google's token endpoint + JWKS)

- [ ] **Step 9.4: Run tests** green

---

## Task 10: Apple Sign In provider

**Files:** `src/lib/auth/providers/apple.ts`, `src/__tests__/auth/apple-provider.test.ts`

Apple's form_post callback is the most unusual part. The callback route handles POST (not GET).

- [ ] **Step 10.1: Create `apple.ts`:**
  - `generateClientSecretJwt()` — signs a short-lived JWT (1 hour) with ES256 using the .p8 key from `APPLE_PRIVATE_KEY_P8` env var (PEM-encoded, multi-line). Claims: `iss=APPLE_TEAM_ID`, `sub=APPLE_CLIENT_ID`, `aud=https://appleid.apple.com`, `iat`, `exp`. Uses `jose` `SignJWT`.
  - `buildAuthorizeUrl(opts)` — builds Apple authorize URL. Scope: `name email`. `response_mode=form_post`. Redirect URI from opts.
  - `resolveIdentity(input)` — input includes form-body fields (`code`, `id_token`, `user` JSON). Exchanges `code` for tokens using generated client secret JWT + PKCE. Validates Apple ID token against Apple JWKS. Extracts name from first-signin `user` field.
  - Apple JWKS URL: `https://appleid.apple.com/auth/keys`
  - ID token validation: iss=`https://appleid.apple.com`, aud=servicesId, exp.

- [ ] **Step 10.2: TDD `apple-provider.test.ts`:**
  - Missing `APPLE_PRIVATE_KEY_P8` env → throws with clear message
  - `generateClientSecretJwt()` produces a valid ES256 JWT with correct claims
  - Name parsed from `user` JSON on first sign-in, stored in `displayName`
  - Subsequent sign-in (no `user` field) → `displayName` is undefined
  - Relay email (`@privaterelay.appleid.com`) → treated as normal email
  - (Use MSW to mock Apple's token endpoint + JWKS)

- [ ] **Step 10.3: Run tests** green

---

## Task 11: OAuth start + callback routes

**Files:** `src/app/api/auth/oauth/[provider]/start/route.ts`, `src/app/api/auth/oauth/[provider]/callback/route.ts`, `src/__tests__/auth/oauth-route.test.ts`

- [ ] **Step 11.1: Create `start/route.ts` — GET:**
  - Extract `provider` from params; validate it's 'google' | 'apple'
  - Generate `state` + `codeVerifier` + `nonce` using PKCE helpers
  - Store in `__Host-fillip_oauth_state`, `__Host-fillip_oauth_pkce`, `__Host-fillip_oauth_nonce` cookies (Secure, HttpOnly, SameSite=Lax, Path=/, 10-min TTL)
  - Call `provider.buildAuthorizeUrl(...)` and 302 redirect

- [ ] **Step 11.2: Create `callback/route.ts` — GET (Google) / POST (Apple):**
  - Accept both GET and POST methods (Next.js route handlers support `export async function GET` + `export async function POST`)
  - Validate `state` against cookie; clear state/PKCE/nonce cookies immediately (replay protection)
  - On state mismatch → redirect to `/login?error=oauth_failed`
  - Call `provider.resolveIdentity(input)` — on throw → redirect to `/login?error=oauth_failed`
  - `findOrCreateUser(identity)` + `assertAllowed(...)`
  - For Apple name on first sign-in: update `users.display_name` if currently null
  - `createSession(userId)` → set cookie → redirect to `/dashboard` (or pending-signup flow if cohort-gated + new user)
  - `next` parameter open-redirect validation

- [ ] **Step 11.3: TDD `oauth-route.test.ts`:**
  - Google flow: start → state cookie set → callback with valid state → session + redirect
  - State mismatch → redirect to /login?error=oauth_failed
  - Provider throws → redirect to /login?error=oauth_failed
  - Apple callback: POST form body, name captured on first sign-in
  - Email auto-link: existing user found by email → identity linked, logged in
  - Open-redirect blocked

- [ ] **Step 11.4: Run tests** green

---

## Task 12: Logout + Me routes

**Files:** `src/app/api/auth/logout/route.ts`, `src/app/api/auth/me/route.ts`

- [ ] **Step 12.1: `logout/route.ts` — POST:**
  - `clearSession()` → set expired cookie header
  - 200 with `{ ok: true }`

- [ ] **Step 12.2: `me/route.ts` — GET:**
  - `getSession(req)` — return 401 if null
  - Query `users` by `userId`; return `{ id, email, displayName, isAdmin }`

---

## Task 13: Middleware session gate

**Files:** `src/middleware.ts`

- [ ] **Step 13.1: Extend middleware** to gate `/dashboard` routes:
  - Skip auth API routes (`/api/auth/**`) — they handle their own auth state
  - For `/dashboard/**` paths: call `getSession(request)`. If null → redirect to `/login?next=${pathname}`
  - Keep existing rate-limit + security-headers logic
  - Note: `getSession` uses `jose` which is edge-compatible

---

## Task 14: Login page

**Files:** `src/app/login/page.tsx`

- [ ] **Step 14.1: Create login page:**
  - Server component with client magic-link form
  - Layout: "Continue with Google" button → `/api/auth/oauth/google/start`
  - "Continue with Apple" button → `/api/auth/oauth/apple/start`
  - Divider
  - Email input + "Send sign-in link" button → POST `/api/auth/magic-link/request`
  - Optional invite code field (shown when query param `step=invite` or `?cohort_gate=true` based on app settings)
  - Error display from `?error=` query param
  - "Check your email" state after successful submission
  - SP-3 polishes the visual design; SP-2 ships a functional but plain version

---

## Task 15: Admin invite-cohort page

**Files:** `src/app/dashboard/admin/invites/page.tsx`

- [ ] **Step 15.1: Create admin page:**
  - Protected: check `users.is_admin` from session; 404 if not admin
  - Toggle for `require_invite_for_signup` app setting
  - List of invite codes with active/used status
  - "Create invite code" form

---

## Task 16: Environment variables + Docker

**Files:** `.env.example`, `docker-compose.yml`

- [ ] **Step 16.1: Update `.env.example`** with new vars:
  - `RESEND_API_KEY=re_...` 
  - `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
  - `GOOGLE_CLIENT_SECRET=GOCSPX-...`
  - `APPLE_TEAM_ID=XXXXXXXXXX`
  - `APPLE_CLIENT_ID=com.fillip.web`
  - `APPLE_KEY_ID=XXXXXXXXXX`
  - `APPLE_PRIVATE_KEY_P8=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----`
  - `AUTH_V2_ENABLED=true`
  - `MAGIC_LINK_TTL_MINUTES=15`

- [ ] **Step 16.2: Update `docker-compose.yml`** app environment block with all new vars.

- [ ] **Step 16.3: Add rate limit config** for `/api/auth/magic-link/request` to `src/lib/security/rate-limit.ts`.

---

## Task 17: Final verification

- [ ] **Step 17.1:** `npm run test:run` — all new SP-2 tests green; pre-existing DB failures remain at baseline (≤4)

- [ ] **Step 17.2:** `npm run build` — clean build

- [ ] **Step 17.3:** `npm run lint` — no new errors above SP-0 baseline of 38

- [ ] **Step 17.4: Spec compliance walk-through** — compare against SP-2 spec section by section

---

## Security checklist

- [ ] Magic-link tokens: only SHA-256 hash stored in DB ✓
- [ ] Magic-link: always returns `{ ok: true }` (enumeration defence) ✓
- [ ] OAuth state: `__Host-` prefixed cookies, cleared on first callback use ✓
- [ ] Open-redirect: `?next=` validated (must start with `/`, not `//`, no `:`) ✓
- [ ] CSRF on POST magic-link request: Origin header check ✓
- [ ] Session cookie: Secure, HttpOnly, SameSite=Lax ✓
- [ ] Apple .p8 key: env var only, never committed ✓
- [ ] Raw magic-link tokens: never logged ✓

---

## Open decisions preserved from spec §13

| # | Status | Decision |
|---|---|---|
| Q3 | Open | Apple .p8 key management in production (env var vs. secrets store). SP-2 implements env var; deployment docs note the rotation requirement. |
| Q6 | Confirmed | Cohort gate default: **off** (row seeded as `false` in migration 0013). |
| All others | Resolved | Per spec §0 amendments. |

---

## Spec deviations / adaptations

1. **Existing `sessions` table preserved**: The current `sessions` table (migration 0003) stores `code_id` references. SP-2's JWT sessions don't use this table — they're stateless JWTs. The table is kept for backward compatibility; existing sessions expire naturally. SP-2 adds the `users` table alongside it.

2. **`hashIp` in middleware vs. auth routes**: The middleware's `hashIp` is a simple non-cryptographic hash (edge-runtime compatible). The magic-link rate limiter uses the same function for consistency (imported from middleware utils or duplicated in tokens.ts since middleware is not importable from app code).

3. **`rawClaims` not persisted**: Per spec §3.2 — `rawClaims` on `ResolvedIdentity` are for debugging only and are not stored anywhere.

4. **No `AUTH_V2_ENABLED` flag removal task**: The spec (§14.8) mentions removing the flag after one stable week. This is intentional post-launch cleanup, not part of SP-2's implementation scope.
