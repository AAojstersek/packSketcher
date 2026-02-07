import { describe, expect, it } from 'vitest'
import { accessStateLabel, getAccessState, hasAppAccess } from '@/lib/access/entitlements'

function createClient(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: async () => ({ data, error }),
  }
}

const user = {
  id: 'user-1',
  email: 'user@example.com',
}

describe('entitlements helpers', () => {
  it('maps access state from RPC', async () => {
    const state = await getAccessState(createClient('beta_access'), user)
    expect(state).toBe('beta_access')
  })

  it('falls back to no_access on bad payload', async () => {
    const state = await getAccessState(createClient('invalid_state'), user)
    expect(state).toBe('no_access')
  })

  it('returns false on hasAppAccess RPC error', async () => {
    const allowed = await hasAppAccess(createClient(null, { message: 'rpc failed' }), user)
    expect(allowed).toBe(false)
  })

  it('accepts explicit boolean true from has_app_access RPC', async () => {
    const allowed = await hasAppAccess(createClient(true), user)
    expect(allowed).toBe(true)
  })

  it('formats labels', () => {
    expect(accessStateLabel('active_subscription')).toBe('Active subscription')
    expect(accessStateLabel('no_access')).toBe('No access')
  })
})
