-- SP-4: Cycle Engine Phase A
-- cycle_signals: persisted signal per (suburb_key, fuel_type_id, computed_for, algo_version)
-- Suburb key format: lower(suburb)|lower(state)

CREATE TABLE IF NOT EXISTS cycle_signals (
  id              bigserial PRIMARY KEY,
  suburb_key      text        NOT NULL,    -- e.g. 'chermside|qld'
  suburb_display  text        NOT NULL,    -- e.g. 'Chermside'
  state_code      text        NOT NULL,    -- e.g. 'QLD'
  fuel_type_id    integer     NOT NULL,
  computed_for    date        NOT NULL,    -- the calendar day this signal describes (AEST)
  computed_at     timestamptz NOT NULL DEFAULT NOW(),
  signal_state    text        NOT NULL,
  confidence      double precision NOT NULL,
  label           text        NOT NULL,
  supporting      jsonb       NOT NULL,
  algo_version    text        NOT NULL DEFAULT 'rule-v1',
  CONSTRAINT cycle_signals_state_check
    CHECK (signal_state IN ('FILL_NOW','HOLD','WAIT_FOR_DROP','UNCERTAIN'))
);

-- Unique: one signal per (suburb, fuel, date, algo)
CREATE UNIQUE INDEX IF NOT EXISTS cycle_signals_unique
  ON cycle_signals (suburb_key, fuel_type_id, computed_for, algo_version);

-- Fast lookup by suburb+fuel for today
CREATE INDEX IF NOT EXISTS cycle_signals_lookup
  ON cycle_signals (suburb_key, fuel_type_id, computed_for DESC);
