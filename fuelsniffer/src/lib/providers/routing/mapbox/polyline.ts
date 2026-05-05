/**
 * Decode a Mapbox/Google encoded polyline string into an array of coordinates.
 * Mapbox Directions API returns geometry as an encoded polyline (precision 5 for
 * polyline, precision 6 for polyline6). We use precision 5 (the default).
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
import type { Coord } from '../index'

export function decodePolyline(encoded: string, precision = 5): Coord[] {
  const factor = 10 ** precision
  const coords: Coord[] = []
  let lat = 0
  let lng = 0
  let index = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lng += result & 1 ? ~(result >> 1) : result >> 1

    coords.push({ lat: lat / factor, lng: lng / factor })
  }

  return coords
}
