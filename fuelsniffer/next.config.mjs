import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/**
 * NOTE on Serwist / Service Worker:
 *
 * @serwist/next uses Webpack under the hood and is incompatible with
 * Next.js 16's default Turbopack build. The service worker source is at
 * src/app/sw.ts and needs to be compiled separately or via the `--webpack`
 * flag for local development.
 *
 * For production: run `next build --webpack` to get the SW compiled via Serwist.
 * The Dockerfile should use `npm run build:webpack` (see scripts below).
 * For development with SW: `next dev --webpack`.
 *
 * The public/sw.js file will be present after a Webpack build.
 * PwaRegistrar skips SW registration in development unless NEXT_PUBLIC_SW_DEV=1.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Turbopack config (empty = use defaults, suppresses the webpack-config warning)
  turbopack: {},
}

export default withBundleAnalyzer(nextConfig)
