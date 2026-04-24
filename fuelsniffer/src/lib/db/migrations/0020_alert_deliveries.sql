-- SP-5: Alert delivery log
-- Migration 0020

CREATE TYPE delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed',
  'suppressed_quiet_hours',
  'suppressed_rate_limit',
  'bounced'
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id                  BIGSERIAL        PRIMARY KEY,
  alert_id            BIGINT           NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  fired_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  channel             TEXT             NOT NULL,
  payload_hash        TEXT             NOT NULL,
  dedup_key           TEXT             NOT NULL,
  status              delivery_status  NOT NULL,
  provider_message_id TEXT,
  error               TEXT,
  retry_count         INT              NOT NULL DEFAULT 0,
  CONSTRAINT alert_deliveries_dedup UNIQUE (alert_id, channel, dedup_key)
);

CREATE INDEX IF NOT EXISTS alert_deliveries_alert_fired_idx
  ON alert_deliveries (alert_id, fired_at DESC);

-- Index to support 90-day retention cleanup
CREATE INDEX IF NOT EXISTS alert_deliveries_fired_at_idx
  ON alert_deliveries (fired_at);
