import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFixture(name: string): any {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))
}

export const mapboxGeocodeHandler = http.get(
  'https://api.mapbox.com/search/geocode/v6/forward',
  ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase() ?? ''

    if (q.includes('__rate_limit__')) {
      return HttpResponse.json({ message: 'Too many requests' }, { status: 429 })
    }
    if (q.includes('__upstream_error__')) {
      return HttpResponse.json({ message: 'Boom' }, { status: 500 })
    }
    if (q.includes('brisbane')) {
      return HttpResponse.json(loadFixture('brisbane.json'))
    }
    return HttpResponse.json(loadFixture('empty.json'))
  }
)

export const mswServer = setupServer(mapboxGeocodeHandler)
