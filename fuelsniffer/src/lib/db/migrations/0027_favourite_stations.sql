-- SP-5: Favourite stations M2M + user timezone/quiet-hours columns
-- Migration 0022

CREATE TABLE IF NOT EXISTS favourite_stations (
  user_id    UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id INTEGER  NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, station_id)
);

-- SP-5: User timezone + quiet hours (add if columns not already present)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone          TEXT NOT NULL DEFAULT 'Australia/Brisbane',
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME NOT NULL DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end   TIME NOT NULL DEFAULT '07:00';
