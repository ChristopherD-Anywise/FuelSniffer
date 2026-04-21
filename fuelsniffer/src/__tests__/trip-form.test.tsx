// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import TripForm from '@/components/TripForm'

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockRoute() {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as { toString(): string }).toString()
    if (url.includes('/api/geocode')) {
      return new Response(JSON.stringify([
        { label: 'Brisbane, QLD', lat: -27.47, lng: 153.02 },
      ]))
    }
    if (url.includes('/api/trip/route')) {
      return new Response(JSON.stringify({
        primary: { polyline: 'abc', distance: 1, duration: 1 },
        alternatives: [],
      }))
    }
    throw new Error('unexpected: ' + url)
  }) as typeof fetch
}

describe('TripForm', () => {
  it('disables submit until both start and end are chosen', async () => {
    mockRoute()
    render(<TripForm onResult={() => {}} onError={() => {}} loading={false} setLoading={() => {}} />)

    const submit = screen.getByRole('button', { name: /find fuel on route/i })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('submits with selected coords', async () => {
    mockRoute()
    const onResult = vi.fn()
    render(<TripForm onResult={onResult} onError={() => {}} loading={false} setLoading={() => {}} />)

    const inputs = screen.getAllByPlaceholderText(/search/i)
    fireEvent.change(inputs[0], { target: { value: 'brisbane' } })
    const startOption = await screen.findByText('Brisbane, QLD', {}, { timeout: 1500 })
    fireEvent.click(startOption)

    fireEvent.change(inputs[1], { target: { value: 'brisbane' } })
    const endOption = await screen.findByText('Brisbane, QLD', {}, { timeout: 1500 })
    fireEvent.click(endOption)

    const submit = screen.getByRole('button', { name: /find fuel on route/i })
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
    await act(async () => { fireEvent.click(submit) })

    await waitFor(() => expect(onResult).toHaveBeenCalled())
    const call = onResult.mock.calls[0]
    const values = call[1]
    expect(values.start).toEqual({ lat: -27.47, lng: 153.02 })
    expect(values.end).toEqual({ lat: -27.47, lng: 153.02 })
  })
})
