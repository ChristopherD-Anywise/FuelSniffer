// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import AddressSearch from '@/components/AddressSearch'

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockFetch(results: Array<{ label: string; lat: number; lng: number }>) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(results), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch
}

describe('AddressSearch', () => {
  it('calls /api/geocode with debounce after typing', async () => {
    const spy = vi.fn(async () => new Response('[]'))
    globalThis.fetch = spy as unknown as typeof fetch

    render(<AddressSearch onSelect={() => {}} placeholder="Search" />)
    const input = screen.getByPlaceholderText('Search')
    fireEvent.change(input, { target: { value: 'bri' } })

    expect(spy).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('/api/geocode?q=bri'))
    }, { timeout: 1000 })
  })

  it('fires onSelect with chosen result', async () => {
    mockFetch([
      { label: 'Brisbane, QLD', lat: -27.47, lng: 153.02 },
      { label: 'Brisbane City, QLD 4000', lat: -27.46, lng: 153.03 },
    ])

    const onSelect = vi.fn()
    render(<AddressSearch onSelect={onSelect} placeholder="Search" />)
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'brisbane' } })

    const first = await screen.findByText('Brisbane, QLD', {}, { timeout: 1500 })
    fireEvent.click(first)

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Brisbane, QLD', lat: -27.47, lng: 153.02,
    })
  })

  it('ignores input shorter than 2 chars', async () => {
    const spy = vi.fn(async () => new Response('[]'))
    globalThis.fetch = spy as unknown as typeof fetch

    render(<AddressSearch onSelect={() => {}} placeholder="Search" />)
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'a' } })

    await new Promise(r => setTimeout(r, 600))
    expect(spy).not.toHaveBeenCalled()
  })
})
