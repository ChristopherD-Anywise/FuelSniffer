-- Migration 0005: no-op placeholder
-- Previously created the TimescaleDB daily continuous aggregate.
-- That is now handled in 0002_cagg.sql as a standard materialized view.
-- This file is kept so the migration runner file list does not skip a number.
SELECT 1;
