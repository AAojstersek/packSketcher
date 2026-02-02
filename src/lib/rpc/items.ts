import type { SupabaseClient } from '@supabase/supabase-js'

export type MoveItemsBulkConflictReason = 'duplicate_in_selection' | 'name_conflict' | 'unknown'

export interface MoveItemsBulkConflict {
  itemId: string
  name: string
  reason: MoveItemsBulkConflictReason
  message: string
}

export interface MoveItemsBulkUndo {
  itemId: string
  fromBagId: string
  fromName: string
}

export interface MoveItemsBulkResult {
  movedCount: number
  conflicts: MoveItemsBulkConflict[]
  undo: MoveItemsBulkUndo[]
  error?: string
}

export interface UndoMoveItemsBulkResult {
  movedCount: number
  conflicts: MoveItemsBulkConflict[]
  error?: string
}

/**
  * Move items via the move_items_bulk RPC and map conflicts into friendly messages.
  */
export async function moveItemsBulk(
  client: SupabaseClient,
  itemIds: string[],
  targetBagId: string,
  nameOverrides: Record<string, string> = {}
): Promise<MoveItemsBulkResult> {
  const { data, error } = await client.rpc('move_items_bulk', {
    p_item_ids: itemIds,
    p_target_bag_id: targetBagId,
    p_name_overrides: nameOverrides,
  })

  if (error) {
    return { movedCount: 0, conflicts: [], undo: [], error: friendlyMoveError(error.message) }
  }

  const row = extractFirstRow(data)
  return {
    movedCount: row?.moved_count ?? 0,
    conflicts: mapConflicts(row?.conflicts),
    undo: mapUndo(row?.undo),
  }
}

/**
  * Undo a previous bulk move using the undo payload returned by moveItemsBulk.
  */
export async function undoMoveItemsBulk(
  client: SupabaseClient,
  undoPayload: MoveItemsBulkUndo[]
): Promise<UndoMoveItemsBulkResult> {
  const rpcPayload = undoPayload.map((item) => ({
    id: item.itemId,
    from_bag_id: item.fromBagId,
    from_name: item.fromName,
  }))

  const { data, error } = await client.rpc('undo_move_items_bulk', { p_undo: rpcPayload })

  if (error) {
    return { movedCount: 0, conflicts: [], error: friendlyUndoError(error.message) }
  }

  const row = extractFirstRow(data)
  return {
    movedCount: row?.moved_count ?? 0,
    conflicts: mapConflicts(row?.conflicts),
  }
}

function extractFirstRow<T>(data: unknown): T | null {
  if (!data) return null
  if (Array.isArray(data)) {
    return (data[0] as T) ?? null
  }
  return data as T
}

function mapConflicts(conflicts: unknown): MoveItemsBulkConflict[] {
  if (!Array.isArray(conflicts)) return []

  return conflicts
    .map((conflict) => {
      const itemId = (conflict as any)?.item_id ?? (conflict as any)?.id
      const name = (conflict as any)?.name
      const reason = (conflict as any)?.reason as MoveItemsBulkConflictReason | undefined

      if (!itemId || !name) return null

      return {
        itemId,
        name,
        reason: normalizeReason(reason),
        message: conflictMessage(reason, name),
      }
    })
    .filter((c): c is MoveItemsBulkConflict => Boolean(c))
}

function mapUndo(undo: unknown): MoveItemsBulkUndo[] {
  if (!Array.isArray(undo)) return []
  return undo
    .map((entry) => {
      const itemId = (entry as any)?.id ?? (entry as any)?.item_id
      const fromBagId = (entry as any)?.from_bag_id
      const fromName = (entry as any)?.from_name
      if (!itemId || !fromBagId || !fromName) return null
      return {
        itemId,
        fromBagId,
        fromName,
      }
    })
    .filter((e): e is MoveItemsBulkUndo => Boolean(e))
}

function normalizeReason(reason?: MoveItemsBulkConflictReason): MoveItemsBulkConflictReason {
  if (reason === 'duplicate_in_selection') return 'duplicate_in_selection'
  if (reason === 'name_conflict') return 'name_conflict'
  return 'unknown'
}

function conflictMessage(reason: MoveItemsBulkConflictReason | undefined, name: string): string {
  if (reason === 'duplicate_in_selection') {
    return `Selected items include duplicate names after rename: "${name}".`
  }
  if (reason === 'name_conflict') {
    return `Target box already has an item named "${name}".`
  }
  return 'Unable to move item due to a conflict.'
}

function friendlyMoveError(message?: string): string {
  if (!message) return 'Unable to move items right now.'
  if (/not found/i.test(message)) return 'One or more items or target box were not found.'
  if (/invalid item name/i.test(message)) return 'Item names must be 1-60 characters.'
  if (/Unauthorized/i.test(message)) return 'Unauthorized'
  return 'Unable to move items right now.'
}

function friendlyUndoError(message?: string): string {
  if (!message) return 'Unable to undo move.'
  if (/conflict/i.test(message)) return 'Cannot undo because of name conflicts.'
  if (/not found/i.test(message)) return 'Items or boxes were not found for undo.'
  if (/Unauthorized/i.test(message)) return 'Unauthorized'
  return 'Unable to undo move.'
}
