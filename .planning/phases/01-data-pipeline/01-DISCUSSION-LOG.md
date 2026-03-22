# Phase 1: Data Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 01-data-pipeline
**Areas discussed:** Deployment setup, Data storage, Scraper behavior

---

## Deployment Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose | TimescaleDB + Next.js app in containers. Easy to start/stop, portable, reproducible. | ✓ |
| Bare metal + systemd | Install Postgres/TimescaleDB directly, run Node via PM2 or systemd services. | |
| You decide | Claude picks the best approach for self-hosting | |

**User's choice:** Docker Compose
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Synology NAS | Docker support via Container Manager | |
| Raspberry Pi | ARM-based, limited resources | |
| Home server/PC | x86 Linux machine or old desktop | ✓ |

**User's choice:** Home server/PC
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Caddy reverse proxy | Auto-HTTPS with Let's Encrypt, zero config TLS. Needs a domain name. | |
| Nginx + certbot | Manual cert setup, more control | |
| Cloudflare Tunnel | Expose local service via Cloudflare, no port forwarding needed | ✓ |
| You decide | Claude picks what's simplest | |

**User's choice:** Cloudflare Tunnel
**Notes:** None

---

## Data Storage

| Option | Description | Selected |
|--------|-------------|----------|
| 2 days | Today + yesterday at full granularity, then hourly | |
| 7 days | Full week of 15-min data, then hourly | ✓ |
| You decide | Claude picks based on storage trade-offs | |

**User's choice:** 7 days raw retention
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Soft delete | Mark as inactive, keep history, hide from current view | ✓ |
| Keep everything | Never remove, just stop showing if no recent prices | |
| You decide | Claude handles this | |

**User's choice:** Soft delete
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| All QLD stations | Store everything, filter at query time | |
| North Brisbane only | Only store stations within ~50km | ✓ |
| You decide | Claude picks the best approach | |

**User's choice:** North Brisbane only (~50km radius)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| All fuel types | Store everything the API provides, filter in the UI | ✓ |
| Selected only | Only store ULP91, ULP95, ULP98, Diesel, E10, E85 | |
| You decide | Claude picks | |

**User's choice:** All fuel types
**Notes:** None

---

## Scraper Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Retry 3x then skip | Retry with backoff, skip that cycle if still failing | ✓ |
| Retry until success | Keep retrying with increasing backoff until it works | |
| You decide | Claude picks the resilience strategy | |

**User's choice:** Retry 3x then skip
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Skip unchanged | Only insert a row when the price actually changes | |
| Always insert | Insert every 15-min reading regardless | ✓ |
| You decide | Claude picks based on trade-offs | |

**User's choice:** Always insert
**Notes:** Consistent time series preferred over storage savings

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Log errors and summary stats only | ✓ |
| Verbose | Log every API call, every insert, timing info | |
| You decide | Claude picks appropriate logging level | |

**User's choice:** Minimal
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate | Fetch right away on startup, then every 15 min | ✓ |
| Wait for schedule | Only fetch on the cron schedule | |
| You decide | Claude picks | |

**User's choice:** Immediate fetch on startup
**Notes:** None
