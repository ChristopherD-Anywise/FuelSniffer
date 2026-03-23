---
phase: 02-core-dashboard
plan: "08"
subsystem: admin-api-external-access
tags: [admin, invite-codes, cloudflare-tunnel, external-access]
dependency_graph:
  requires: [02-02, 02-04, 02-07]
  provides: [admin-invite-codes-api, cloudflare-tunnel]
  affects: [docker-compose, access-control]
tech_stack:
  added: [cloudflare/cloudflared]
  patterns: [soft-delete, session-auth-gate, ephemeral-tunnel]
key_files:
  created:
    - fuelsniffer/src/app/api/admin/invite-codes/route.ts
  modified:
    - fuelsniffer/docker-compose.yml
decisions:
  - "Cloudflare ephemeral tunnel (trycloudflare.com) used for Phase 2 — no account needed, URL changes on restart; documented persistent named tunnel upgrade path in compose comments"
  - "Admin routes protected by same session cookie as dashboard — no separate admin token in Phase 2; sufficient for owner-only access"
metrics:
  duration: 4m
  completed: "2026-03-23"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 2 Plan 8: Admin Invite Codes API and Cloudflare Tunnel Summary

**One-liner:** Owner-only invite code CRUD API (GET/POST/DELETE with soft-revoke) plus cloudflared ephemeral tunnel for external mobile access.

---

## Tasks Completed

### Task 1: Create admin invite-codes API route

Created `fuelsniffer/src/app/api/admin/invite-codes/route.ts` with:
- `GET /api/admin/invite-codes` — returns all invite codes ordered by `createdAt`
- `POST /api/admin/invite-codes` — creates a new 8-char hex code via `crypto.randomBytes(4).toString('hex')`, optional `label` field
- `DELETE /api/admin/invite-codes?id=N` — soft-revokes by setting `isActive: false` (non-destructive, per D-13)
- `requireSession()` helper checks session cookie in all three handlers; returns 401 for missing/invalid sessions
- Zod validation for POST body and DELETE query param

**Commit:** `dfc4bbb`

### Task 2: Add Cloudflare Tunnel to docker-compose.yml

Added `cloudflared` service to `fuelsniffer/docker-compose.yml`:
- Uses `cloudflare/cloudflared:latest` image
- `command: tunnel --no-autoupdate --url http://app:3000` for ephemeral trycloudflare.com URL
- `depends_on: app` to start after the Next.js service
- No Cloudflare account or token required for ephemeral URL; upgrade path documented in comments
- YAML validates cleanly via `docker compose config`

**Commit:** `cd70a0a`

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Cloudflare ephemeral tunnel for Phase 2 | No Cloudflare account needed; URL printed to container logs; documented CLOUDFLARE_TUNNEL_TOKEN upgrade path for production |
| Session cookie as admin auth | Phase 2 is owner-only tooling; same session cookie is sufficient; no separate admin token scope needed until Phase 3+ |

---

## Verification

- TypeScript: `npx tsc --noEmit` exits 0 (clean)
- Test suite: 65 tests passing, 3 todos, 0 failures
- YAML: `docker compose config` exits 0

---

## Checkpoint Pending

Plan execution paused at `checkpoint:human-verify`. The owner must verify the full Phase 2 dashboard end-to-end:
1. Start stack and run migrations
2. Create a test invite code
3. Login flow and dashboard functionality
4. Cloudflare Tunnel external access from a phone not on the local network

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — the admin API is fully wired to the `inviteCodes` table via Drizzle ORM.

---

## Self-Check: PASSED

- `/Users/chrisdennis/Documents/GitHub/FuelSniffer/fuelsniffer/src/app/api/admin/invite-codes/route.ts` — FOUND
- `/Users/chrisdennis/Documents/GitHub/FuelSniffer/fuelsniffer/docker-compose.yml` (cloudflared service) — FOUND
- Commit `dfc4bbb` — FOUND
- Commit `cd70a0a` — FOUND
