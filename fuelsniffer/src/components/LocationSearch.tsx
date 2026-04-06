'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface LocationSearchProps {
  onSelect: (location: { lat: number; lng: number; label: string; suburb?: string; postcode?: string }) => void
}

interface SearchResult {
  type: 'area' | 'station'
  label?: string
  name?: string
  suburb?: string
  postcode?: string
  id?: number
  lat: number
  lng: number
  stationCount?: number
}

export default function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredArea, setHoveredArea] = useState<number | null>(null)
  const [hoveredStation, setHoveredStation] = useState<number | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setIsOpen(false)
      setHighlightedIndex(-1)
      return
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const data: SearchResult[] = await res.json()
      setResults(data)
      setIsOpen(data.length > 0)
      setHighlightedIndex(-1)
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(value), 300)
  }

  const handleSelect = (result: SearchResult) => {
    const label = result.type === 'area' ? result.label! : result.name!
    onSelect({
      lat: result.lat,
      lng: result.lng,
      label,
      suburb: result.type === 'area' ? result.suburb : undefined,
      postcode: result.type === 'area' ? result.postcode : undefined,
    })
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allResults = [...results.filter(r => r.type === 'area'), ...results.filter(r => r.type === 'station')]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setHighlightedIndex(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (allResults[idx]) handleSelect(allResults[idx])
    }
  }

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const areas = allResults.filter((r) => r.type === 'area')
  const stations = allResults.filter((r) => r.type === 'station')

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Search icon */}
      <svg
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#555555' }}
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search suburb or postcode..."
        style={{
          height: '36px',
          borderRadius: '8px',
          border: '1px solid #2a2a2a',
          background: '#1a1a1a',
          paddingLeft: '36px',
          paddingRight: '12px',
          fontSize: '14px',
          color: '#ffffff',
          width: '224px',
          outline: 'none',
        }}
      />

      {isOpen && (areas.length > 0 || stations.length > 0) && (
        <div style={{
          position: 'absolute',
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          marginTop: '4px',
          paddingTop: '4px',
          paddingBottom: '4px',
          maxHeight: '256px',
          overflowY: 'auto',
          zIndex: 50,
          width: '100%',
          minWidth: '224px',
        }}>
          {areas.map((area, i) => (
            <button
              key={`area-${i}`}
              onClick={() => handleSelect(area)}
              onMouseEnter={() => setHoveredArea(i)}
              onMouseLeave={() => setHoveredArea(null)}
              style={{
                width: '100%',
                textAlign: 'left',
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                background: highlightedIndex === i || hoveredArea === i ? '#2a2a2a' : 'transparent',
                cursor: 'pointer',
                border: 'none',
                transition: 'background-color 150ms',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  {area.suburb ?? area.label}
                </span>
                {area.stationCount != null && (
                  <span style={{ fontSize: '11px', color: '#555555' }}>
                    {area.stationCount} station{area.stationCount !== 1 ? 's' : ''}
                  </span>
                )}
              </span>
              {area.postcode && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#1e1e1e',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  color: '#888',
                  flexShrink: 0,
                  marginLeft: '8px',
                }}>
                  {area.postcode}
                </span>
              )}
            </button>
          ))}

          {areas.length > 0 && stations.length > 0 && (
            <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />
          )}

          {stations.map((station, i) => {
            const globalIndex = areas.length + i
            return (
              <button
                key={`station-${station.id ?? i}`}
                onClick={() => handleSelect(station)}
                onMouseEnter={() => setHoveredStation(i)}
                onMouseLeave={() => setHoveredStation(null)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  paddingLeft: '12px',
                  paddingRight: '12px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  background: highlightedIndex === globalIndex || hoveredStation === i ? '#2a2a2a' : 'transparent',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background-color 150ms',
                }}
              >
                <span style={{ fontSize: '14px', color: '#ffffff' }}>{station.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
