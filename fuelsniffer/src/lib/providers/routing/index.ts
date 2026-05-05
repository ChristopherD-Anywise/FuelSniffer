export interface Coord {
  lat: number
  lng: number
}

export interface Route {
  polyline: Coord[]
  distanceMeters: number
  durationSeconds: number
  label?: string
}

export interface RouteResult {
  primary: Route
  alternatives: Route[]
}

export interface RoutingProvider {
  readonly id: string
  readonly displayName: string

  route(
    start: Coord,
    end: Coord,
    options: { alternatives: boolean; profile: 'driving' }
  ): Promise<RouteResult>
}

// ── Registry ────────────────────────────────────────────────────────────────

const providers: RoutingProvider[] = []

export function registerRoutingProvider(provider: RoutingProvider): void {
  if (providers.some(p => p.id === provider.id)) {
    throw new Error(`Routing provider '${provider.id}' is already registered`)
  }
  providers.push(provider)
}

export function getRoutingProvider(id?: string): RoutingProvider {
  if (id) {
    const p = providers.find(p => p.id === id)
    if (!p) throw new Error(`Routing provider '${id}' not found`)
    return p
  }
  if (providers.length === 0) throw new Error('No routing providers registered')
  return providers[0]
}

export function clearRoutingProviders(): void {
  providers.length = 0
}
