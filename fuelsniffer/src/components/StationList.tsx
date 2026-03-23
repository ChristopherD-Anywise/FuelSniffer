'use client'

import StationCard from '@/components/StationCard'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationListProps {
  stations: PriceResult[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function StationList({ stations, selectedId, onSelect }: StationListProps) {
  return (
    <div className="overflow-y-auto divide-y divide-zinc-100">
      {stations.map((station) => (
        <StationCard
          key={station.id}
          station={station}
          isSelected={station.id === selectedId}
          onClick={() => onSelect(station.id)}
        />
      ))}
    </div>
  )
}
