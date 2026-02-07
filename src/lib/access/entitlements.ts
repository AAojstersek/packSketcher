import type { User } from '@supabase/supabase-js'
import type { AccessState } from '@/types'

const ACCESS_STATES: AccessState[] = [
  'no_access',
  'beta_access',
  'active_subscription',
  'past_due',
  'canceled',
]

function normalizeAccessState(value: unknown): AccessState {
  return typeof value === 'string' && ACCESS_STATES.includes(value as AccessState)
    ? (value as AccessState)
    : 'no_access'
}

interface EntitlementRpcClient {
  rpc: (
    fn: string,
    params: { p_user_id: string; p_email?: string | null }
  ) =>
    | PromiseLike<{ data: unknown; error: { message: string } | null }>
    | { data: unknown; error: { message: string } | null }
}

export async function getAccessState(
  client: EntitlementRpcClient,
  user: Pick<User, 'id' | 'email'>
): Promise<AccessState> {
  const { data, error } = await client.rpc('get_access_state', {
    p_user_id: user.id,
    p_email: user.email ?? null,
  })

  if (error) {
    return 'no_access'
  }

  return normalizeAccessState(data)
}

export async function hasAppAccess(
  client: EntitlementRpcClient,
  user: Pick<User, 'id' | 'email'>
): Promise<boolean> {
  const { data, error } = await client.rpc('has_app_access', {
    p_user_id: user.id,
    p_email: user.email ?? null,
  })

  if (error) {
    return false
  }

  if (typeof data === 'boolean') {
    return data
  }

  const state = normalizeAccessState(data)
  return state === 'beta_access' || state === 'active_subscription'
}

export function accessStateLabel(state: AccessState): string {
  switch (state) {
    case 'active_subscription':
      return 'Active subscription'
    case 'beta_access':
      return 'Beta access'
    case 'past_due':
      return 'Payment issue'
    case 'canceled':
      return 'Canceled'
    default:
      return 'No access'
  }
}
