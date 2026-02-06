import type { MoveItemsBulkConflict, MoveItemsBulkUndo } from '@/lib/rpc/items'

export interface BulkMoveConflictFlow {
  conflicts: MoveItemsBulkConflict[]
  index: number
  nameOverrides: Record<string, string>
}

export interface UndoSnapshotItem {
  id: string
  bag_id: string
  name: string
}

export function createBulkMoveConflictFlow(
  conflicts: MoveItemsBulkConflict[],
  nameOverrides: Record<string, string> = {}
): BulkMoveConflictFlow {
  const ordered = [...conflicts].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    return left.itemId.localeCompare(right.itemId)
  })
  return {
    conflicts: ordered,
    index: 0,
    nameOverrides: { ...nameOverrides },
  }
}

export function getCurrentBulkMoveConflict(
  flow: BulkMoveConflictFlow
): MoveItemsBulkConflict | null {
  return flow.conflicts[flow.index] ?? null
}

export function isBulkMoveConflictFlowComplete(flow: BulkMoveConflictFlow): boolean {
  return flow.index >= flow.conflicts.length
}

export function applyBulkMoveConflictRename(
  flow: BulkMoveConflictFlow,
  nextName: string
): BulkMoveConflictFlow {
  const current = getCurrentBulkMoveConflict(flow)
  if (!current) return flow
  return {
    conflicts: flow.conflicts,
    index: flow.index + 1,
    nameOverrides: {
      ...flow.nameOverrides,
      [current.itemId]: nextName,
    },
  }
}

export function restoreItemsFromUndoSnapshot<T extends UndoSnapshotItem>(
  items: T[],
  undoPayload: MoveItemsBulkUndo[]
): T[] {
  const undoByItemId = new Map(undoPayload.map((row) => [row.itemId, row]))
  return items.map((item) => {
    const undo = undoByItemId.get(item.id)
    if (!undo) return item
    return {
      ...item,
      bag_id: undo.fromBagId,
      name: undo.fromName,
    }
  })
}
