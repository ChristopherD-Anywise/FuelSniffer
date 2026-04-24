/**
 * TAS FuelCheck API client.
 * Same vendor stack as NSW. Distinct credentials and base URL.
 * Registration: https://www.fuelcheck.tas.gov.au — free government API.
 */
import { createFuelCheckClient, type FuelCheckClient } from '../_fuelcheck/client'

export function createTasClient(): FuelCheckClient {
  const apiKey = process.env.TAS_FUELCHECK_API_KEY
  if (!apiKey) {
    throw new Error(
      'TAS_FUELCHECK_API_KEY environment variable is not set. ' +
      'Register at https://www.fuelcheck.tas.gov.au to obtain a key.'
    )
  }

  return createFuelCheckClient({
    baseUrl: 'https://www.fuelcheck.tas.gov.au/api',
    apiKey,
  })
}
