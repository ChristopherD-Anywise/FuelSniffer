'use client'

import { useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: 'This sign-in link is invalid or has expired. Please request a new one.',
  invite_required: 'An invite code is required to create an account. Please enter your code below.',
  oauth_failed: 'Sign-in failed. Please try again.',
  server_error: 'Something went wrong. Please try again.',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const step = searchParams.get('step')

  const [email, setEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const showInviteField = step === 'invite' || error === 'invite_required'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteCode: inviteCode || undefined }),
      })

      const data = await res.json()

      if (res.status === 429) {
        setSubmitError('Too many requests. Please wait a moment and try again.')
        return
      }

      if (data.ok) {
        setSubmitted(true)
      } else {
        setSubmitError('Something went wrong. Please try again.')
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg, #0f172a)',
        padding: '24px',
      }}>
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📬</div>
          <h1 style={{ color: 'var(--color-text, #f8fafc)', marginBottom: '12px' }}>
            Check your email
          </h1>
          <p style={{ color: 'var(--color-text-muted, #94a3b8)', marginBottom: '8px' }}>
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a sign-in link.
          </p>
          <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '14px' }}>
            The link expires in 15 minutes and can only be used once.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg, #0f172a)',
      padding: '24px',
    }}>
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
      }}>
        <h1 style={{ color: 'var(--color-text, #f8fafc)', marginBottom: '8px', textAlign: 'center' }}>
          Sign in to Fillip
        </h1>
        <p style={{ color: 'var(--color-text-muted, #94a3b8)', textAlign: 'center', marginBottom: '32px', fontSize: '14px' }}>
          Track fuel prices across Queensland
        </p>

        {/* Error banner */}
        {error && ERROR_MESSAGES[error] && (
          <div style={{
            background: '#450a0a',
            border: '1px solid #991b1b',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '24px',
            color: '#fca5a5',
            fontSize: '14px',
          }}>
            {ERROR_MESSAGES[error]}
          </div>
        )}

        {/* OAuth buttons */}
        <a
          href="/api/auth/oauth/google/start"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: '#fff',
            color: '#1f2937',
            padding: '12px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '15px',
            marginBottom: '12px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </a>

        <a
          href="/api/auth/oauth/apple/start"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: '#000',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '15px',
            marginBottom: '24px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 814 1000" aria-hidden="true">
            <path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.4-57.2-155.9-127.4C46.7 734 0 680 0 573.4c0-120.5 80.7-254.5 207.8-254.5 73.8 0 133.7 48.6 185.5 48.6 48.6 0 124.2-52.1 211.5-52.1zm-141.3-221.4c43.1-43.1 78.3-99.6 78.3-156.1 0-8.3-.7-16.7-2-24.3-66.7 2.5-143.7 44.9-195.3 97.9-36.8 40.4-77.5 100.1-77.5 157.8 0 9 1.3 17.9 2.5 20.7 3.8.6 10.2 1.3 16.7 1.3 57.8 0 128.1-38.1 177.3-97.3z"/>
          </svg>
          Continue with Apple
        </a>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border, #334155)' }} />
          <span style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '13px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border, #334155)' }} />
        </div>

        {/* Magic link form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', color: 'var(--color-text-muted, #94a3b8)', fontSize: '14px', marginBottom: '6px' }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--color-bg, #0f172a)',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '6px',
                color: 'var(--color-text, #f8fafc)',
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {showInviteField && (
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="inviteCode"
                style={{ display: 'block', color: 'var(--color-text-muted, #94a3b8)', fontSize: '14px', marginBottom: '6px' }}
              >
                Invite code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="XXXX-XXXX"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-bg, #0f172a)',
                  border: '1px solid var(--color-border, #334155)',
                  borderRadius: '6px',
                  color: 'var(--color-text, #f8fafc)',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {submitError && (
            <p style={{ color: '#fca5a5', fontSize: '14px', marginBottom: '12px' }}>
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              background: isLoading ? '#92400e' : 'var(--color-accent, #f59e0b)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      </div>
    </div>
  )
}
