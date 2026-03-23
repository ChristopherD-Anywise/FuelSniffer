---
phase: 02-core-dashboard
plan: 04
subsystem: auth
tags: [nextjs, proxy, route-guard, jwt, tailwind, react]

# Dependency graph
requires:
  - phase: 02-02
    provides: "JWT session management with encrypt/decrypt via jose library"

provides:
  - "proxy.ts route guard blocking unauthenticated access to /dashboard"
  - "Login page with invite code form (320px card, 44px touch targets)"
  - "Root page redirect from / to /dashboard"

affects: [02-05, 02-06, 02-07, 02-08, ui, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component wraps Client Component to enable metadata + interactivity split"
    - "proxy.ts (not middleware.ts) for Next.js 16 route protection"
    - "req.cookies.get() from NextRequest for reading cookies in proxy context (not await cookies())"

key-files:
  created:
    - fuelsniffer/src/proxy.ts
    - fuelsniffer/src/app/login/page.tsx
    - fuelsniffer/src/app/login/LoginForm.tsx
  modified:
    - fuelsniffer/src/app/page.tsx

key-decisions:
  - "Server Component (page.tsx) wraps Client Component (LoginForm.tsx) to export metadata from a page with client-side form state"
  - "proxy.ts uses req.cookies.get() directly from NextRequest — not await cookies() from next/headers, which is server-only"

patterns-established:
  - "Login flow: fetch POST /api/auth/login → redirect to /dashboard on ok, show inline error on non-ok"
  - "Route guard pattern: proxy.ts imports decrypt from @/lib/session, reads session cookie from NextRequest"

requirements-completed: [ACCS-01]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 02 Plan 04: Route Guard and Login Page Summary

**Next.js 16 proxy.ts route guard blocking /dashboard, invite-code login page with inline error handling, and root redirect — gating all subsequent UI work**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-23T04:01:00Z
- **Completed:** 2026-03-23T04:01:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `fuelsniffer/src/proxy.ts` with Next.js 16 naming convention (`proxy` not `middleware`), guarding `/dashboard` routes and redirecting authenticated users away from public routes
- Created login page as Server Component + Client Component split: `page.tsx` exports metadata, `LoginForm.tsx` manages form state and fetch
- Updated root `page.tsx` to redirect to `/dashboard` (proxy then handles auth gate)

## Task Commits

1. **Task 1: Create proxy.ts route guard** - `703e9ca` (feat)
2. **Task 2: Create login page with invite code form** - `891ae6a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `fuelsniffer/src/proxy.ts` - Next.js 16 route guard; protects `/dashboard`, redirects authenticated users from public routes
- `fuelsniffer/src/app/login/page.tsx` - Server Component; exports page metadata title, renders `<LoginForm />`
- `fuelsniffer/src/app/login/LoginForm.tsx` - Client Component; invite code input, fetch to `/api/auth/login`, inline error display, redirect on success
- `fuelsniffer/src/app/page.tsx` - Root page; replaced Next.js boilerplate with `redirect('/dashboard')`

## Decisions Made

- **Server + Client Component split for login page:** `metadata` export cannot be used in a `'use client'` component. The pattern is a Server Component wrapper (`page.tsx`) that exports metadata, with a dedicated Client Component (`LoginForm.tsx`) for form state and fetch. This is the canonical Next.js 16 App Router pattern.
- **`req.cookies.get()` in proxy, not `await cookies()`:** In `proxy.ts`, cookies are read directly from the `NextRequest` object (`req.cookies.get('session')?.value`). The `cookies()` function from `next/headers` is server-only and cannot be used in the proxy/edge context. The `decrypt` function from `session.ts` accepts a `string | undefined` so this works cleanly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Auth gate is in place. All routes under `/dashboard` are protected.
- Login page accepts invite codes and posts to `/api/auth/login` (implemented in plan 02-02).
- Ready for plan 02-05: dashboard page implementation.

---
*Phase: 02-core-dashboard*
*Completed: 2026-03-23*

## Self-Check: PASSED

- FOUND: fuelsniffer/src/proxy.ts
- FOUND: fuelsniffer/src/app/login/page.tsx
- FOUND: fuelsniffer/src/app/login/LoginForm.tsx
- FOUND: commit 703e9ca (Task 1)
- FOUND: commit 891ae6a (Task 2)
