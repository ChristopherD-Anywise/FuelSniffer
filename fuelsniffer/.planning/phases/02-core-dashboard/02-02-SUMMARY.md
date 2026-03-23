---
phase: 02-core-dashboard
plan: 02
subsystem: auth
tags: [jose, jwt, session, invite-codes, cookies, next-app-router, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-core-dashboard
    plan: 01
    provides: inviteCodes and sessions Drizzle schema tables

provides:
  - session.ts: encrypt, decrypt, createSession, deleteSession functions using jose 6.x
  - POST /api/auth/login: validates invite code against DB, sets HttpOnly JWT session cookie
  - POST /api/auth/logout: deletes session cookie

affects: [02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added:
    - jose@^6.2.2 (JWT signing/verification via SignJWT + jwtVerify)
  patterns:
    - "TDD: RED commit then GREEN commit per task"
    - "vi.mock with importOriginal to expose real encrypt/decrypt while mocking createSession/deleteSession"
    - "server-only import in session.ts guards server boundary"
    - "await cookies() pattern for Next.js 16 async cookies API"
    - "Zod safeParse for request body validation in route handlers"

key-files:
  created:
    - fuelsniffer/src/lib/session.ts
    - fuelsniffer/src/app/api/auth/login/route.ts
    - fuelsniffer/src/app/api/auth/logout/route.ts
  modified:
    - fuelsniffer/src/__tests__/auth.test.ts

key-decisions:
  - "importOriginal in vi.mock('@/lib/session') allows real encrypt/decrypt to be tested while createSession/deleteSession are mocked for route handler tests"
  - "randomUUID() used as userId in session payload — invite code ID is not a user identity"
  - "lastUsedAt updated on each successful login (audit trail for invite code usage)"

requirements-completed: [ACCS-01]

# Metrics
duration: 9min
completed: 2026-03-23
---

# Phase 02 Plan 02: Session Management + Auth Routes Summary

**JWT-based session library (jose 6.x) with HttpOnly cookie management, plus POST /api/auth/login and POST /api/auth/logout route handlers validating invite codes against the DB**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-23T03:47:17Z
- **Completed:** 2026-03-23T03:56:15Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Installed jose 6.x and implemented `session.ts` with `encrypt`, `decrypt`, `createSession`, `deleteSession`
- `server-only` import enforces server boundary; `await cookies()` uses Next.js 16 async cookies API
- Created POST /api/auth/login: validates invite code via DB query, returns exact error copy for invalid/inactive codes, calls `createSession(randomUUID())` on success, updates `lastUsedAt`
- Created POST /api/auth/logout: calls `deleteSession()` and returns 200
- 7 tests passing: 3 encrypt/decrypt unit tests + 3 login scenario tests + 1 logout test
- No regressions: all 56 Phase 1 + Phase 2 tests green

## Task Commits

Each task was committed atomically using TDD (RED then GREEN):

1. **Task 1 RED: Add failing tests for encrypt/decrypt session** - `28a429d` (test)
2. **Task 1 GREEN: Implement session.ts** - `de94a9c` (feat)
3. **Task 2 RED: Add failing tests for login and logout route handlers** - `99a307a` (test)
4. **Task 2 GREEN: Implement auth routes** - `34b84fd` (feat)

## Files Created/Modified

- `fuelsniffer/src/lib/session.ts` — JWT encrypt/decrypt + HttpOnly cookie helpers (jose 6.x)
- `fuelsniffer/src/app/api/auth/login/route.ts` — POST handler: validate invite code, create session
- `fuelsniffer/src/app/api/auth/logout/route.ts` — POST handler: delete session cookie
- `fuelsniffer/src/__tests__/auth.test.ts` — 7 real tests replacing 3 of the 5 it.todo stubs (validateInviteCode stubs remain as todos)

## Decisions Made

- **importOriginal in session mock:** `vi.mock('@/lib/session', async (importOriginal) => ...)` spreads real module and overrides only `createSession`/`deleteSession`. This lets the encrypt/decrypt tests call the real jose implementation while route handler tests get mocked session functions without hitting Next.js cookie internals.
- **randomUUID() as userId:** The session payload carries a freshly generated UUID per login, not the invite code ID. Invite code ID is a DB integer not a user identity.
- **lastUsedAt tracking:** `db.update(inviteCodes).set({ lastUsedAt: new Date() })` on each successful login provides an audit trail for when each code was last used.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock('@/lib/session') without importOriginal blocked real encrypt/decrypt tests**
- **Found during:** Task 2 GREEN run (when route tests were added alongside encrypt/decrypt tests)
- **Issue:** A plain `vi.mock('@/lib/session', () => ({ createSession: vi.fn(), deleteSession: vi.fn() }))` does not expose `encrypt` and `decrypt`. The dynamic `import('@/lib/session')` in the encrypt/decrypt tests got the mock object, which threw "No decrypt export defined on mock".
- **Fix:** Changed the mock to use `importOriginal` pattern — spreads the real module and only overrides `createSession`/`deleteSession`. This is the recommended vitest pattern for partial module mocking.
- **Files modified:** `fuelsniffer/src/__tests__/auth.test.ts`
- **Commit:** `34b84fd`

None others — plan executed as written.

## Known Stubs

The `validateInviteCode()` describe block retains 3 `it.todo()` stubs from the Wave 0 scaffolding. These are intentional — the validation logic is now inline in the route handler (`login/route.ts`) rather than extracted to a separate function. The todos serve as reminders that a dedicated `validateInviteCode()` function could be extracted for reuse. They do not block this plan's goal.

## Next Phase Readiness

- `session.ts` exports are available for proxy.ts (Plan 04) to call `decrypt` for request auth checking
- Login/logout routes are ready for the login page UI (Plan 04)
- All prior Phase 1 and Phase 2 Plan 01 tests remain green (56 total)

## Self-Check: PASSED

All files verified present on disk. All commits verified in git log.

- FOUND: fuelsniffer/src/lib/session.ts
- FOUND: fuelsniffer/src/app/api/auth/login/route.ts
- FOUND: fuelsniffer/src/app/api/auth/logout/route.ts
- FOUND: fuelsniffer/src/__tests__/auth.test.ts (modified)
- FOUND commit: 28a429d (RED tests task 1)
- FOUND commit: de94a9c (GREEN session.ts)
- FOUND commit: 99a307a (RED tests task 2)
- FOUND commit: 34b84fd (GREEN auth routes)

---
*Phase: 02-core-dashboard*
*Completed: 2026-03-23*
