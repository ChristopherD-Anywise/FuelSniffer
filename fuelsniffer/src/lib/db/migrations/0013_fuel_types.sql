-- Migration 0013: Canonical fuel types lookup table
-- Bridges QLD integer FuelId codes and NSW/WA/NT/TAS string codes.
-- price_readings.fuel_type_id continues to reference this canonical ID.
-- Rollback: DROP TABLE fuel_types CASCADE (removes FK from price_readings).

CREATE TABLE IF NOT EXISTS fuel_types (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL
);

-- Canonical vocabulary seed
INSERT INTO fuel_types (id, code, display_name) VALUES
  (2,  'U91',     'Unleaded 91'),
  (3,  'DL',      'Diesel'),
  (4,  'LPG',     'LPG'),
  (5,  'P95',     'Premium 95'),
  (8,  'P98',     'Premium 98'),
  (12, 'E10',     'E10 Ethanol'),
  (14, 'PDL',     'Premium Diesel'),
  (19, 'E85',     'E85 Ethanol'),
  (20, 'B20',     'Biodiesel B20'),
  (21, 'EV',      'EV Charge')
ON CONFLICT (id) DO NOTHING;
