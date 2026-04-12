CREATE TABLE IF NOT EXISTS waitlist_signups (
  id BIGSERIAL PRIMARY KEY,
  email_encrypted TEXT NOT NULL,
  email_hash VARCHAR(64) NOT NULL UNIQUE,
  source VARCHAR(32) NOT NULL,
  ip_hash VARCHAR(64) NOT NULL,
  ua_hash VARCHAR(64) NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at ON waitlist_signups (created_at);
CREATE INDEX IF NOT EXISTS waitlist_signups_source ON waitlist_signups (source);
