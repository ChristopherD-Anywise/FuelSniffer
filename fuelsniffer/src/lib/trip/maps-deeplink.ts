interface Coord {
  lat: number
  lng: number
}

interface StationCoord extends Coord {
  name: string
}

function assertAustralianBounds(coord: Coord, label: string): void {
  if (coord.lat < -44 || coord.lat > -10 || coord.lng < 112 || coord.lng > 154) {
    throw new Error(`${label} coordinates (${coord.lat}, ${coord.lng}) outside Australian bounds`)
  }
}

export function buildGoogleMapsUrl(start: Coord, station: StationCoord, end: Coord): string {
  assertAustralianBounds(start, 'Start')
  assertAustralianBounds(station, 'Station')
  assertAustralianBounds(end, 'End')

  // Build params manually to keep lat,lng commas unencoded (Maps APIs require this)
  const parts = [
    `api=1`,
    `origin=${start.lat},${start.lng}`,
    `destination=${end.lat},${end.lng}`,
    `waypoints=${station.lat},${station.lng}`,
    `travelmode=driving`,
    `waypoint_place_ids=`,
  ]

  return `https://www.google.com/maps/dir/?${parts.join('&')}`
}

export function buildAppleMapsUrl(start: Coord, station: StationCoord, end: Coord): string {
  assertAustralianBounds(start, 'Start')
  assertAustralianBounds(station, 'Station')
  assertAustralianBounds(end, 'End')

  // Apple Maps uses saddr (start) and daddr (destination) with + separator for waypoints
  // Keep lat,lng commas unencoded — Maps APIs require this format
  const saddr = `${start.lat},${start.lng}`
  const daddr = `${station.lat},${station.lng}+to:${end.lat},${end.lng}`

  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`
}
