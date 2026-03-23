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
    <div className="bg-white max-w-[320px] w-full mx-4 rounded-lg shadow-sm p-8">
      <h1 className="text-lg font-bold text-center mb-6 text-zinc-900">FuelSniffer</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="invite-code" className="block text-[12px] text-zinc-600 mb-1">
          Enter your invite code
        </label>
        <input
          id="invite-code"
          type="text"
          autoComplete="one-time-code"
          placeholder="Invite code"
          value={code}
          onChange={e => setCode(e.target.value)}
          className="w-full h-11 border border-zinc-300 rounded-md px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-600"
          required
        />
        {error && (
          <p className="text-[12px] text-red-600 mt-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full h-11 bg-blue-600 text-white font-bold rounded-md disabled:opacity-50"
        >
          {loading ? 'Checking\u2026' : 'Enter dashboard'}
        </button>
      </form>
    </div>
  )
}
