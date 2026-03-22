---
status: partial
phase: 01-data-pipeline
source: [01-VERIFICATION.md]
started: 2026-03-23
updated: 2026-03-23
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live database migration applies correctly
expected: All 3 migrations apply without error; price_readings is a hypertable; hourly_prices continuous aggregate exists; 7-day retention policy active
result: [pending]

### 2. Live scrape cycle end-to-end
expected: scrape_health shows error = null, prices_upserted > 0; price_readings rows have price_cents in 100-250 range (not raw integers)
result: [pending]

### 3. GET /api/health live response
expected: Returns {"status":"ok","last_scrape_at":"...","minutes_ago":0,"prices_last_run":N} with HTTP 200
result: [pending]

### 4. Dead-man's-switch behaviour
expected: healthchecks.io fires alert after grace period when scraper goes silent; pings arrive on success
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
