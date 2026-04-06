'use client'

import React from 'react'
import StationCard from '@/components/StationCard'
import AdCard from '@/components/AdCard'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationListProps {
  stations: PriceResult[]
  selectedId: number | null
  onSelect: (id: number) => void
  cardRefsMap?: Map<number, HTMLElement>
}

const AD_AFTER_INDEX = 2

export default function StationList({ stations, selectedId, onSelect, cardRefsMap }: StationListProps) {
  return (
    <div className="overflow-y-auto" style={{ background: '#111111' }}>
      {stations.map((station, index) => (
        <React.Fragment key={station.id}>
          <StationCard
            station={station}
            isSelected={station.id === selectedId}
            onClick={() => onSelect(station.id)}
            rank={index + 1}
            cardRef={cardRefsMap ? (el) => {
              if (el) cardRefsMap.set(station.id, el)
              else cardRefsMap.delete(station.id)
            } : undefined}
          />
          {index === AD_AFTER_INDEX && stations.length > AD_AFTER_INDEX + 1 && (
            <AdCard />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
