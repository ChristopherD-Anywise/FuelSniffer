import type { RoutingProvider, RouteResult, Route, Coord } from '../index'
import { decodePolyline } from './polyline'

export class MapboxRoutingProvider implements RoutingProvider {
  readonly id = 'mapbox'
  readonly displayName = 'Mapbox Directions'

  private token: string

  constructor() {
    const token = process.env.MAPBOX_TOKEN
    if (!token) {
      throw new Error(
        'MAPBOX_TOKEN environment variable is not set. ' +
        'Get a token at https://account.mapbox.com/'
      )
    }
    this.token = token
  }

  async route(start: Coord, end: Coord, options: { alternatives: boolean; profile: 'driving' }): Promise<RouteResult> {
    const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/${options.profile}/${coords}`
      + `?alternatives=${options.alternatives}&geometries=polyline&overview=full`
      + `&access_token=${this.token}`

    const response = await fetch(url)

    if (response.status === 429) {
      throw new MapboxRateLimitError('Mapbox rate limit exceeded')
    }

    if (!response.ok) {
      const body = await response.text()
      throw new MapboxApiError(`Mapbox API error ${response.status}: ${body}`)
    }

    const data = await response.json() as MapboxDirectionsResponse

    if (!data.routes || data.routes.length === 0) {
      throw new MapboxApiError('Mapbox returned no routes')
    }

    const [primary, ...alts] = data.routes.map((r, i) => this.mapRoute(r, i))

    return { primary, alternatives: alts }
  }

  private mapRoute(raw: MapboxRoute, index: number): Route {
    return {
      polyline: decodePolyline(raw.geometry),
      distanceMeters: raw.distance,
      durationSeconds: raw.duration,
      label: index === 0 ? undefined : `Alternative ${index}`,
    }
  }
}

// ── Error types ─────────────────────────────────────────────────────────────

export class MapboxApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapboxApiError'
  }
}

export class MapboxRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapboxRateLimitError'
  }
}

// ── Mapbox response types (minimal, not exhaustive) ─────────────────────────

interface MapboxRoute {
  geometry: string      // encoded polyline
  distance: number      // meters
  duration: number      // seconds
  legs: unknown[]
}

interface MapboxDirectionsResponse {
  code: string
  routes: MapboxRoute[]
  waypoints: unknown[]
}
