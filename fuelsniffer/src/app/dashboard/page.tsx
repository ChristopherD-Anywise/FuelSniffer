import type { Metadata } from 'next'
import { Suspense } from 'react'
import DashboardClient from './DashboardClient'
import LoadingSkeleton from '@/components/LoadingSkeleton'

export const metadata: Metadata = {
  title: 'Fillip — Cheapest fuel near you',
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DashboardClient />
    </Suspense>
  )
}
