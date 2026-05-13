/**
 * NSW FuelCheck API client.
 * Auth: apikey header + transactionid header (UUID per request).
 * Base URL: https://api.onegov.nsw.gov.au/FuelPriceCheck/v2
 *
 * Registration: https://api.nsw.gov.au — free, requires a NSW Government API account.
 */
import { createFuelCheckClient, type FuelCheckClient } from '../_fuelcheck/client'

export function createNswClient(): FuelCheckClient {
  const apiKey = process.env.NSW_FUELCHECK_API_KEY
  if (!apiKey) {
    throw new Error(
      'NSW_FUELCHECK_API_KEY environment variable is not set. ' +
      'Register at https://api.nsw.gov.au to obtain a key.'
    )
  }

  return createFuelCheckClient({
    baseUrl:             'https://api.onegov.nsw.gov.au/FuelPriceCheck/v2',
    apiKey,
    transactionIdHeader: 'transactionid',
  })
}
