-- Migration 0013: Auth v2 — users, OAuth identities, magic links, cohort gating
-- SP-2: Magic Link + Google/Apple OAuth
--
-- Backfill note: existing sessions (migration 0003) are keyed by session ID only
-- and reference invite_codes. There is no user email in the old sessions table,
-- so we cannot backfill users from existing sessions. Existing sessions will expire
-- naturally (7-day TTL). Users will re-authenticate via magic link to their email,
-- which will create a new users row and issue a new JWT session. The invite_codes
-- table is preserved and repurposed for optional cohort gating.

-- citext for case-insensitive email lookups without lower() everywhere
CREATE EXTENSION IF NOT EXISTS citext;

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT      NOT NULL UNIQUE,
  email_verified    BOOLEAN     NOT NULL DEFAULT false,
  display_name      TEXT,
  is_admin          BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ,
  -- legacy column from invite-code era; nullable; kept for audit trail
  legacy_invite_code TEXT
);

-- ── oauth_identities ─────────────────────────────────────────────────────────
-- Links a third-party OAuth identity to a Fillip user.
-- magic-link logins are NOT stored here — the users.email is the identity.
CREATE TABLE IF NOT EXISTS oauth_identities (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT        NOT NULL,  -- 'google' | 'apple'
  provider_subject TEXT        NOT NULL,  -- stable per-provider user ID (sub claim)
  email_at_link    TEXT        NOT NULL,  -- email asserted at link time, for audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subject),
  -- one Google identity per user in MVP (relaxable later)
  UNIQUE (user_id, provider)
);

-- ── magic_link_tokens ────────────────────────────────────────────────────────
-- Stores hashed magic-link tokens. Raw token never persisted.
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT      NOT NULL,
  token_hash    TEXT        NOT NULL UNIQUE,  -- SHA-256 hex of the raw token
  purpose       TEXT        NOT NULL DEFAULT 'login',  -- 'login'; reserved for future 'email-change'
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,                  -- NULL = available; NOT NULL = consumed (single-use)
  ip_at_request INET,
  ua_at_request TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS magic_link_tokens_hash_idx
  ON magic_link_tokens (token_hash);

CREATE INDEX IF NOT EXISTS magic_link_tokens_expires_idx
  ON magic_link_tokens (expires_at);

-- ── magic_link_request_log ───────────────────────────────────────────────────
-- Rate-limiting table. Bucket is 1-hour sliding window.
-- email_or_ip_hash: SHA-256 hex of the email (normalised) or IP address.
CREATE TABLE IF NOT EXISTS magic_link_request_log (
  email_or_ip_hash TEXT        NOT NULL,
  bucket_window    TIMESTAMPTZ NOT NULL,  -- truncated to 1-hour bucket
  count            INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (email_or_ip_hash, bucket_window)
);

CREATE INDEX IF NOT EXISTS magic_link_request_log_window_idx
  ON magic_link_request_log (bucket_window);

-- ── app_settings ─────────────────────────────────────────────────────────────
-- Key-value store for admin-controlled feature flags.
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT  PRIMARY KEY,
  value JSONB NOT NULL
);

-- Seed: cohort gating is OFF by default (open signup).
-- Admin flips this to true during closed-beta phase.
INSERT INTO app_settings (key, value)
  VALUES ('require_invite_for_signup', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
