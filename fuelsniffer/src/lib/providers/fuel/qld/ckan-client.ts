/**
 * CKAN Open Data Portal client for QLD fuel prices.
 *
 * This is the interim data source while waiting for the official
 * fuelpricesqld.com.au Direct API token. Uses the free, no-auth
 * CKAN datastore_search API.
 *
 * Data is published monthly with a few days delay.
 * Once the Direct API token arrives, swap to client.ts (the real-time source).
 */

const CKAN_BASE = 'https://www.data.qld.gov.au/api/3/action'

// Known resource IDs for 2026 monthly datasets
const RESOURCE_IDS_2026: Record<string, string> = {
  '2026-01': '61a27cfa-9ec5-47cc-8ce5-274f2dcb1908',
  '2026-02': 'f013457b-fd77-4cf0-91e7-28ef983d8c3c',
}

// 2025 December as fallback
const RESOURCE_ID_2025_12 = 'efba6a59-325b-44d5-8d73-06f5d10060f5'

export interface CkanRecord {
  SiteId: string
  Site_Name: string
  Site_Brand: string
  Sites_Address_Line_1: string
  Site_Suburb: string
  Site_Post_Code: string
  Site_Latitude: string
  Site_Longitude: string
  Fuel_Type: string
  Price: string // raw integer as string, e.g. "1940"
  TransactionDateutc: string // ISO-ish: "2026-02-28T13:52:00"
}

interface DatastoreSearchResult {
  success: boolean
  result: {
    total: number
    records: CkanRecord[]
  }
}

/**
 * Find the most recent available resource ID.
 * Checks current month first, then works backward.
 */
export async function findLatestResourceId(): Promise<{ resourceId: string; month: string }> {
  const now = new Date()

  // Try current month first, then go back up to 3 months
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    if (RESOURCE_IDS_2026[key]) {
      return { resourceId: RESOURCE_IDS_2026[key], month: key }
    }
  }

  // Check if there are newer 2026 resources we don't have hardcoded
  try {
    const res = await fetch(`${CKAN_BASE}/package_show?id=fuel-price-reporting-2026`)
    const data = await res.json()
    if (data.success) {
      const csvResources = data.result.resources
        .filter((r: { format: string; datastore_active: boolean }) =>
          r.format === 'CSV' && r.datastore_active)
        .reverse() // most recent first

      if (csvResources.length > 0) {
        return { resourceId: csvResources[0].id, month: '2026-latest' }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback to December 2025
  return { resourceId: RESOURCE_ID_2025_12, month: '2025-12' }
}

/**
 * Fetch fuel price records from the CKAN datastore API.
 * Returns the most recent price changes (sorted by TransactionDateutc DESC).
 *
 * The API supports up to 32000 records per request.
 * We fetch in batches and filter to North Brisbane in the normaliser.
 */
export async function fetchCkanPrices(resourceId: string): Promise<CkanRecord[]> {
  const allRecords: CkanRecord[] = []
  let offset = 0
  const limit = 5000

  // Fetch all records (typically 30-70k per month for all QLD)
  while (true) {
    const url = `${CKAN_BASE}/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}&sort=TransactionDateutc desc`
    const res = await fetch(url)
    const data: DatastoreSearchResult = await res.json()

    if (!data.success || data.result.records.length === 0) break

    allRecords.push(...data.result.records)

    // Stop if we've got all records or enough data
    if (allRecords.length >= data.result.total || data.result.records.length < limit) break

    offset += limit
  }

  return allRecords
}

/**
 * Get the latest price per station+fuel combination from CKAN records.
 * Since CKAN data is "changes only", we take the most recent entry per combo.
 */
export function deduplicateToLatest(records: CkanRecord[]): CkanRecord[] {
  const latest = new Map<string, CkanRecord>()

  for (const record of records) {
    const key = `${record.SiteId}-${record.Fuel_Type}`
    const existing = latest.get(key)

    if (!existing || record.TransactionDateutc > existing.TransactionDateutc) {
      latest.set(key, record)
    }
  }

  return Array.from(latest.values())
}
