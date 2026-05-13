/**
 * NT provider tests.
 * Verifies the feature-flag guard and stub error behaviour.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NtFuelProvider, NtApiUnverified } from '../provider'

describe('NtFuelProvider — feature flag guard', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Ensure flags are clear
    delete process.env.FILLIP_ENABLE_NT
    delete process.env.FILLIP_NT_VERIFIED
  })

  afterEach(() => {
    // Restore env
    Object.assign(process.env, originalEnv)
    delete process.env.FILLIP_ENABLE_NT
    delete process.env.FILLIP_NT_VERIFIED
  })

  it('fetchStations() returns [] when FILLIP_ENABLE_NT is not set', async () => {
    const provider = new NtFuelProvider()
    const result = await provider.fetchStations()
    expect(result).toEqual([])
  })

  it('fetchPrices() returns [] when FILLIP_ENABLE_NT is not set', async () => {
    const provider = new NtFuelProvider()
    const result = await provider.fetchPrices(new Date())
    expect(result).toEqual([])
  })

  it('healthCheck() returns ok-disabled when FILLIP_ENABLE_NT is not set', async () => {
    const provider = new NtFuelProvider()
    const health = await provider.healthCheck()
    expect(health.status).toBe('ok')
    expect(health.message).toContain('FILLIP_ENABLE_NT')
  })

  it('fetchStations() throws NtApiUnverified when FILLIP_ENABLE_NT is set but FILLIP_NT_VERIFIED is not', async () => {
    process.env.FILLIP_ENABLE_NT = 'true'
    const provider = new NtFuelProvider()
    await expect(provider.fetchStations()).rejects.toThrow(NtApiUnverified)
  })

  it('fetchPrices() throws NtApiUnverified when FILLIP_ENABLE_NT is set but FILLIP_NT_VERIFIED is not', async () => {
    process.env.FILLIP_ENABLE_NT = 'true'
    const provider = new NtFuelProvider()
    await expect(provider.fetchPrices(new Date())).rejects.toThrow(NtApiUnverified)
  })

  it('healthCheck() returns down status when FILLIP_ENABLE_NT is set', async () => {
    process.env.FILLIP_ENABLE_NT = 'true'
    const provider = new NtFuelProvider()
    const health = await provider.healthCheck()
    expect(health.status).toBe('down')
    expect(health.message).toContain('Q4')
  })

  it('provider id is "nt" and displayName is set', () => {
    const provider = new NtFuelProvider()
    expect(provider.id).toBe('nt')
    expect(provider.displayName).toBe('NT MyFuel')
  })
})
