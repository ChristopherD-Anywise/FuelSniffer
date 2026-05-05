import { Suspense } from 'react'
import TripClient from './TripClient'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import TripDisabled from '@/components/TripDisabled'

export const metadata = {
  title: 'Trip Planner — Fillip',
  description: 'Find the cheapest fuel along your route',
}

// MAPBOX_TOKEN is read at request time, not at build time, so this page
// must not be prerendered. Without this the build-time absence of the
// token would bake a permanent "disabled" state into the static HTML.
export const dynamic = 'force-dynamic'

export default function TripPage() {
  if (!process.env.MAPBOX_TOKEN) {
    return <TripDisabled />
  }
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TripClient />
    </Suspense>
  )
}
