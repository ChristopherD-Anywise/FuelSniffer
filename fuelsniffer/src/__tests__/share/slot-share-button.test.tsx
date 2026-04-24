// @vitest-environment happy-dom
/**
 * Tests for SlotShareButton — three share branches.
 *
 * Branch 1: navigator.share + canShare with files → share with PNG
 * Branch 2: navigator.share without file support → share text+url
 * Branch 3: no navigator.share → clipboard fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SlotShareButton } from '@/components/slots/SlotShareButton'
import type { PriceResult } from '@/lib/db/queries/prices'

// Mock fetch for /api/share/sign
const mockSignResponse = {
  ogUrl: 'http://localhost:4000/api/og/fill?s=1&f=2&p=17400&v=default&sig=test',
  deepLink: 'http://localhost:4000/share/s/abc123?utm_source=share-card',
  hash: 'abc123',
}

const mockStation: PriceResult = {
  id: 1,
  name: 'Shell Chermside',
  brand: 'Shell',
  address: '123 Main St',
  suburb: 'Chermside',
  latitude: -27.38,
  longitude: 153.03,
  price_cents: '174.0',
  recorded_at: new Date(),
  source_ts: new Date(),
  distance_km: 2.5,
  price_change: -1.5,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SlotShareButton', () => {
  it('renders enabled by default (no disabled prop)', () => {
    render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(btn.getAttribute('aria-label')).toBe('Share station')
  })

  it('renders disabled when disabled prop is true', () => {
    render(<SlotShareButton station={mockStation} fuelTypeId={2} disabled />)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  describe('Branch 1: navigator.share with PNG files', () => {
    it('calls navigator.share with file when canShare supports files', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined)
      const mockCanShare = vi.fn().mockReturnValue(true)

      vi.stubGlobal('navigator', {
        share: mockShare,
        canShare: mockCanShare,
        clipboard: { writeText: vi.fn() },
      })

      // Mock fetch: sign endpoint returns signed URL
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSignResponse),
        } as Response)
        // PNG fetch
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['PNG'], { type: 'image/png' })),
        } as Response)

      render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockShare).toHaveBeenCalledOnce()
        const shareCall = mockShare.mock.calls[0][0]
        expect(shareCall).toHaveProperty('url')
        expect(shareCall).toHaveProperty('files')
      })
    })
  })

  describe('Branch 2: navigator.share without file support', () => {
    it('calls navigator.share with url only when canShare returns false for files', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined)

      vi.stubGlobal('navigator', {
        share: mockShare,
        canShare: vi.fn().mockReturnValue(false), // no file support
        clipboard: { writeText: vi.fn() },
      })

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSignResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: false, // PNG fetch fails → skip to text-only share
        } as Response)

      render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockShare).toHaveBeenCalledOnce()
        const shareCall = mockShare.mock.calls[0][0]
        expect(shareCall).toHaveProperty('url', mockSignResponse.deepLink)
        expect(shareCall).not.toHaveProperty('files')
      })
    })
  })

  describe('Branch 3: clipboard fallback', () => {
    it('copies to clipboard when navigator.share is not available', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)

      vi.stubGlobal('navigator', {
        // No share property
        clipboard: { writeText: mockWriteText },
      })

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSignResponse),
        } as Response)

      render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(mockSignResponse.deepLink)
      })
    })

    it('shows "Link copied!" label after clipboard copy', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)

      vi.stubGlobal('navigator', {
        clipboard: { writeText: mockWriteText },
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSignResponse),
      } as Response)

      render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        const btn = screen.getByRole('button') as HTMLButtonElement
        expect(btn.getAttribute('aria-label')).toBe('Link copied!')
      })
    })
  })

  describe('sign endpoint failure', () => {
    it('falls back to clipboard copy of dashboard URL when sign fails', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)

      vi.stubGlobal('navigator', {
        clipboard: { writeText: mockWriteText },
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      render(<SlotShareButton station={mockStation} fuelTypeId={2} />)
      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled()
      })
    })
  })
})
