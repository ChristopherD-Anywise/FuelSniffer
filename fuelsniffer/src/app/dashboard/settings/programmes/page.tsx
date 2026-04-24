/**
 * /dashboard/settings/programmes
 *
 * User-facing loyalty/discount programme enrolment page.
 * Server component shell — passes initial data from /api/me/programmes
 * down to the client component for interactive toggles.
 *
 * Disclaimer per spec §11.1: shown in page header (always visible).
 */

import type { Metadata } from 'next'
import ProgrammesClient from './ProgrammesClient'

export const metadata: Metadata = {
  title: 'My Programmes — Fillip',
}

export default function ProgrammesPage() {
  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'var(--color-text)',
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
          My Programmes
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-subtle)', margin: 0, lineHeight: 1.5 }}>
          Tick the loyalty or discount programmes you&apos;re enrolled in. Fillip will show
          your effective price — what you actually pay at the pump — everywhere a price is displayed.
        </p>

        {/* ACL disclaimer — spec §11.1 requirement */}
        <div
          style={{
            marginTop: '12px',
            padding: '10px 12px',
            background: 'var(--color-bg-elevated)',
            borderLeft: '3px solid var(--color-accent)',
            borderRadius: '0 6px 6px 0',
            fontSize: '12px',
            color: 'var(--color-text-subtle)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--color-text)' }}>Disclaimer:</strong>{' '}
          Discounts shown are typical; actual savings depend on programme terms.
          Fillip has no affiliation with any of the listed programmes.
        </div>
      </div>

      {/* Client component handles toggle interactions */}
      <ProgrammesClient />
    </div>
  )
}
