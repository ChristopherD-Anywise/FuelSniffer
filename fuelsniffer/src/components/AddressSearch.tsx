'use client'

import { useState, useRef, useEffect, useCallback, useId } from 'react'

export interface AddressResult {
  label: string
  lat: number
  lng: number
}

interface AddressSearchProps {
  onSelect: (result: AddressResult) => void
  placeholder?: string
  initialValue?: string
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export default function AddressSearch({
  onSelect,
  placeholder = 'Search address, suburb, or postcode…',
  initialValue = '',
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: AddressSearchProps) {
  const [query, setQuery] = useState(initialValue)
  const [results, setResults] = useState<AddressResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const listboxId = `${reactId}-listbox`

  useEffect(() => { setQuery(initialValue) }, [initialValue])

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setIsOpen(false); return }
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setResults([]); setIsOpen(false); return }
      const data: AddressResult[] = await res.json()
      setResults(data)
      setIsOpen(data.length > 0)
      setHighlightedIndex(-1)
    } catch {
      setResults([]); setIsOpen(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(value), 300)
  }

  const handleSelect = (r: AddressResult) => {
    setQuery(r.label)
    setResults([])
    setIsOpen(false)
    onSelect(r)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setIsOpen(false); setHighlightedIndex(-1) }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1))
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (results[idx]) handleSelect(results[idx])
    }
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
        }
        aria-describedby={describedBy}
        aria-invalid={invalid}
        style={{
          width: '100%',
          height: '40px',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '14px',
          color: 'var(--color-text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {isOpen && results.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            marginTop: '4px',
            maxHeight: '256px',
            overflowY: 'auto',
            zIndex: 50,
            width: '100%',
          }}
        >
          {results.map((r, i) => (
            <button
              key={i}
              id={`${listboxId}-option-${i}`}
              type="button"
              role="option"
              aria-selected={highlightedIndex === i}
              onClick={() => handleSelect(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: highlightedIndex === i ? 'var(--color-border)' : 'transparent',
                color: 'var(--color-text)',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
