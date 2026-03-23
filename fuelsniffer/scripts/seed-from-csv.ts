/**
 * Seed the database with real QLD fuel price data from the Open Data Portal.
 * Downloads the latest month's CSV and imports stations within 50km of North Lakes.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/seed-from-csv.ts
 */
import postgres from 'postgres'
import https from 'https'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set')
  process.exit(1)
}

// North Lakes coordinates (D-06: 50km radius)
const NORTH_LAKES_LAT = -27.2358
const NORTH_LAKES_LNG = 152.9867
const MAX_RADIUS_KM = 50

const CSV_URL = 'https://www.data.qld.gov.au/dataset/7c07fdce-a5f0-4de0-8213-b8a31575a26d/resource/efba6a59-325b-44d5-8d73-06f5d10060f5/download/fuel-prices-2025-12-changes-only.csv'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fetchCSV(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const makeRequest = (targetUrl: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      const mod = targetUrl.startsWith('https') ? https : require('http')
      mod.get(targetUrl, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirects + 1)
        }
        let data = ''
        res.on('data', (chunk: string) => data += chunk)
        res.on('end', () => resolve(data))
      }).on('error', reject)
    }
    makeRequest(url)
  })
}

interface RawRow {
  siteId: string
  name: string
  brand: string
  address: string
  suburb: string
  postCode: string
  lat: number
  lng: number
  fuelType: string
  price: number // raw integer e.g. 1940
  transactionDate: string
}

function parseCSV(csv: string): RawRow[] {
  const lines = csv.trim().split('\n')
  const rows: RawRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 12) continue
    rows.push({
      siteId: cols[0],
      name: cols[1],
      brand: cols[2],
      address: cols[3],
      suburb: cols[4],
      postCode: cols[6],
      lat: parseFloat(cols[7]),
      lng: parseFloat(cols[8]),
      fuelType: cols[9],
      price: parseInt(cols[10], 10),
      transactionDate: cols[11],
    })
  }
  return rows
}

// Map CSV fuel type names to integer IDs (matching what the live API uses)
const FUEL_TYPE_MAP: Record<string, number> = {
  'Unleaded': 2,
  'Premium Unleaded': 3,
  'Premium Unleaded 98': 4,
  'Diesel': 5,
  'E10': 7,
  'E85': 10,
  'Premium Diesel': 11,
  'LPG': 6,
}

async function seed() {
  console.log('Downloading CSV...')
  const csv = await fetchCSV(CSV_URL)
  const allRows = parseCSV(csv)
  console.log(`Parsed ${allRows.length} rows from CSV`)

  // Filter to North Brisbane
  const nearbyRows = allRows.filter(r =>
    !isNaN(r.lat) && !isNaN(r.lng) &&
    haversineKm(NORTH_LAKES_LAT, NORTH_LAKES_LNG, r.lat, r.lng) <= MAX_RADIUS_KM
  )
  console.log(`${nearbyRows.length} rows within ${MAX_RADIUS_KM}km of North Lakes`)

  // Deduplicate stations
  const stationMap = new Map<string, RawRow>()
  for (const row of nearbyRows) {
    if (!stationMap.has(row.siteId)) stationMap.set(row.siteId, row)
  }
  console.log(`${stationMap.size} unique stations`)

  const sql = postgres(DATABASE_URL!, { max: 1 })

  try {
    // Insert stations
    let stationCount = 0
    for (const [siteId, row] of stationMap) {
      const dist = haversineKm(NORTH_LAKES_LAT, NORTH_LAKES_LNG, row.lat, row.lng)
      await sql`
        INSERT INTO stations (id, name, brand, address, suburb, postcode, latitude, longitude, is_active)
        VALUES (${parseInt(siteId, 10)}, ${row.name}, ${row.brand}, ${row.address}, ${row.suburb}, ${row.postCode}, ${row.lat}, ${row.lng}, true)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          address = EXCLUDED.address,
          is_active = true
      `
      stationCount++
    }
    console.log(`Inserted/updated ${stationCount} stations`)

    // Station IDs are the QLD SiteId directly
    const idMap = new Map([...stationMap].map(([siteId]) => [siteId, parseInt(siteId, 10)]))

    // Insert price readings — get the LATEST price per station+fuel combo
    const latestPrices = new Map<string, RawRow>()
    for (const row of nearbyRows) {
      const key = `${row.siteId}-${row.fuelType}`
      const existing = latestPrices.get(key)
      if (!existing || row.transactionDate > existing.transactionDate) {
        latestPrices.set(key, row)
      }
    }

    let priceCount = 0
    for (const [, row] of latestPrices) {
      const stationId = idMap.get(row.siteId)
      const fuelTypeId = FUEL_TYPE_MAP[row.fuelType]
      if (!stationId || !fuelTypeId) continue

      const priceCents = row.price / 10 // 1940 → 194.0

      // Parse the CSV date format "04/12/2025 21:01"
      const [datePart, timePart] = row.transactionDate.trim().split(' ')
      const [day, month, year] = datePart.split('/')
      const isoDate = `${year}-${month}-${day}T${timePart}:00Z`

      await sql`
        INSERT INTO price_readings (station_id, fuel_type_id, price_cents, recorded_at, source_ts)
        VALUES (${stationId}, ${fuelTypeId}, ${priceCents}, NOW(), ${isoDate})
        ON CONFLICT DO NOTHING
      `
      priceCount++
    }
    console.log(`Inserted ${priceCount} price readings`)

    // Insert a scrape_health row so /api/health reports OK
    await sql`
      INSERT INTO scrape_health (prices_upserted, duration_ms, error)
      VALUES (${priceCount}, 0, NULL)
    `
    console.log('Scrape health row inserted')

    console.log('\nDone! Dashboard should now show real prices.')
  } finally {
    await sql.end()
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
