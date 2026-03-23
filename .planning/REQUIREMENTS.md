# Requirements: FuelSniffer

**Defined:** 2026-03-23
**Core Value:** Always-current fuel prices near me, so I never overpay for fuel.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Ingestion

- [x] **DATA-01**: System registers with QLD Fuel Price API and authenticates via subscriber token
- [x] **DATA-02**: Scraper polls QLD API every 15 minutes and stores prices for all fuel types
- [x] **DATA-03**: Scraper health monitoring with heartbeat checks and failure alerts
- [x] **DATA-04**: Today's data stored at 15-minute intervals
- [x] **DATA-05**: Historical data automatically rolled up to hourly intervals

### Dashboard

- [x] **DASH-01**: User can view current fuel prices in a sortable list
- [ ] **DASH-02**: User can filter stations by distance from their location (default 20km, configurable)
- [ ] **DASH-03**: User can filter by fuel type (ULP91, ULP95, ULP98, Diesel, E10, E85)
- [ ] **DASH-04**: User can view stations on a map with price pins
- [ ] **DASH-05**: Dashboard is responsive and works on mobile browsers

### Trends

- [ ] **TRND-01**: User can view price-over-time line chart for a station or area
- [ ] **TRND-02**: User can compare prices across selected stations side-by-side
- [ ] **TRND-03**: User can see cheapest-time patterns (day/time heatmap)
- [ ] **TRND-04**: System detects Brisbane price cycle patterns (~7-week cycle)

### Alerts

- [ ] **ALRT-01**: User can set price threshold alerts (notify when fuel drops below X c/L)
- [ ] **ALRT-02**: User can receive price drop alerts for nearby stations
- [ ] **ALRT-03**: Alerts delivered via browser push notifications (Service Workers + VAPID)

### Access

- [x] **ACCS-01**: Basic shared access for a small group of friends (no heavy auth)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: Email digest of weekly price trends
- **NOTF-02**: SMS alerts as alternative to push notifications

### Intelligence

- **INTL-01**: Predictive pricing ("prices likely to drop tomorrow")
- **INTL-02**: Personalized fuel recommendations based on driving patterns
- **INTL-03**: Cost savings calculator (how much saved vs. always going to nearest station)

### Social

- **SOCL-01**: Share cheapest station with friends via link
- **SOCL-02**: Station favoriting across users

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Native mobile app | Web dashboard with responsive design sufficient for v1 |
| Crowdsourced price reporting | QLD mandatory reporting makes it unnecessary and less accurate |
| Station reviews/ratings | Price tracking only — not a review platform |
| Payment integration | Informational only |
| Multi-state support | QLD-only, North Brisbane focus |
| OAuth/social login | Simple shared access sufficient for friend group |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Pending |
| DASH-03 | Phase 2 | Pending |
| DASH-04 | Phase 2 | Pending |
| DASH-05 | Phase 2 | Pending |
| ACCS-01 | Phase 2 | Complete |
| TRND-01 | Phase 3 | Pending |
| TRND-02 | Phase 3 | Pending |
| TRND-03 | Phase 3 | Pending |
| ALRT-01 | Phase 4 | Pending |
| ALRT-02 | Phase 4 | Pending |
| ALRT-03 | Phase 4 | Pending |
| TRND-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap phase mapping*
