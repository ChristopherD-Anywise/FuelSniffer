-- Migration 0018: SP-6 True-Cost Prices — user_programmes table
--
-- Stores each user's enrolled loyalty/discount programmes.
-- programme_id is NOT a foreign key — programmes live as versioned JSON in repo.
-- Validation enforced at API layer (against the in-memory registry).
--
-- paused: used for docket-type programmes where the user temporarily has a docket.
--         For membership/rewards, this is an "advanced pause" control.
-- paused_until: optional auto-resume timestamp (future use; not enforced by DB).

CREATE TABLE IF NOT EXISTS user_programmes (
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id  TEXT         NOT NULL,
  enabled_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  paused        BOOLEAN      NOT NULL DEFAULT false,
  paused_until  TIMESTAMPTZ,
  PRIMARY KEY (user_id, programme_id)
);

CREATE INDEX IF NOT EXISTS user_programmes_user_idx
  ON user_programmes (user_id);
