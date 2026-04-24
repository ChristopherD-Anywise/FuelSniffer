-- 0023_social_posts.sql
-- SP-8: Audit log + dispatch queue for weekly social bot posts.
-- Composed rows are inserted BEFORE posting so admin can preview/cancel.
-- status flow: pending → approved → posted | failed | cancelled

CREATE TABLE IF NOT EXISTS social_posts (
  id                 BIGSERIAL PRIMARY KEY,
  network            TEXT        NOT NULL CHECK (network IN ('x', 'bluesky', 'mastodon')),
  kind               TEXT        NOT NULL DEFAULT 'weekly_cheapest_postcode',
  composed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at          TIMESTAMPTZ,
  content_text       TEXT        NOT NULL,
  content_image_url  TEXT,
  deep_link          TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'approved'
                       CHECK (status IN ('pending', 'approved', 'posted', 'failed', 'cancelled')),
  response_json      JSONB,
  error_text         TEXT,
  dry_run            BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS social_posts_network_posted
  ON social_posts (network, posted_at DESC);

CREATE INDEX IF NOT EXISTS social_posts_status_composed
  ON social_posts (status, composed_at);
