import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDefaultSender } from '@/lib/email/sender'

describe('getDefaultSender', () => {
  let originalName: string | undefined
  let originalAddress: string | undefined
  beforeEach(() => {
    originalName = process.env.EMAIL_FROM_NAME
    originalAddress = process.env.EMAIL_FROM_ADDRESS
  })
  afterEach(() => {
    if (originalName === undefined) delete process.env.EMAIL_FROM_NAME
    else process.env.EMAIL_FROM_NAME = originalName
    if (originalAddress === undefined) delete process.env.EMAIL_FROM_ADDRESS
    else process.env.EMAIL_FROM_ADDRESS = originalAddress
  })

  it('returns Fillip defaults when env is unset', () => {
    delete process.env.EMAIL_FROM_NAME
    delete process.env.EMAIL_FROM_ADDRESS
    expect(getDefaultSender()).toEqual({
      name: 'Fillip',
      address: 'no-reply@fillip.local',
    })
  })

  it('honours env overrides when set', () => {
    process.env.EMAIL_FROM_NAME = 'Fillip Beta'
    process.env.EMAIL_FROM_ADDRESS = 'beta@fillip.clarily.au'
    expect(getDefaultSender()).toEqual({
      name: 'Fillip Beta',
      address: 'beta@fillip.clarily.au',
    })
  })
})
