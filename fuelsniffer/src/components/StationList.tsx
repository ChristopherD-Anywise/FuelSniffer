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

function handleArrowKey(e: React.KeyboardEvent, index: number) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = document.querySelector(`[data-station-index="${index + 1}"]`) as HTMLElement | null
    next?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = document.querySelector(`[data-station-index="${index - 1}"]`) as HTMLElement | null
    prev?.focus()
  }
}

export default function StationList({ stations, selectedId, onSelect, cardRefsMap }: StationListProps) {
  return (
    <div className="overflow-y-auto station-list" style={{ background: 'var(--color-bg)' }} role="list" aria-label="Fuel stations">
      {stations.map((station, index) => (
        <React.Fragment key={station.id}>
          <StationCard
            station={station}
            isSelected={station.id === selectedId}
            onClick={() => onSelect(station.id)}
            rank={index + 1}
            stationIndex={index}
            onArrowKey={(e) => handleArrowKey(e, index)}
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
