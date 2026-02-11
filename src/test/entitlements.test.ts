import { describe, expect, it } from 'vitest'
import { accessStateLabel, getAccessState, hasAppAccess } from '@/lib/access/entitlements'

function createClient(data: unknown, error: { message: string } | null = null) {
  const calls: Array<{ fn: string; params: { p_user_id: string } }> = []

  return {
    calls,
    rpc: async (fn: string, params: { p_user_id: string }) => {
      calls.push({ fn, params })
      return { data, error }
    },
  }
}

const user = {
  id: 'user-1',
  email: 'user@example.com',
}

describe('entitlements helpers', () => {
  it('maps access state from RPC', async () => {
    const client = createClient('beta_access')
    const state = await getAccessState(client, user)

    expect(state).toBe('beta_access')
    expect(client.calls).toEqual([
      {
        fn: 'get_access_state',
        params: { p_user_id: user.id },
      },
    ])
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
    const client = createClient(true)
    const allowed = await hasAppAccess(client, user)

    expect(allowed).toBe(true)
    expect(client.calls).toEqual([
      {
        fn: 'has_app_access',
        params: { p_user_id: user.id },
      },
    ])
  })

  it('formats labels', () => {
    expect(accessStateLabel('active_subscription')).toBe('Active subscription')
    expect(accessStateLabel('no_access')).toBe('No access')
  })
})
