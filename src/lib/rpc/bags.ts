import type { SupabaseClient } from '@supabase/supabase-js'

export type SwapDirection = 'forward' | 'backward'

export interface SwapBagZIndexResult {
  swapped: boolean
  error?: string
}

/**
 * Call swap_bag_z_index RPC to move a box one step forward/backward.
 */
export async function swapBagZIndex(
  client: SupabaseClient,
  bagId: string,
  direction: SwapDirection
): Promise<SwapBagZIndexResult> {
  const { data, error } = await client.rpc('swap_bag_z_index', {
    p_bag_id: bagId,
    p_direction: direction,
  })

  if (error) {
    return {
      swapped: false,
      error: friendlySwapError(error.message),
    }
  }

  return { swapped: Boolean(data) }
}

function friendlySwapError(message?: string): string {
  if (!message) return 'Unable to reorder box'
  if (/not found/i.test(message)) return 'Box not found'
  if (/invalid direction/i.test(message)) return 'Invalid direction'
  if (/Unauthorized/i.test(message)) return 'Unauthorized'
  return 'Unable to reorder box'
}
