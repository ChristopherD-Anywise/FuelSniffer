'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        const data = await res.json()
        setError(data.error ?? "That code isn't valid. Check with the person who shared it.")
      }
    } catch {
      setError("Something went wrong. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⛽</div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FuelSniffer</h1>
          <p className="text-sm text-slate-500 mt-1">Find the cheapest fuel near you</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6">
          <form onSubmit={handleSubmit}>
            <label htmlFor="invite-code" className="block text-sm font-medium text-slate-700 mb-2">
              Invite code
            </label>
            <input
              id="invite-code"
              type="text"
              autoComplete="one-time-code"
              placeholder="Enter your code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full h-12 border border-slate-200 rounded-xl px-4 text-base text-slate-900
                         placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent
                         transition-shadow"
              required
            />
            {error && (
              <p className="text-sm text-red-500 mt-2 flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5">⚠</span>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full h-12 bg-sky-500 hover:bg-sky-600 active:bg-sky-700
                         text-white font-semibold rounded-xl text-base
                         disabled:opacity-50 transition-colors
                         shadow-sm shadow-sky-200"
            >
              {loading ? 'Checking...' : 'Enter dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Invite-only access. Ask a friend for a code.
        </p>
      </div>
    </div>
  )
}
