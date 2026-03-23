import type { Metadata } from 'next'
import { Suspense } from 'react'
import DashboardClient from './DashboardClient'
import LoadingSkeleton from '@/components/LoadingSkeleton'

export const metadata: Metadata = {
  title: 'FuelSniffer — Cheapest fuel near North Lakes',
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DashboardClient />
    </Suspense>
  )
}
