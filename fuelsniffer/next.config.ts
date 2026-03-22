import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // instrumentationHook is stable in Next.js 16 — no opt-in flag required.
  // instrumentation.ts is loaded automatically when present.
  experimental: {},
}

export default nextConfig
