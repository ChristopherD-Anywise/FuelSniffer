---
phase: 1
slug: data-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (Wave 0 installs) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DATA-01 | integration | `npx vitest run src/__tests__/api-client.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DATA-04 | unit | `npx vitest run src/__tests__/normaliser.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | DATA-02 | integration | `npx vitest run src/__tests__/scraper.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | DATA-03 | unit | `npx vitest run src/__tests__/health.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | DATA-05 | integration | `docker exec fuelsniffer-db psql -U fuelsniffer -c "SELECT * FROM timescaledb_information.continuous_aggregates"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `@vitest/coverage-v8` — install test framework
- [ ] `vitest.config.ts` — configure test runner
- [ ] `src/__tests__/api-client.test.ts` — stubs for DATA-01 (API auth and fetch)
- [ ] `src/__tests__/normaliser.test.ts` — stubs for DATA-04 (price encoding, timezone)
- [ ] `src/__tests__/scraper.test.ts` — stubs for DATA-02 (scrape cycle, retry logic)
- [ ] `src/__tests__/health.test.ts` — stubs for DATA-03 (health endpoint)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QLD API live auth | DATA-01 | Requires real API token | Register at fuelpricesqld.com.au, get token, run `curl -H "Authorization: FPDAPI SubscriberToken=TOKEN" https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices` |
| TimescaleDB cagg materialises | DATA-05 | Requires running DB with data | Insert test rows, wait for cagg refresh, query hourly view |
| healthchecks.io ping | DATA-03 | Requires external service | Create check at healthchecks.io, verify ping arrives |
| Cloudflare Tunnel access | Infra | Requires tunnel setup | Access dashboard via tunnel URL from external network |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
