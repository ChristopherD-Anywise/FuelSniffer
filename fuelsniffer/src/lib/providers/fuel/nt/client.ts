/**
 * NT MyFuel API client stub.
 *
 * ⚠ Q4 UNRESOLVED: The NT API base URL and exact auth flow are unconfirmed.
 * This stub uses a best-guess URL based on the spec. When FILLIP_ENABLE_NT is set,
 * fetchStations/fetchPrices will throw NtApiUnverified until:
 *   1. The URL is confirmed at https://myfuelnt.nt.gov.au/Api/
 *   2. FILLIP_NT_VERIFIED=true is set in the environment
 *   3. This stub is replaced with a real implementation
 *
 * Expected auth: 'Authorization: Bearer <NT_MYFUEL_API_KEY>'
 * Expected endpoints: /Site/Sites (stations), /Price/Prices (prices)
 */

export class NtApiUnverified extends Error {
  constructor() {
    super(
      'NT MyFuel API base URL is unconfirmed (SP-1 Q4). ' +
      'Set FILLIP_NT_VERIFIED=true after confirming the URL at https://myfuelnt.nt.gov.au/Api/ ' +
      'and providing NT_MYFUEL_API_KEY.'
    )
    this.name = 'NtApiUnverified'
  }
}

export interface NtSite {
  siteId:    string | number
  name:      string
  address?:  string
  suburb?:   string
  postcode?: string
  brand?:    string
  latitude?:  number
  longitude?: number
}

export interface NtPrice {
  siteId:    string | number
  fuelType:  string
  price:     number
  updatedAt?: string
}

export interface NtClient {
  getSites():  Promise<NtSite[]>
  getPrices(): Promise<NtPrice[]>
}

export function createNtClient(): NtClient {
  if (!process.env.FILLIP_NT_VERIFIED) {
    throw new NtApiUnverified()
  }

  // Once FILLIP_NT_VERIFIED=true, this placeholder would be replaced with real impl.
  // Keeping the throw here until the URL is verified and this is implemented.
  throw new NtApiUnverified()
}
