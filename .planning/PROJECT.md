# FuelSniffer

## What This Is

A fuel price tracking dashboard for North Brisbane. Scrapes fuel prices every 15 minutes, stores historical data, and presents it through a web dashboard with filtering, alerts, and trend analysis. Shared with a small group of friends, self-hosted.

## Core Value

Always-current fuel prices near me, so I never overpay for fuel.

## Requirements

### Validated

- Scrape fuel prices every 15 minutes from Queensland fuel data sources — Validated in Phase 1: Data Pipeline
- Store today's data at 15-minute intervals, historical data at hourly intervals — Validated in Phase 1: Data Pipeline

### Active

- [ ] Web dashboard accessible from desktop and mobile browsers
- [ ] Filter stations by distance from user (default 20km radius around North Lakes)
- [ ] Filter by fuel type (Unleaded 91, Unleaded 95, Unleaded 98, Diesel, E10, E85)
- [ ] Price alert triggers with browser push notifications
- [ ] Price-over-time trend charts (line charts for station or area)
- [ ] Cheapest-time pattern analysis (day/time patterns)
- [ ] Station comparison charts (side-by-side over time)
- [ ] Basic access for a few friends (no heavy auth needed)

### Out of Scope

- Native mobile app — web dashboard with responsive design is sufficient for v1
- SMS/email alerts — push notifications only for v1
- Public-facing service — small group of trusted users only
- Fuel station reviews/ratings — price tracking only
- Payment integration — informational only

## Context

- Queensland has a government-mandated fuel price reporting system. The QLD Government provides fuel price data through various APIs and data sources that stations are required to report to.
- User is based in North Lakes, North Brisbane. Default search radius is 20km.
- Data retention strategy: 15-minute granularity for current day, hourly aggregation for historical data to manage storage.
- Self-hosted deployment — needs to run reliably on a home server or similar.
- Shared with friends — needs basic multi-user support but not full auth system.

## Constraints

- **Data source**: Must use publicly available Queensland fuel price data — need to research exact API/source
- **Scraping frequency**: Every 15 minutes — scraper must be lightweight and respectful of rate limits
- **Hosting**: Self-hosted — must be easy to deploy and maintain on personal infrastructure
- **Storage**: Historical data at hourly intervals to keep database size manageable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web dashboard over native app | Simpler to build and share, works on all devices | — Pending |
| Push notifications for alerts | User preference, works with web dashboard via Service Workers | — Pending |
| 15-min scrape / hourly historical | Balance between data freshness and storage efficiency | — Pending |
| Self-hosted | User preference for control and no ongoing cloud costs | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-23 after Phase 1: Data Pipeline completion*
