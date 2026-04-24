-- SP-5: Web push subscriptions
-- Migration 0021

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT         NOT NULL UNIQUE,
  keys_p256dh  TEXT         NOT NULL,
  keys_auth    TEXT         NOT NULL,
  ua           TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

-- Only active (non-revoked) subscriptions per user
CREATE INDEX IF NOT EXISTS web_push_subs_user_active_idx
  ON web_push_subscriptions (user_id) WHERE revoked_at IS NULL;
