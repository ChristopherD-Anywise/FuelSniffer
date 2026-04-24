-- Migration 0009: CSP violation reports table
CREATE TABLE IF NOT EXISTS csp_violations (
  id          BIGSERIAL PRIMARY KEY,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  document_uri TEXT,
  violated_directive TEXT,
  blocked_uri TEXT,
  source_file TEXT,
  line_number INTEGER,
  raw_report  JSONB
);
