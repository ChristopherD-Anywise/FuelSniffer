import {
  pgTable,
  integer,
  text,
  boolean,
  doublePrecision,
  serial,
  bigserial,
  bigint,
  timestamp,
  numeric,
  varchar,
  jsonb,
  date,
} from 'drizzle-orm/pg-core'

/**
 * Stations table — QLD API site metadata.
 * D-05: is_active flag for soft-delete (closed/relocated stations).
 * D-06: Only stations within ~50km of North Lakes are stored (filtered at ingest).
 */
export const stations = pgTable('stations', {
  id:          integer('id').primaryKey(),   // QLD API SiteId (pre-0015); surrogate BIGSERIAL post-0015
  name:        text('name').notNull(),
  brand:       text('brand'),
  address:     text('address'),
  suburb:      text('suburb'),
  postcode:    text('postcode'),
  latitude:    doublePrecision('latitude').notNull(),
  longitude:   doublePrecision('longitude').notNull(),
  isActive:       boolean('is_active').notNull().default(true),
  lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  externalId:     text('external_id').notNull(),
  sourceProvider: text('source_provider').notNull(),
  // SP-1 jurisdiction fields (migration 0014)
  state:          varchar('state', { length: 3 }).notNull().default('QLD'),
  region:         text('region'),
  jurisdiction:   text('jurisdiction').notNull().default('AU-QLD'),
  timezone:       text('timezone').notNull().default('Australia/Brisbane'),
  sourceMetadata: jsonb('source_metadata'),
})

/**
 * Price readings hypertable — 15-minute price rows.
 * D-07: All fuel types stored; filtering happens at the UI layer.
 * D-09: A row is always inserted even when price has not changed.
 * price_cents is stored AFTER rawToPrice() conversion: e.g. 145.9, NOT 1459.
 *
 * NOTE: This table must be converted to a TimescaleDB hypertable via
 * 0001_hypertable.sql. Drizzle Kit cannot generate that DDL.
 */
export const priceReadings = pgTable('price_readings', {
  recordedAt:  timestamp('recorded_at', { withTimezone: true }).notNull(),
  stationId:   integer('station_id').notNull().references(() => stations.id),
  fuelTypeId:  integer('fuel_type_id').notNull(),
  priceCents:     numeric('price_cents', { precision: 6, scale: 1 }).notNull(),
  sourceTs:       timestamp('source_ts', { withTimezone: true }).notNull(), // TransactionDateUtc from API
  sourceProvider: text('source_provider').notNull(),
  // SP-1: WA T+1 effective date (migration 0016). For non-WA: validFrom = recordedAt.
  validFrom:      timestamp('valid_from', { withTimezone: true }),
})

/**
 * Scrape health log — one row per scrape cycle (success or failure).
 * D-03: Health monitoring — heartbeat written after every cycle attempt.
 * error = NULL means success; error = message text means failure.
 */
export const scrapeHealth = pgTable('scrape_health', {
  id:              serial('id').primaryKey(),
  scrapedAt:       timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),
  pricesUpserted:  integer('prices_upserted').notNull(),
  durationMs:      integer('duration_ms').notNull(),
  error:           text('error'),  // NULL = success
  // SP-1: per-provider tracking (migration 0017)
  provider:        text('provider').notNull().default('qld'),
})

// Type exports for use in scraper and API routes
export type Station = typeof stations.$inferSelect
export type NewStation = typeof stations.$inferInsert
export type PriceReading = typeof priceReadings.$inferSelect
export type NewPriceReading = typeof priceReadings.$inferInsert
export type ScrapeHealth = typeof scrapeHealth.$inferSelect
export type NewScrapeHealth = typeof scrapeHealth.$inferInsert

/**
 * Invite codes table — one row per friend.
 * D-13: Invite code system — unique codes per friend, individually revocable.
 * code: 8-char hex string (e.g. "a3f82b9c"), generated via crypto.randomBytes(4).toString('hex')
 */
