import { Suspense } from 'react'
import TripClient from './TripClient'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import TripDisabled from '@/components/TripDisabled'

export const metadata = {
  title: 'Trip Planner — FuelSniffer',
  description: 'Find the cheapest fuel along your route',
}

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
