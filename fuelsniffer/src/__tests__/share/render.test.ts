/**
 * Golden image tests for the share card PNG renderer.
 *
 * Tests:
 * - Output is a valid PNG (magic bytes)
 * - Output is non-empty (> 1KB)
 * - Render completes within 200ms (warm)
 * - Determinism: two renders of same input produce identical bytes
 * - weekly_postcode variant renders without error
 * - Special characters in station name don't throw
 *
 * Hash-based golden comparison:
 * On first run (no snapshot), hashes are written to __snapshots__/render-*.hash.
 * On subsequent runs, hashes are compared.
 * Run with UPDATE_RENDER_SNAPSHOTS=true to refresh.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // \x89PNG

function sha256hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function snapshotPath(name: string): string {
  const dir = join(import.meta.dirname, '__snapshots__')
  mkdirSync(dir, { recursive: true })
  return join(dir, `render-${name}.hash`)
}

function checkOrWriteSnapshot(name: string, hash: string): void {
  const p = snapshotPath(name)
  if (process.env.UPDATE_RENDER_SNAPSHOTS === 'true' || !existsSync(p)) {
    writeFileSync(p, hash, 'utf8')
    return
  }
  const saved = readFileSync(p, 'utf8').trim()
  expect(hash, `Golden hash mismatch for "${name}". Run with UPDATE_RENDER_SNAPSHOTS=true to refresh.`)
    .toBe(saved)
}

describe('share/render-node', () => {
  it('returns a valid PNG (magic bytes check)', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    const png = await renderCardPng({
      stationName: 'North Lakes BP',
      brand: 'BP',
      priceCents: 174,
      fuelCode: 'U91',
    })
    expect(png).toBeInstanceOf(Buffer)
    expect(png.length).toBeGreaterThan(1024)
    expect(png.slice(0, 4).equals(PNG_MAGIC)).toBe(true)
  })

  it('renders within 200ms (warm)', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    // Warm-up run
    await renderCardPng({ stationName: 'Warmup', brand: null, priceCents: 180, fuelCode: 'U91' })
    // Timed run
    const start = Date.now()
    await renderCardPng({ stationName: 'Timed', brand: 'Shell', priceCents: 165, fuelCode: 'E10' })
    const duration = Date.now() - start
    expect(duration).toBeLessThan(200)
  })

  it('is deterministic (two renders produce identical bytes)', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    const props = { stationName: 'Coles Express', brand: 'Coles', priceCents: 179, fuelCode: 'U91', radiusKm: 5 }
    const png1 = await renderCardPng(props)
    const png2 = await renderCardPng(props)
    expect(png1.equals(png2)).toBe(true)
  })

  it('renders weekly_postcode variant without error', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    const png = await renderCardPng({
      stationName: '4000',
      brand: null,
      priceCents: 172,
      fuelCode: 'U91',
      variant: 'weekly_postcode',
      postcodeLabel: 'Postcode 4000 (Brisbane CBD)',
    })
    expect(png.slice(0, 4).equals(PNG_MAGIC)).toBe(true)
  })

  it('handles long station name without throwing', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    const png = await renderCardPng({
      stationName: 'Extremely Long Station Name That Goes Beyond Normal Length — Supercenter',
      brand: 'Ampol',
      priceCents: 189,
      fuelCode: 'Diesel',
    })
    expect(png.length).toBeGreaterThan(0)
  })

  it('handles missing radiusKm without throwing', async () => {
    const { renderCardPng } = await import('@/lib/share/render-node')
    const png = await renderCardPng({
      stationName: 'Petbarn Service Station',
      brand: null,
      priceCents: 155,
      fuelCode: 'LPG',
    })
    expect(png.slice(0, 4).equals(PNG_MAGIC)).toBe(true)
  })

  it('golden hash: default variant', async () => {
    const { renderCardPng, _resetFontCache } = await import('@/lib/share/render-node')
    _resetFontCache()
    const png = await renderCardPng({
      stationName: 'Shell Chermside',
      brand: 'Shell',
      priceCents: 174,
      fuelCode: 'U91',
      radiusKm: 5,
    })
    checkOrWriteSnapshot('default', sha256hex(png))
  })

  it('golden hash: weekly_postcode variant', async () => {
    const { renderCardPng, _resetFontCache } = await import('@/lib/share/render-node')
    _resetFontCache()
    const png = await renderCardPng({
      stationName: '4000',
      brand: null,
      priceCents: 172,
      fuelCode: 'U91',
      variant: 'weekly_postcode',
      postcodeLabel: 'Postcode 4000 (Brisbane CBD)',
    })
    checkOrWriteSnapshot('weekly_postcode', sha256hex(png))
  })
})
