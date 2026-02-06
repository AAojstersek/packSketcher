import { describe, expect, it } from 'vitest'
import type { MoveItemsBulkConflict, MoveItemsBulkUndo } from '@/lib/rpc/items'
import {
  applyBulkMoveConflictRename,
  createBulkMoveConflictFlow,
  getCurrentBulkMoveConflict,
  isBulkMoveConflictFlowComplete,
  restoreItemsFromUndoSnapshot,
} from '@/lib/items/bulkMoveFlow'

describe('bulk move conflict flow', () => {
  it('orders conflicts alphabetically and advances one by one', () => {
    const conflicts: MoveItemsBulkConflict[] = [
      { itemId: '3', name: 'zeta', reason: 'name_conflict', message: '' },
      { itemId: '1', name: 'Alpha', reason: 'name_conflict', message: '' },
      { itemId: '2', name: 'beta', reason: 'name_conflict', message: '' },
    ]

    const start = createBulkMoveConflictFlow(conflicts)
    expect(start.conflicts.map((row) => row.name)).toEqual(['Alpha', 'beta', 'zeta'])
    expect(isBulkMoveConflictFlowComplete(start)).toBe(false)
    expect(getCurrentBulkMoveConflict(start)?.itemId).toBe('1')

    const afterFirst = applyBulkMoveConflictRename(start, 'Alpha 2')
    expect(afterFirst.nameOverrides).toEqual({ '1': 'Alpha 2' })
    expect(getCurrentBulkMoveConflict(afterFirst)?.itemId).toBe('2')

    const afterSecond = applyBulkMoveConflictRename(afterFirst, 'Beta 2')
    const afterThird = applyBulkMoveConflictRename(afterSecond, 'Zeta 2')
    expect(afterThird.nameOverrides).toEqual({
      '1': 'Alpha 2',
      '2': 'Beta 2',
      '3': 'Zeta 2',
    })
    expect(isBulkMoveConflictFlowComplete(afterThird)).toBe(true)
    expect(getCurrentBulkMoveConflict(afterThird)).toBeNull()
  })
})

describe('restoreItemsFromUndoSnapshot', () => {
  it('restores original names and bag locations from undo payload', () => {
    const movedItems = [
      { id: 'item-1', bag_id: 'bag-target', name: 'Renamed Tent', weight: 1.1 },
      { id: 'item-2', bag_id: 'bag-target', name: 'Stove', weight: 0.7 },
    ]
    const undoPayload: MoveItemsBulkUndo[] = [
      { itemId: 'item-1', fromBagId: 'bag-source', fromName: 'Tent' },
      { itemId: 'item-2', fromBagId: 'bag-source', fromName: 'Stove' },
    ]

    const restored = restoreItemsFromUndoSnapshot(movedItems, undoPayload)
    expect(restored).toEqual([
      { id: 'item-1', bag_id: 'bag-source', name: 'Tent', weight: 1.1 },
      { id: 'item-2', bag_id: 'bag-source', name: 'Stove', weight: 0.7 },
    ])
  })
})
