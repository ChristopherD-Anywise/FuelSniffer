/**
 * MSW (Mock Service Worker) setup for Mapbox Directions API tests.
 *
 * Intercepts all requests to api.mapbox.com and serves recorded fixtures.
 * No live Mapbox calls are ever made during tests.
 *
 * To add a new fixture:
 * 1. Make ONE real API call and save the JSON to __tests__/fixtures/
 * 2. Add a handler below matching the coordinate pattern
 */
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFixture(name: string): any {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))
}

export const mswServer = setupServer(
  // Brisbane → Gold Coast
  http.get('https://api.mapbox.com/directions/v5/mapbox/driving/:coords', ({ params }) => {
    const coords = params.coords as string
    if (coords.startsWith('153.02') && coords.includes('153.43')) {
      return HttpResponse.json(loadFixture('brisbane-goldcoast.json'))
    }
    // Brisbane → Toowoomba
    if (coords.startsWith('153.02') && coords.includes('151.95')) {
      return HttpResponse.json(loadFixture('brisbane-toowoomba.json'))
    }
    // Invalid coords (ocean, 0,0)
    if (coords.startsWith('0,0;')) {
      return HttpResponse.json(loadFixture('invalid-coords.json'), { status: 422 })
    }
    // Rate-limit simulation
    if (coords.includes('__rate_limit__')) {
      return HttpResponse.json(loadFixture('rate-limited.json'), { status: 429 })
    }
    throw new Error(`Unmocked Mapbox API call detected for coords: ${coords}. Add a fixture for this route.`)
  }),
)
