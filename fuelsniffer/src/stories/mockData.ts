import type { PriceResult } from '@/lib/db/queries/prices'

export const mockStation: PriceResult = {
  id: 1,
  name: 'Caltex Woolworths Albany Creek',
  brand: 'Caltex Woolworths',
  address: '485 Albany Creek Rd',
  suburb: 'Albany Creek',
  latitude: -27.3634,
  longitude: 152.9689,
  price_cents: '179.9',
  recorded_at: new Date(Date.now() - 5 * 60 * 1000),
  source_ts: new Date(Date.now() - 5 * 60 * 1000),
  distance_km: 1.4,
  price_change: -3.1,
  // SP-6: default no-programme state
  effective_price_cents: 179.9,
  applied_programme_id: null,
  applied_programme_name: null,
  applied_discount_cents: 0,
  considered_programme_ids: [],
}

export const mockStationExpensive: PriceResult = {
  ...mockStation,
  id: 2,
  name: 'BP Eatons Hill',
  brand: 'BP',
  address: '640 South Pine Rd',
  suburb: 'Eatons Hill',
  price_cents: '191.7',
  distance_km: 3.2,
  price_change: 5.5,
}

export const mockStationFlat: PriceResult = {
  ...mockStation,
  id: 3,
  name: '7-Eleven Bridgeman Downs',
  brand: '7-Eleven',
  address: '2 Rides Drive',
  suburb: 'Bridgeman Downs',
  price_cents: '184.5',
  distance_km: 5.7,
  price_change: null,
}
