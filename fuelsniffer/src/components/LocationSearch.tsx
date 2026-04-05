'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface LocationSearchProps {
  onSelect: (location: { lat: number; lng: number; label: string }) => void
}

interface SearchResult {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount?: number
}

export default function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const data: SearchResult[] = await res.json()
      setResults(data)
      setIsOpen(data.length > 0)
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
    const label = result.label
    onSelect({ lat: result.lat, lng: result.lng, label })
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

  // Close on Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Search icon */}
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
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
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 pl-9 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-colors w-56"
      />

      {isOpen && results.length > 0 && (
        <div className="absolute bg-white border border-slate-200 rounded-lg shadow-lg mt-1 py-1 max-h-64 overflow-y-auto z-50 w-full min-w-56">
          {results.map((result, i) => (
            <button
              key={`area-${i}`}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium text-slate-900">
                {result.label}
              </span>
              {result.stationCount != null && (
                <span className="text-xs text-slate-400 ml-1.5">
                  ({result.stationCount} station{result.stationCount !== 1 ? 's' : ''})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
