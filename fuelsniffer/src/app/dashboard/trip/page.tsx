import { Suspense } from 'react'
import TripClient from './TripClient'
import LoadingSkeleton from '@/components/LoadingSkeleton'

export const metadata = {
  title: 'Trip Planner — FuelSniffer',
  description: 'Find the cheapest fuel along your route',
}

export default function TripPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TripClient />
    </Suspense>
  )
}