export const inviteCodes = pgTable('invite_codes', {
  id:         serial('id').primaryKey(),
  code:       text('code').notNull().unique(),
  label:      text('label'),                     // "Alice's phone" — human memo
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

/**
 * Sessions table — links an active session to an invite code.
 * Enables server-side revocation: when a code is revoked, proxy.ts checks is_active
 * on the linked code (via codeId) and redirects to /login.
 * D-14: Sessions last 7 days.
 */
export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),   // random UUID stored in JWT payload
  codeId:    integer('code_id').references(() => inviteCodes.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type InviteCode = typeof inviteCodes.$inferSelect
export type NewInviteCode = typeof inviteCodes.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

/**
 * Waitlist signups table — stores encrypted email addresses for the NSW waitlist.
 * email_encrypted: AES-256-GCM ciphertext (iv:ciphertext:authTag, base64-encoded segments)
 * email_hash: SHA-256 HMAC hex digest used for deduplication
 * source: signup source identifier (e.g. "nsw-landing")
 * ip_hash / ua_hash: hashed IP and User-Agent for abuse detection
 * consent: whether the user explicitly opted in
 */
export const waitlistSignups = pgTable('waitlist_signups', {
  id:             bigserial('id', { mode: 'number' }).primaryKey(),
  emailEncrypted: text('email_encrypted').notNull(),
  emailHash:      varchar('email_hash', { length: 64 }).notNull().unique(),
  source:         varchar('source', { length: 32 }).notNull(),
  ipHash:         varchar('ip_hash', { length: 64 }).notNull(),
  uaHash:         varchar('ua_hash', { length: 64 }).notNull(),
  consent:        boolean('consent').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type WaitlistSignup = typeof waitlistSignups.$inferSelect
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert

/**
 * Canonical fuel types lookup table (SP-1, migration 0013).
 * Bridges QLD integer FuelId codes and NSW/WA/NT/TAS string codes.
 * price_readings.fuel_type_id references the canonical id.
 */
export const fuelTypes = pgTable('fuel_types', {
  id:          integer('id').primaryKey(),
  code:        text('code').notNull().unique(),
  displayName: text('display_name').notNull(),
})

export type FuelType = typeof fuelTypes.$inferSelect
export type NewFuelType = typeof fuelTypes.$inferInsert

/**
 * Cycle signals table (SP-4).
 * One row per (suburb_key, fuel_type_id, computed_for, algo_version).
 * suburb_key format: lower(suburb)|lower(state)  e.g. 'chermside|qld'
 * Phase B writes algo_version = 'forecast-v1'; query layer prefers higher priority.
 */
export const cycleSignals = pgTable('cycle_signals', {
  id:            bigserial('id', { mode: 'number' }).primaryKey(),
  suburbKey:     text('suburb_key').notNull(),
  suburbDisplay: text('suburb_display').notNull(),
  stateCode:     text('state_code').notNull(),
  fuelTypeId:    integer('fuel_type_id').notNull(),
  computedFor:   date('computed_for').notNull(),
  computedAt:    timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  signalState:   text('signal_state').notNull(),
  confidence:    doublePrecision('confidence').notNull(),
  label:         text('label').notNull(),
  supporting:    jsonb('supporting').notNull(),
  algoVersion:   text('algo_version').notNull().default('rule-v1'),
})

export type CycleSignal = typeof cycleSignals.$inferSelect
export type NewCycleSignal = typeof cycleSignals.$inferInsert

/**
 * Share card renders cache index — SP-8.
 * Actual PNG bytes are re-rendered on each cache miss (CDN absorbs repeat traffic).
 * hash = sha256(station_id|fuel_type_id|price_cents|radius_km|variant) — content-addressed.
 * No PII — no user FK.
 */
export const shareCardRenders = pgTable('share_card_renders', {
  id:           bigserial('id', { mode: 'number' }).primaryKey(),
  hash:         text('hash').notNull().unique(),
  stationId:    bigint('station_id', { mode: 'number' }).notNull().references(() => stations.id),
  fuelTypeId:   integer('fuel_type_id').notNull(),
  priceCents:   integer('price_cents').notNull(),
  radiusKm:     integer('radius_km'),
  variant:      text('variant').notNull().default('default'),
  generatedAt:  timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  lastServedAt: timestamp('last_served_at', { withTimezone: true }).notNull().defaultNow(),
  servedCount:  integer('served_count').notNull().default(1),
})

export type ShareCardRender = typeof shareCardRenders.$inferSelect
export type NewShareCardRender = typeof shareCardRenders.$inferInsert

/**
 * Social posts audit log + dispatch queue — SP-8.
 * Rows are inserted BEFORE posting so admin can preview/cancel (editorial guard).
 * status flow: pending → approved → posted | failed | cancelled
 * dry_run=true rows are logged but not sent to the network.
 */
export const socialPosts = pgTable('social_posts', {
  id:               bigserial('id', { mode: 'number' }).primaryKey(),
  network:          text('network').notNull(),
  kind:             text('kind').notNull().default('weekly_cheapest_postcode'),
  composedAt:       timestamp('composed_at', { withTimezone: true }).notNull().defaultNow(),
  postedAt:         timestamp('posted_at', { withTimezone: true }),
  contentText:      text('content_text').notNull(),
  contentImageUrl:  text('content_image_url'),
  deepLink:         text('deep_link').notNull(),
  status:           text('status').notNull().default('approved'),
  responseJson:     jsonb('response_json'),
  errorText:        text('error_text'),
  dryRun:           boolean('dry_run').notNull().default(false),
})

export type SocialPost = typeof socialPosts.$inferSelect
export type NewSocialPost = typeof socialPosts.$inferInsert
