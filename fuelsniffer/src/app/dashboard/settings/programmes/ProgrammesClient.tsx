'use client'

/**
 * Client component for the programmes settings page.
 * Fetches /api/me/programmes, renders grouped toggles, PUTs on change.
 */

import { useState, useEffect, useCallback } from 'react'

interface MergedProgramme {
  id: string
  name: string
  type: 'membership' | 'docket' | 'rewards'
  discount_cents_per_litre: number
  eligible_brand_codes: string[]
  conditions_text: string
  source_url: string
  last_verified_at: string
  enrolled: boolean
  paused: boolean
  paused_until: string | null
}

type LoadState = 'loading' | 'error' | 'unauthenticated' | 'ready'

const TYPE_LABELS: Record<string, string> = {
  membership: 'Memberships',
  docket: 'Dockets',
  rewards: 'Rewards',
}

const TYPE_ORDER = ['membership', 'docket', 'rewards']

function BrandChip({ code }: { code: string }) {
  const display = code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '4px',
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      fontSize: '10px',
      color: 'var(--color-text-subtle)',
      fontWeight: 600,
    }}>
      {display}
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  small,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  small?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: small ? '28px' : '36px',
        height: small ? '16px' : '20px',
        borderRadius: '999px',
        border: 'none',
        background: checked ? 'var(--color-accent)' : 'var(--color-border)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
        padding: 0,
      }}
    >
      <span style={{
        display: 'block',
        width: small ? '12px' : '16px',
        height: small ? '12px' : '16px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        left: checked ? (small ? '14px' : '18px') : '2px',
        transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function ProgrammeRow({
  programme,
  onToggle,
  onPauseToggle,
}: {
  programme: MergedProgramme
  onToggle: (id: string, enrolled: boolean) => void
  onPauseToggle: (id: string, paused: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      padding: '14px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{programme.name}</span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-price-down)',
              background: 'var(--color-price-down-muted, #d1fae522)',
              padding: '1px 5px',
              borderRadius: '4px',
            }}>
              −{programme.discount_cents_per_litre}¢/L
            </span>
          </div>

          {/* Eligible brand chips */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {programme.eligible_brand_codes.map(code => (
              <BrandChip key={code} code={code} />
            ))}
          </div>

          {/* Docket secondary toggle */}
          {programme.type === 'docket' && programme.enrolled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Toggle
                checked={!programme.paused}
                onChange={(v) => onPauseToggle(programme.id, !v)}
                label={`I have a ${programme.name} right now`}
                small
              />
              <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                I have a docket right now
              </span>
            </div>
          )}

          {/* Conditions text — collapsible */}
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              fontSize: '11px',
              color: 'var(--color-accent)',
              fontWeight: 600,
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              color: 'var(--color-text-subtle)',
              lineHeight: 1.5,
            }}>
              <p style={{ margin: '0 0 6px' }}>{programme.conditions_text}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                <span>Last verified: {programme.last_verified_at}</span>
                <a
                  href={programme.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                >
                  Source
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <path d="M7 1H9V3M9 1L5 5M2 2H1V9H8V8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Enrolled toggle */}
        <div style={{ paddingTop: '2px' }}>
          <Toggle
            checked={programme.enrolled}
            onChange={(v) => onToggle(programme.id, v)}
            label={`${programme.enrolled ? 'Unenrol from' : 'Enrol in'} ${programme.name}`}
          />
        </div>
      </div>
    </div>
  )
}

export default function ProgrammesClient() {
  const [programmes, setProgrammes] = useState<MergedProgramme[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [pylonOnly, setPylonOnly] = useState(false)

  useEffect(() => {
    fetch('/api/me/programmes')
      .then(async r => {
        if (r.status === 401) { setState('unauthenticated'); return }
        if (!r.ok) throw new Error('Failed to load')
        const data: { programmes: MergedProgramme[] } = await r.json()
        setProgrammes(data.programmes)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  const handleToggle = useCallback(async (id: string, enrolled: boolean) => {
    // Optimistic update
    setProgrammes(prev => prev.map(p => p.id === id ? { ...p, enrolled } : p))

    try {
      await fetch(`/api/me/programmes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enrolled }),
      })
    } catch {
      // Revert on error
      setProgrammes(prev => prev.map(p => p.id === id ? { ...p, enrolled: !enrolled } : p))
    }
  }, [])

  const handlePauseToggle = useCallback(async (id: string, paused: boolean) => {
    setProgrammes(prev => prev.map(p => p.id === id ? { ...p, paused } : p))

    try {
      await fetch(`/api/me/programmes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, paused }),
      })
    } catch {
      setProgrammes(prev => prev.map(p => p.id === id ? { ...p, paused: !paused } : p))
    }
  }, [])

  if (state === 'loading') {
    return (
      <div style={{ fontSize: '14px', color: 'var(--color-text-subtle)', padding: '24px 0' }}>
        Loading programmes…
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return (
      <div style={{
        padding: '20px',
        background: 'var(--color-bg-elevated)',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'var(--color-text-subtle)',
        textAlign: 'center',
      }}>
        <p style={{ margin: '0 0 12px' }}>Sign in to manage your programmes.</p>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            padding: '8px 20px',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign in
        </a>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ color: 'var(--color-price-up)', fontSize: '14px', padding: '16px 0' }}>
        Failed to load programmes. Please try again.
      </div>
    )
  }

  // Global pylon-only toggle (Q7 from spec)
  return (
    <div>
      {/* Global pylon-only toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--color-bg-elevated)',
        borderRadius: '8px',
        marginBottom: '24px',
        border: '1px solid var(--color-border)',
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>Show pylon prices only</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>
            Disable effective prices globally; see raw pump prices
          </div>
        </div>
        <Toggle
          checked={pylonOnly}
          onChange={setPylonOnly}
          label="Show pylon prices only"
        />
      </div>

      {/* Grouped programme list */}
      {TYPE_ORDER.map(type => {
        const group = programmes.filter(p => p.type === type)
        if (group.length === 0) return null
        return (
          <div key={type} style={{ marginBottom: '28px' }}>
            <h2 style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-subtle)',
              margin: '0 0 4px',
            }}>
              {TYPE_LABELS[type]}
            </h2>
            <div>
              {group.map(prog => (
                <ProgrammeRow
                  key={prog.id}
                  programme={prog}
                  onToggle={handleToggle}
                  onPauseToggle={handlePauseToggle}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
