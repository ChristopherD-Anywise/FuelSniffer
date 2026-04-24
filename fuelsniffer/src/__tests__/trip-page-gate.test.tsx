// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('/dashboard/trip — MAPBOX_TOKEN gate', () => {
  it('renders a disabled state when MAPBOX_TOKEN is missing', async () => {
    delete process.env.MAPBOX_TOKEN
    vi.resetModules()
    const mod = await import('@/app/dashboard/trip/page')
    const TripPage = mod.default
    const tree = await TripPage()
    render(tree)
    expect(screen.getByText(/mapbox.*configuration/i)).toBeTruthy()
  })

  it('renders the client page when MAPBOX_TOKEN is set', async () => {
    process.env.MAPBOX_TOKEN = 'test-token'
    vi.resetModules()
    vi.doMock('@/app/dashboard/trip/TripClient', () => ({
      default: () => <div data-testid="trip-client" />,
    }))
    const mod = await import('@/app/dashboard/trip/page')
    const TripPage = mod.default
    const tree = await TripPage()
    render(tree)
    expect(screen.getByTestId('trip-client')).toBeTruthy()
  })
})
