import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { swapBagZIndex } from '@/lib/rpc/bags'
import {
  moveItemsBulk,
  undoMoveItemsBulk,
  type MoveItemsBulkUndo,
} from '@/lib/rpc/items'

describe('swapBagZIndex', () => {
  let rpcMock: ReturnType<typeof vi.fn>
  let client: SupabaseClient

  beforeEach(() => {
    rpcMock = vi.fn()
    client = { rpc: rpcMock } as unknown as SupabaseClient
  })

  it('returns swapped=true on success', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const result = await swapBagZIndex(client, 'bag-1', 'forward')
    expect(result.swapped).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('swap_bag_z_index', {
      p_bag_id: 'bag-1',
      p_direction: 'forward',
    })
  })

  it('returns friendly error on failure', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Box not found' } })
    const result = await swapBagZIndex(client, 'bag-1', 'forward')
    expect(result.swapped).toBe(false)
    expect(result.error).toBe('Box not found')
  })
})

describe('moveItemsBulk helpers', () => {
  let rpcMock: ReturnType<typeof vi.fn>
  let client: SupabaseClient

  beforeEach(() => {
    rpcMock = vi.fn()
    client = { rpc: rpcMock } as unknown as SupabaseClient
  })

  it('maps conflicts and undo payload from RPC response', async () => {
    rpcMock.mockResolvedValue({
      data: {
        moved_count: 0,
        conflicts: [
          { item_id: '1', name: 'Pump', reason: 'name_conflict' },
          { item_id: '2', name: 'Pump', reason: 'duplicate_in_selection' },
        ],
        undo: [{ id: '1', from_bag_id: 'bag-a', from_name: 'Pump' }],
      },
      error: null,
    })

    const result = await moveItemsBulk(client, ['1', '2'], 'bag-b')

    expect(result.movedCount).toBe(0)
    expect(result.conflicts).toHaveLength(2)
    expect(result.conflicts[0].message).toContain('Target box already has an item named')
    expect(result.undo).toEqual([{ itemId: '1', fromBagId: 'bag-a', fromName: 'Pump' }])
  })

  it('returns friendly error on RPC failure', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } })
    const result = await moveItemsBulk(client, ['1'], 'bag-b')
    expect(result.error).toBe('Unauthorized')
    expect(result.movedCount).toBe(0)
  })

  it('falls back to undo length when moved_count is missing', async () => {
    rpcMock.mockResolvedValue({
      data: {
        conflicts: [],
        undo: [
          { id: '1', from_bag_id: 'bag-a', from_name: 'Pump' },
          { id: '2', from_bag_id: 'bag-a', from_name: 'Tube' },
        ],
      },
      error: null,
    })

    const result = await moveItemsBulk(client, ['1', '2'], 'bag-b')

    expect(result.movedCount).toBe(2)
    expect(result.undo).toEqual([
      { itemId: '1', fromBagId: 'bag-a', fromName: 'Pump' },
      { itemId: '2', fromBagId: 'bag-a', fromName: 'Tube' },
    ])
  })

  it('sends undo payload in expected format and maps response', async () => {
    rpcMock.mockResolvedValue({ data: { moved_count: 2, conflicts: [] }, error: null })
    const undoPayload: MoveItemsBulkUndo[] = [
      { itemId: '1', fromBagId: 'bag-a', fromName: 'Pump' },
      { itemId: '2', fromBagId: 'bag-a', fromName: 'Tube' },
    ]

    const result = await undoMoveItemsBulk(client, undoPayload)

    expect(rpcMock).toHaveBeenCalledWith('undo_move_items_bulk', {
      p_undo: [
        { id: '1', from_bag_id: 'bag-a', from_name: 'Pump' },
        { id: '2', from_bag_id: 'bag-a', from_name: 'Tube' },
      ],
    })
    expect(result.movedCount).toBe(2)
    expect(result.conflicts).toEqual([])
  })
})
