-- SP-5: Alerts — alert_type enum + alerts table
-- Migration 0019

CREATE TYPE alert_type AS ENUM (
  'price_threshold',
  'cycle_low',
  'favourite_drop',
  'weekly_digest'
);

CREATE TABLE IF NOT EXISTS alerts (
  id                BIGSERIAL    PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              alert_type   NOT NULL,
  criteria_json     JSONB        NOT NULL,
  channels          TEXT[]       NOT NULL DEFAULT '{email,push}',
  paused            BOOLEAN      NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_fired_at     TIMESTAMPTZ,
  last_evaluated_at TIMESTAMPTZ,
  label             TEXT,
  CONSTRAINT alerts_channels_check CHECK (cardinality(channels) >= 1)
);

CREATE INDEX IF NOT EXISTS alerts_user_id_idx
  ON alerts (user_id);

CREATE INDEX IF NOT EXISTS alerts_type_active_idx
  ON alerts (type) WHERE paused = false;

CREATE INDEX IF NOT EXISTS alerts_user_type_idx
  ON alerts (user_id, type);
