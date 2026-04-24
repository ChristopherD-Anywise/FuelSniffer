import { describe, it, expect } from 'vitest'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required')
const sql = postgres(DATABASE_URL, { max: 1 })

describe('Migration 0011: stations geom column', () => {
  it('geom column exists on stations', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'stations' AND column_name = 'geom'
    `
    expect(rows.length).toBe(1)
  })

  it('GIST index exists', async () => {
    const rows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'stations' AND indexname = 'stations_geom_gist'
    `
    expect(rows.length).toBe(1)
  })

  it('geom is populated for existing stations', async () => {
    const rows = await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(geom)::int AS with_geom
      FROM stations WHERE latitude IS NOT NULL
    `
    expect(rows[0].total).toBe(rows[0].with_geom)
  })

  it('geom coordinates match latitude/longitude', async () => {
    const rows = await sql`
      SELECT latitude, longitude,
             ST_Y(geom) AS geom_lat, ST_X(geom) AS geom_lng
      FROM stations LIMIT 1
    `
    if (rows.length > 0) {
      expect(Number(rows[0].geom_lat)).toBeCloseTo(Number(rows[0].latitude), 4)
      expect(Number(rows[0].geom_lng)).toBeCloseTo(Number(rows[0].longitude), 4)
    }
  })
})
