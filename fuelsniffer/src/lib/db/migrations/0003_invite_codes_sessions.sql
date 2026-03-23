-- Migration 0003: invite_codes and sessions tables
-- Supports ACCS-01: Invite code system with server-side session revocation.
-- D-13: Unique codes per friend, individually revocable.
-- D-14: Sessions last 7 days.

CREATE TABLE IF NOT EXISTS invite_codes (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  label         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  code_id       INTEGER REFERENCES invite_codes(id),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
