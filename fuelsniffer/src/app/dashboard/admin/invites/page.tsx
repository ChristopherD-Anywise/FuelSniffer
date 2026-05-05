import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Fillip — Admin: Invite Codes',
}

interface InviteCode {
  id: number
  code: string
  label: string | null
  is_active: boolean
  created_at: string
  last_used_at: string | null
}

async function getCohortGateStatus(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      SELECT value FROM app_settings WHERE key = 'require_invite_for_signup'
    `) as unknown as Array<{ value: boolean }>
    if (rows.length === 0) return false
    return Boolean(rows[0].value)
  } catch {
    return false
  }
}

async function getInviteCodes(): Promise<InviteCode[]> {
  try {
    const rows = await db.execute(sql`
      SELECT id, code, label, is_active, created_at, last_used_at
      FROM invite_codes
      ORDER BY created_at DESC
    `) as unknown as InviteCode[]
    return rows
  } catch {
    return []
  }
}

export default async function AdminInvitesPage() {
  // Get session from cookie
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
  const fakeReq = new Request('http://localhost', {
    headers: { cookie: cookieHeader },
  })
  const session = await getSession(fakeReq)

  if (!session) {
    redirect('/login?next=/dashboard/admin/invites')
  }

  // Check admin status
  const userRows = await db.execute(sql`
    SELECT is_admin FROM users WHERE id = ${session.userId}
  `) as unknown as Array<{ is_admin: boolean }>

  if (userRows.length === 0 || !userRows[0].is_admin) {
    notFound()
  }

  const [cohortGateEnabled, inviteCodes] = await Promise.all([
    getCohortGateStatus(),
    getInviteCodes(),
  ])

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ color: 'var(--color-text, #f8fafc)', marginBottom: '32px' }}>
        Invite Code Management
      </h1>

      {/* Cohort gate toggle */}
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '32px',
        border: '1px solid var(--color-border, #334155)',
      }}>
        <h2 style={{ color: 'var(--color-text, #f8fafc)', marginBottom: '8px', fontSize: '18px' }}>
          Cohort Gating
        </h2>
        <p style={{ color: 'var(--color-text-muted, #94a3b8)', marginBottom: '16px', fontSize: '14px' }}>
          When enabled, new users must provide a valid invite code to sign up.
          Existing users are always allowed regardless of this setting.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            background: cohortGateEnabled ? '#166534' : '#1e3a5f',
            color: cohortGateEnabled ? '#86efac' : '#93c5fd',
          }}>
            {cohortGateEnabled ? 'ENABLED — Invite required' : 'DISABLED — Open signup'}
          </span>
        </div>
        <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '13px', marginTop: '12px' }}>
          Toggle via API: <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
            POST /api/admin/settings
          </code> (not yet implemented — SP-3 admin UI)
        </p>
      </div>

      {/* Invite codes list */}
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        borderRadius: '8px',
        padding: '24px',
        border: '1px solid var(--color-border, #334155)',
      }}>
        <h2 style={{ color: 'var(--color-text, #f8fafc)', marginBottom: '16px', fontSize: '18px' }}>
          Invite Codes ({inviteCodes.length})
        </h2>

        {inviteCodes.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted, #94a3b8)' }}>No invite codes yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Code', 'Label', 'Status', 'Created', 'Last Used'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    color: 'var(--color-text-muted, #94a3b8)',
                    fontSize: '13px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inviteCodes.map(code => (
                <tr key={code.id}>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text, #f8fafc)', fontFamily: 'monospace', fontSize: '14px' }}>
                    {code.code}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted, #94a3b8)', fontSize: '14px' }}>
                    {code.label ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: code.is_active ? '#166534' : '#374151',
                      color: code.is_active ? '#86efac' : '#9ca3af',
                    }}>
                      {code.is_active ? 'Active' : 'Used'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted, #94a3b8)', fontSize: '13px' }}>
                    {new Date(code.created_at).toLocaleDateString('en-AU')}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted, #94a3b8)', fontSize: '13px' }}>
                    {code.last_used_at ? new Date(code.last_used_at).toLocaleDateString('en-AU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
