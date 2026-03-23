---
phase: 2
slug: core-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing from Phase 1) |
| **Config file** | fuelsniffer/vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | DASH-01 | unit | `npx vitest run src/__tests__/prices-api.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | DASH-01, DASH-02, DASH-03 | unit | `npx vitest run src/__tests__/dashboard.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | DASH-04 | unit | `npx vitest run src/__tests__/map.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ACCS-01 | unit | `npx vitest run src/__tests__/auth.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/prices-api.test.ts` — stubs for DASH-01 (API route returns sorted prices)
- [ ] `src/__tests__/dashboard.test.ts` — stubs for DASH-01/02/03 (filter logic, sort, freshness)
- [ ] `src/__tests__/map.test.ts` — stubs for DASH-04 (map pin data generation)
- [ ] `src/__tests__/auth.test.ts` — stubs for ACCS-01 (invite code validation, session)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Split view responsive layout | DASH-05 | Requires visual inspection at mobile breakpoint | Open in Chrome DevTools at 375px width, verify list/map toggle works |
| Map pin rendering | DASH-04 | Leaflet renders in canvas/SVG, not testable via DOM | Open dashboard, verify pins show prices with colour coding |
| Sticky filter bar scrolling | DASH-02/03 | Scroll interaction not testable in vitest | Scroll price list, verify filter bar stays fixed at top |
| Cloudflare Tunnel access | Infra | Requires tunnel + external network | Access dashboard URL from a phone not on local network |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
