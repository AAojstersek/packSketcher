'use client'

/**
 * DEV TEST CHECKLIST (manual):
 * - add item -> cancel
 * - edit item -> cancel
 * - delete item -> cancel
 * - add+edit+delete multiple -> save
 * - delete newly added item before save -> save (should not attempt DB delete)
 */

import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Bag, Item } from '@/types'
import { supabase } from '@/lib/supabase/browser'
import { friendlySupabaseMessage } from '@/lib/supabase/errorMapping'
import {
  moveItemsBulk,
  type MoveItemsBulkUndo,
  undoMoveItemsBulk,
} from '@/lib/rpc/items'
import {
  applyBulkMoveConflictRename,
  createBulkMoveConflictFlow,
  getCurrentBulkMoveConflict,
  isBulkMoveConflictFlowComplete,
  restoreItemsFromUndoSnapshot,
  type BulkMoveConflictFlow,
} from '@/lib/items/bulkMoveFlow'
import { pruneMultiSelectItems, toggleMultiSelectItem } from '@/lib/items/multiSelect'
import { normalizeBagName, normalizeBagWeightKg } from './bagDetailsValidation'
import { normalizeItemName, normalizeItemWeight } from './itemsValidation'
import { calculateDetailsTotals } from './detailsTotals'

type DraftItem = Item & {
  isNew: boolean
  isDirty: boolean
  isDeleted: boolean
}

function clampName60(value: string): string {
  return value.length > 60 ? value.slice(0, 60) : value
}

function formatItemWeightDisplay(weight: number | null): string {
  return weight == null || weight === 0 ? '' : String(weight)
}

function isNewItemId(id: string): boolean {
  return id.startsWith('temp-')
}

function draftItemsEqualPersisted(
  draft: DraftItem[],
  persisted: Item[]
): boolean {
  void persisted
  // Draft differs from DB state if any item has pending local changes.
  return !draft.some((i) => i.isNew || i.isDirty || i.isDeleted)
}

function formatKg(value: number): string {
  return `${Number(value.toFixed(3))} kg`
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

const SHOW_DEBUG = false
const SHOW_ITEM_WEIGHT = true

const DEFAULT_COLOR = '#888888'
const PRESET_COLORS = [
  { label: 'Gray', value: '#888888' },
  { label: 'Black', value: '#1a1a1a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Green', value: '#16a34a' },
]

type Draft = Pick<Bag, 'name' | 'color' | 'locked'> & { bag_weight_kg?: number }

interface MoveTargetOption {
  bagId: string
  boxName: string
  workspaceName: string
}

interface RawBagTargetRow {
  id?: string
  name?: string
  pack_id?: string
}

interface RawPackTargetRow {
  id?: string
  background_id?: string
}

interface RawWorkspaceTargetRow {
  id?: string
  name?: string
}

interface MoveConflictState {
  selectedIds: string[]
  targetBagId: string
  flow: BulkMoveConflictFlow
  renameValue: string
}

interface UndoToastState {
  movedCount: number
  undoPayload: MoveItemsBulkUndo[]
  movedSnapshot: DraftItem[]
}

function findDuplicateItemName(items: DraftItem[]): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.isDeleted) continue
    const normalized = normalizeItemName(item.name)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) return normalized
    seen.add(key)
  }
  return null
}

function draftEqualsBag(draft: Draft, bag: Bag): boolean {
  const draftKg = draft.bag_weight_kg ?? 0
  const bagKg = bag.bag_weight_kg ?? (bag.bag_weight != null ? bag.bag_weight / 1000 : 0)
  return (
    draft.name === bag.name &&
    draft.color === bag.color &&
    draftKg === bagKg &&
    draft.locked === bag.locked
  )
}

export interface DetailsPanelProps {
  bag: Bag | null
  isEditMode: boolean
  onClose: () => void
  onToggleEditMode: () => void
  onUpdateBag: (
    bagId: string,
    patch: Partial<Pick<Bag, 'name' | 'color' | 'locked'> & { bag_weight_kg?: number }>
  ) => void
  onSaveSuccess?: (bagRow: Bag) => void
  saveError?: string | null
  clearSaveError?: () => void
  enableEscapeClose?: boolean
  requestMoveItemsAction?: (action: () => Promise<void> | void) => void
}

export interface DetailsPanelHandle {
  hasUnsavedChanges: () => boolean
  saveChanges: () => Promise<boolean>
  discardChanges: () => Promise<boolean>
}

/**
 * Bag details side panel. In Edit mode: edits are held in local draft state;
 * click Save to persist via onUpdateBag, or Cancel to revert to the current bag.
 */
export const DetailsPanel = forwardRef<DetailsPanelHandle, DetailsPanelProps>(function DetailsPanel({
  bag,
  isEditMode,
  onClose,
  onToggleEditMode,
  onUpdateBag,
  onSaveSuccess,
  saveError = null,
  clearSaveError,
  enableEscapeClose = true,
  requestMoveItemsAction,
}, ref) {
  const readonly = !isEditMode

  const [draft, setDraft] = useState<Draft | null>(null)
  const [weightDisplay, setWeightDisplay] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [persistedItems, setPersistedItems] = useState<Item[]>([])
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [itemWeightDisplayById, setItemWeightDisplayById] = useState<Record<string, string>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null)
  const [itemsSaveError, setItemsSaveError] = useState<string | null>(null)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false)
  const [moveSuccessMessage, setMoveSuccessMessage] = useState<string | null>(null)
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedMoveItemIds, setSelectedMoveItemIds] = useState<string[]>([])
  const [moveTargetQuery, setMoveTargetQuery] = useState('')
  const [moveTargetBagId, setMoveTargetBagId] = useState<string | null>(null)
  const [moveTargetOptions, setMoveTargetOptions] = useState<MoveTargetOption[]>([])
  const [isLoadingMoveTargets, setIsLoadingMoveTargets] = useState(false)
  const [moveTargetsLoadError, setMoveTargetsLoadError] = useState<string | null>(null)
  const [isMovingItems, setIsMovingItems] = useState(false)
  const [moveConflictState, setMoveConflictState] = useState<MoveConflictState | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null)
  const [isUndoingMove, setIsUndoingMove] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const visibleItems = useMemo(
    () => draftItems.filter((item) => !item.isDeleted),
    [draftItems]
  )

  const isDirty = useMemo(() => {
    if (!bag || !draft) return false
    return (
      !draftEqualsBag(draft, bag) ||
      !draftItemsEqualPersisted(draftItems, persistedItems)
    )
  }, [bag, draft, draftItems, persistedItems])

  const displayColor =
    (draft?.color ?? bag?.color)?.trim() !== ''
      ? (draft?.color ?? bag?.color) ?? DEFAULT_COLOR
      : DEFAULT_COLOR
  const legacyBagWeight = bag?.bag_weight
  const fallbackBagWeightKg =
    bag?.bag_weight_kg ?? (legacyBagWeight != null ? legacyBagWeight / 1000 : 0)
  const effectiveBagWeightKg = draft?.bag_weight_kg ?? fallbackBagWeightKg
  const totals = useMemo(
    () => calculateDetailsTotals(effectiveBagWeightKg, draftItems),
    [effectiveBagWeightKg, draftItems]
  )
  const filteredMoveTargetOptions = useMemo(() => {
    const query = moveTargetQuery.trim().toLowerCase()
    if (!query) return moveTargetOptions
    return moveTargetOptions.filter((option) => {
      return (
        option.workspaceName.toLowerCase().includes(query) ||
        option.boxName.toLowerCase().includes(query)
      )
    })
  }, [moveTargetOptions, moveTargetQuery])
  const currentMoveConflict = moveConflictState
    ? getCurrentBulkMoveConflict(moveConflictState.flow)
    : null

  const reloadFromDb = useCallback(async (bagId: string) => {
    const [bagRes, itemsRes] = await Promise.all([
      supabase.from('bags').select('*').eq('id', bagId).single(),
      supabase
        .from('items')
        .select('*')
        .eq('bag_id', bagId)
        .order('created_at', { ascending: true }),
    ])
    if (bagRes.error) throw new Error(bagRes.error.message ?? 'Failed to reload bag')
    if (itemsRes.error) throw new Error(itemsRes.error.message ?? 'Failed to reload items')
    return {
      bagRow: bagRes.data as Bag,
      items: (itemsRes.data ?? []) as Item[],
    }
  }, [])

  // Initialize or reset draft when selected bag changes
  useEffect(() => {
    if (!bag) {
      setDraft(null)
      setWeightDisplay('')
      setValidationError(null)
      setPersistedItems([])
      setDraftItems([])
      setItemWeightDisplayById({})
      setExpandedItemId(null)
      setItemsLoadError(null)
      setItemsSaveError(null)
      setSaveSuccessMessage(false)
      setMoveSuccessMessage(null)
      setMoveTargetQuery('')
      setMoveTargetBagId(null)
      setMoveTargetOptions([])
      setMoveTargetsLoadError(null)
      setIsLoadingMoveTargets(false)
      setIsMultiSelectMode(false)
      setSelectedMoveItemIds([])
      setMoveConflictState(null)
      setIsUndoingMove(false)
      setUndoToast(null)
      if (undoToastTimeoutRef.current) {
        clearTimeout(undoToastTimeoutRef.current)
        undoToastTimeoutRef.current = null
      }
      return
    }
    const initialKg =
      bag.bag_weight_kg ?? (bag.bag_weight != null ? bag.bag_weight / 1000 : 0)
    setDraft({
      name: bag.name,
      color: bag.color ?? '',
      bag_weight_kg: initialKg,
      locked: bag.locked,
    })
    setWeightDisplay(String(initialKg))
    setValidationError(null)
    setItemsLoadError(null)
    setItemsSaveError(null)
    setSaveSuccessMessage(false)
    setMoveSuccessMessage(null)
    setMoveTargetQuery('')
    setMoveTargetBagId(null)
    setMoveTargetOptions([])
    setMoveTargetsLoadError(null)
    setIsLoadingMoveTargets(false)
    setIsMultiSelectMode(false)
    setSelectedMoveItemIds([])
    setMoveConflictState(null)
    setIsUndoingMove(false)
    setUndoToast(null)
    if (undoToastTimeoutRef.current) {
      clearTimeout(undoToastTimeoutRef.current)
      undoToastTimeoutRef.current = null
    }
  }, [bag?.id])

  // Load items and current user when bag is set
  useEffect(() => {
    if (!bag) return
    let cancelled = false
    setItemsLoadError(null)
    ;(async () => {
      try {
        const [userRes, itemsRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('items')
            .select('*')
            .eq('bag_id', bag.id)
            .order('created_at', { ascending: true }),
        ])
        if (cancelled) return
        if (userRes.data?.user?.id) setCurrentUserId(userRes.data.user.id)
        const err = itemsRes.error
        if (err) {
          setItemsLoadError(err.message ?? 'Failed to load items')
          setPersistedItems([])
          setDraftItems([])
          setItemWeightDisplayById({})
          setExpandedItemId(null)
          return
        }
        const list = (itemsRes.data ?? []) as Item[]
        setPersistedItems(list)
        setDraftItems(list.map((i) => ({ ...i, isNew: false, isDirty: false, isDeleted: false })))
        setItemWeightDisplayById(
          Object.fromEntries(list.map((i) => [i.id, formatItemWeightDisplay(i.weight)]))
        )
        setExpandedItemId(null)
      } catch (e) {
        if (!cancelled) {
          setItemsLoadError(e instanceof Error ? e.message : 'Failed to load items')
          setPersistedItems([])
          setDraftItems([])
          setItemWeightDisplayById({})
          setExpandedItemId(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bag?.id])

  // Load target boxes for bulk move (exclude current box).
  useEffect(() => {
    if (!bag) return
    let cancelled = false
    setMoveTargetsLoadError(null)
    setIsLoadingMoveTargets(true)

    ;(async () => {
      try {
        const bagsRes = await supabase
          .from('bags')
          .select('id,name,pack_id')
          .order('name', { ascending: true })
        if (bagsRes.error) {
          throw new Error(friendlySupabaseMessage(bagsRes.error, 'Failed to load boxes'))
        }

        const allBags = (bagsRes.data ?? []) as RawBagTargetRow[]
        const targetBags = allBags.filter(
          (row) => row.id != null && row.id !== bag.id
        )
        const packIds = Array.from(
          new Set(
            targetBags
              .map((row) => row.pack_id)
              .filter((packId): packId is string => typeof packId === 'string' && packId.length > 0)
          )
        )

        const workspaceByPackId = new Map<string, string>()
        if (packIds.length > 0) {
          const packsRes = await supabase
            .from('packs')
            .select('id,background_id')
            .in('id', packIds)
          if (packsRes.error) {
            throw new Error(friendlySupabaseMessage(packsRes.error, 'Failed to load workspaces'))
          }
          const packs = (packsRes.data ?? []) as RawPackTargetRow[]

          const workspaceIds = Array.from(
            new Set(
              packs
                .map((row) => row.background_id)
                .filter((workspaceId): workspaceId is string => typeof workspaceId === 'string' && workspaceId.length > 0)
            )
          )
          const workspaceNameById = new Map<string, string>()
          if (workspaceIds.length > 0) {
            const workspacesRes = await supabase
              .from('backgrounds')
              .select('id,name')
              .in('id', workspaceIds)
            if (workspacesRes.error) {
              throw new Error(
                friendlySupabaseMessage(workspacesRes.error, 'Failed to load workspace names')
              )
            }
            const workspaces = (workspacesRes.data ?? []) as RawWorkspaceTargetRow[]
            for (const workspace of workspaces) {
              if (!workspace.id) continue
              workspaceNameById.set(workspace.id, workspace.name ?? 'Workspace')
            }
          }

          for (const pack of packs) {
            if (!pack.id) continue
            const workspaceName = pack.background_id
              ? workspaceNameById.get(pack.background_id)
              : null
            workspaceByPackId.set(pack.id, workspaceName ?? 'Workspace')
          }
        }

        if (cancelled) return
        const options = targetBags
          .map((row) => ({
            bagId: row.id as string,
            boxName: row.name?.trim() || 'Untitled box',
            workspaceName: row.pack_id ? workspaceByPackId.get(row.pack_id) ?? 'Workspace' : 'Workspace',
          }))
          .sort((a, b) => {
            const workspaceCmp = a.workspaceName.localeCompare(b.workspaceName)
            if (workspaceCmp !== 0) return workspaceCmp
            return a.boxName.localeCompare(b.boxName)
          })

        setMoveTargetOptions(options)
        setMoveTargetBagId((prev) => {
          if (prev && options.some((option) => option.bagId === prev)) return prev
          return options[0]?.bagId ?? null
        })
      } catch (e) {
        if (cancelled) return
        setMoveTargetOptions([])
        setMoveTargetBagId(null)
        setMoveTargetsLoadError(e instanceof Error ? e.message : 'Failed to load target boxes')
      } finally {
        if (!cancelled) setIsLoadingMoveTargets(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bag?.id])

  useEffect(() => {
    setSelectedMoveItemIds((previous) =>
      pruneMultiSelectItems(
        previous,
        visibleItems.map((item) => item.id)
      )
    )
  }, [visibleItems])


  // Clear save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current)
      if (moveSuccessTimeoutRef.current) clearTimeout(moveSuccessTimeoutRef.current)
      if (undoToastTimeoutRef.current) clearTimeout(undoToastTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isDirty && !validationError && !itemsSaveError) return
    setSaveSuccessMessage(false)
  }, [isDirty, validationError, itemsSaveError])

  // Escape key closes the panel
  useEffect(() => {
    if (!enableEscapeClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enableEscapeClose, onClose])

  // When switching to Edit mode and bag exists, focus the Bag name input
  useEffect(() => {
    if (!isEditMode || !bag) return
    const id = requestAnimationFrame(() => nameInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [isEditMode, bag])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!bag || !draft) return
    // Important: do not trim while typing, otherwise Space "doesn't work"
    // when trying to start a new word (trailing space gets removed immediately).
    const value = clampName60(e.target.value)
    setDraft((prev) => (prev ? { ...prev, name: value } : null))
    setValidationError(null)
    clearSaveError?.()
  }

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!bag || !draft) return
    const raw = e.target.value
    setWeightDisplay(raw)
    const value = normalizeBagWeightKg(raw)
    setDraft((prev) => (prev ? { ...prev, bag_weight_kg: value } : null))
    setValidationError(null)
    clearSaveError?.()
  }

  const handleWeightBlur = () => {
    const value = normalizeBagWeightKg(weightDisplay)
    setWeightDisplay(String(value))
    if (draft) setDraft((prev) => (prev ? { ...prev, bag_weight_kg: value } : null))
  }

  const handleColorChange = (color: string) => {
    if (!bag || !draft) return
    setDraft((prev) => (prev ? { ...prev, color } : null))
    setValidationError(null)
    clearSaveError?.()
  }

  const handleLockedChange = () => {
    if (!bag || !draft) return
    setDraft((prev) => (prev ? { ...prev, locked: !prev.locked } : null))
    setValidationError(null)
    clearSaveError?.()
  }

  const handleAddItem = useCallback(() => {
    if (!bag) return
    const now = new Date().toISOString()
    const newItem: DraftItem = {
      id: `temp-${Date.now()}`,
      bag_id: bag.id,
      user_id: currentUserId ?? '',
      name: '',
      description: null,
      weight: 0,
      created_at: now,
      updated_at: now,
      isNew: true,
      isDirty: true,
      isDeleted: false,
    }
    setDraftItems((prev) => [...prev, newItem])
    setItemWeightDisplayById((prev) => ({ ...prev, [newItem.id]: '' }))
    setExpandedItemId(newItem.id)
    setValidationError(null)
    setItemsSaveError(null)
    clearSaveError?.()
  }, [bag, currentUserId, clearSaveError])

  const handleUpdateItem = useCallback(
    (id: string, patch: Partial<Pick<Item, 'name' | 'weight' | 'description'>>) => {
      setDraftItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(patch.name !== undefined && {
                  // Same reasoning as bag name: keep spaces while typing;
                  // trim only on save before persisting.
                  name: clampName60(patch.name),
                }),
                ...(patch.weight !== undefined && {
                  weight: normalizeItemWeight(patch.weight),
                }),
                ...(patch.description !== undefined && {
                  description: patch.description,
                }),
                ...(patch.name !== undefined ||
                patch.weight !== undefined ||
                patch.description !== undefined
                  ? { isDirty: true }
                  : null),
              }
            : i
        )
      )
      setValidationError(null)
      setItemsSaveError(null)
      clearSaveError?.()
    },
    [clearSaveError]
  )

  const handleMarkItemDeleted = useCallback((id: string) => {
    setDraftItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isDeleted: true } : i))
    )
    setValidationError(null)
    setItemsSaveError(null)
    clearSaveError?.()
  }, [clearSaveError])

  const handleToggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((previous) => !previous)
    setSelectedMoveItemIds([])
    setExpandedItemId(null)
    setValidationError(null)
    setItemsSaveError(null)
    setMoveSuccessMessage(null)
    setMoveConflictState(null)
    clearSaveError?.()
  }, [clearSaveError])

  const handleToggleMoveSelection = useCallback(
    (itemId: string) => {
      if (isSaving || isMovingItems || isUndoingMove) return
      if (isNewItemId(itemId)) {
        setValidationError('Save changes before moving newly added items.')
        return
      }
      setValidationError(null)
      setItemsSaveError(null)
      setMoveSuccessMessage(null)
      setMoveConflictState(null)
      clearSaveError?.()
      setSelectedMoveItemIds((previous) => toggleMultiSelectItem(previous, itemId))
    },
    [clearSaveError, isMovingItems, isSaving, isUndoingMove]
  )

  const applyLoadedItems = useCallback((items: Item[]) => {
    setPersistedItems(items)
    setDraftItems(items.map((item) => ({ ...item, isNew: false, isDirty: false, isDeleted: false })))
    setItemWeightDisplayById(
      Object.fromEntries(items.map((item) => [item.id, formatItemWeightDisplay(item.weight)]))
    )
  }, [])

  const dismissUndoToast = useCallback(() => {
    if (undoToastTimeoutRef.current) {
      clearTimeout(undoToastTimeoutRef.current)
      undoToastTimeoutRef.current = null
    }
    setUndoToast(null)
  }, [])

  const runMoveAttempt = useCallback(
    async (
      selectedIds: string[],
      targetBagId: string,
      nameOverrides: Record<string, string> = {}
    ) => {
      if (!bag) return
      setValidationError(null)
      setItemsSaveError(null)
      setMoveSuccessMessage(null)
      clearSaveError?.()
      setIsMovingItems(true)
      try {
        const movedSnapshot = draftItems.filter((item) => selectedIds.includes(item.id))
        const result = await moveItemsBulk(supabase, selectedIds, targetBagId, nameOverrides)

        if (result.error) {
          setItemsSaveError(result.error)
          return
        }
        if (result.conflicts.length > 0) {
          const flow = createBulkMoveConflictFlow(result.conflicts, nameOverrides)
          const firstConflict = getCurrentBulkMoveConflict(flow)
          setMoveConflictState({
            selectedIds,
            targetBagId,
            flow,
            renameValue: firstConflict?.name ?? '',
          })
          return
        }
        if (result.movedCount <= 0) {
          setItemsSaveError('No items were moved.')
          return
        }

        const movedSet = new Set(selectedIds)
        setPersistedItems((previous) => previous.filter((item) => !movedSet.has(item.id)))
        setDraftItems((previous) => previous.filter((item) => !movedSet.has(item.id)))
        setItemWeightDisplayById((previous) => {
          const next = { ...previous }
          for (const id of movedSet) {
            delete next[id]
          }
          return next
        })
        setSelectedMoveItemIds([])
        setMoveConflictState(null)
        setExpandedItemId((previous) => {
          if (!previous || !movedSet.has(previous)) return previous
          return null
        })
        setMoveSuccessMessage(`${result.movedCount} item${result.movedCount === 1 ? '' : 's'} moved.`)
        if (moveSuccessTimeoutRef.current) clearTimeout(moveSuccessTimeoutRef.current)
        moveSuccessTimeoutRef.current = setTimeout(() => {
          moveSuccessTimeoutRef.current = null
          setMoveSuccessMessage(null)
        }, 1800)

        dismissUndoToast()
        setUndoToast({
          movedCount: result.movedCount,
          undoPayload: result.undo,
          movedSnapshot,
        })
        undoToastTimeoutRef.current = setTimeout(() => {
          undoToastTimeoutRef.current = null
          setUndoToast(null)
        }, 10_000)
      } catch (e) {
        setItemsSaveError(e instanceof Error ? e.message : 'Failed to move selected items.')
      } finally {
        setIsMovingItems(false)
      }
    },
    [bag, clearSaveError, dismissUndoToast, draftItems]
  )

  const handleMoveSelected = useCallback(() => {
    if (!bag) return
    if (isMovingItems || isUndoingMove) return
    const selectedIds = selectedMoveItemIds.filter((id) => !isNewItemId(id))
    if (selectedIds.length === 0) {
      setValidationError('Select at least one item to move.')
      return
    }
    if (!moveTargetBagId) {
      setValidationError('Select a target box.')
      return
    }
    setMoveConflictState(null)
    const execute = () => {
      void runMoveAttempt(selectedIds, moveTargetBagId)
    }

    if (requestMoveItemsAction) {
      requestMoveItemsAction(execute)
      return
    }
    if (isDirty) {
      setValidationError('Save or discard changes before moving items.')
      return
    }
    execute()
  }, [
    bag,
    isDirty,
    isMovingItems,
    isUndoingMove,
    moveTargetBagId,
    requestMoveItemsAction,
    runMoveAttempt,
    selectedMoveItemIds,
  ])

  const handleMoveConflictCancel = useCallback(() => {
    setMoveConflictState(null)
  }, [])

  const handleMoveConflictConfirm = useCallback(() => {
    if (!moveConflictState || !currentMoveConflict || isMovingItems || isUndoingMove) return
    const nextName = normalizeItemName(moveConflictState.renameValue)
    if (!nextName) {
      setValidationError('Conflict rename requires a non-empty name.')
      return
    }

    const nextFlow = applyBulkMoveConflictRename(moveConflictState.flow, nextName)
    if (isBulkMoveConflictFlowComplete(nextFlow)) {
      setMoveConflictState(null)
      void runMoveAttempt(
        moveConflictState.selectedIds,
        moveConflictState.targetBagId,
        nextFlow.nameOverrides
      )
      return
    }

    const nextConflict = getCurrentBulkMoveConflict(nextFlow)
    setMoveConflictState({
      ...moveConflictState,
      flow: nextFlow,
      renameValue: nextConflict?.name ?? '',
    })
  }, [currentMoveConflict, isMovingItems, isUndoingMove, moveConflictState, runMoveAttempt])

  const handleUndoMove = useCallback(async () => {
    if (!bag || !undoToast || isUndoingMove || isMovingItems) return
    setValidationError(null)
    setItemsSaveError(null)
    setIsUndoingMove(true)
    try {
      const result = await undoMoveItemsBulk(supabase, undoToast.undoPayload)
      if (result.error) {
        setItemsSaveError(result.error)
        return
      }
      if (result.conflicts.length > 0) {
        setItemsSaveError(result.conflicts[0]?.message ?? 'Unable to undo move.')
        return
      }
      if (result.movedCount <= 0) {
        setItemsSaveError('Undo did not move any items.')
        return
      }

      const restored = restoreItemsFromUndoSnapshot(undoToast.movedSnapshot, undoToast.undoPayload)
        .filter((item) => item.bag_id === bag.id)
      const restoredMap = new Map(restored.map((item) => [item.id, item]))

      setPersistedItems((previous) => {
        const merged = [...previous]
        for (const item of restoredMap.values()) {
          if (merged.some((row) => row.id === item.id)) continue
          merged.push(item)
        }
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at))
        return merged
      })

      setDraftItems((previous) => {
        const merged = [...previous]
        for (const item of restoredMap.values()) {
          if (merged.some((row) => row.id === item.id)) continue
          merged.push({ ...item, isNew: false, isDirty: false, isDeleted: false })
        }
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at))
        return merged
      })

      setItemWeightDisplayById((previous) => {
        const next = { ...previous }
        for (const item of restoredMap.values()) {
          next[item.id] = formatItemWeightDisplay(item.weight)
        }
        return next
      })
      setExpandedItemId(null)
      setSelectedMoveItemIds([])
      setMoveSuccessMessage('Move undone.')
      dismissUndoToast()
    } catch (e) {
      setItemsSaveError(e instanceof Error ? e.message : 'Failed to undo move.')
    } finally {
      setIsUndoingMove(false)
    }
  }, [bag, dismissUndoToast, isMovingItems, isUndoingMove, undoToast])

  const handleSave = async (): Promise<boolean> => {
    if (!bag || !draft) return false
    if (isSaving) return false
    if (!isDirty) return true
    setValidationError(null)
    setItemsSaveError(null)
    setSaveSuccessMessage(false)
    clearSaveError?.()
    const name = normalizeBagName(draft.name)
    if (!name) {
      setValidationError('Bag name is required')
      return false
    }
    const invalidItemIndex = draftItems.findIndex(
      (item) => !item.isDeleted && normalizeItemName(item.name) === ''
    )
    if (invalidItemIndex !== -1) {
      setValidationError(`Item ${invalidItemIndex + 1} name is required`)
      return false
    }
    const duplicateItemName = findDuplicateItemName(draftItems)
    if (duplicateItemName) {
      setValidationError(`Duplicate item name: "${duplicateItemName}"`)
      return false
    }
    const bag_weight_kg = normalizeBagWeightKg(weightDisplay)
    const patch: Draft = {
      name,
      color: draft.color ?? '',
      bag_weight_kg,
      locked: draft.locked,
    }
    setDraft((prev) => (prev ? { ...prev, ...patch } : null))
    setWeightDisplay(String(bag_weight_kg))
    setIsSaving(true)
    try {
      const p_item_ids_delete = draftItems
        .filter((i) => i.isDeleted && !i.isNew)
        .map((i) => i.id)

      const p_items_upsert = draftItems
        .filter((i) => !i.isDeleted && (i.isNew || i.isDirty))
        .map((i) => ({
          ...(i.isNew ? {} : { id: i.id }),
          name: normalizeItemName(i.name),
          description: i.description ?? null,
          weight: normalizeItemWeight(i.weight),
        }))

      // Atomic save: bag patch + items upsert/delete in one DB transaction.
      const { error: rpcErr } = await supabase.rpc('save_bag_details', {
        p_bag_id: bag.id,
        p_bag_patch: patch,
        p_items_upsert,
        p_item_ids_delete,
      })
      if (rpcErr) {
        setItemsSaveError(friendlySupabaseMessage(rpcErr, 'Failed to save'))
        return false
      }

      // Single reload after save: reflect DB state and clear dirty flags.
      const { bagRow, items } = await reloadFromDb(bag.id)
      const kg =
        bagRow.bag_weight_kg ?? (bagRow.bag_weight != null ? bagRow.bag_weight / 1000 : 0)
      setDraft({
        name: bagRow.name,
        color: bagRow.color ?? '',
        bag_weight_kg: kg,
        locked: bagRow.locked,
      })
      setWeightDisplay(String(kg))
      applyLoadedItems(items)
      setExpandedItemId(null)
      setSelectedMoveItemIds([])
      onSaveSuccess?.(bagRow)
      setSaveSuccessMessage(true)
      if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current)
      saveSuccessTimeoutRef.current = setTimeout(() => {
        saveSuccessTimeoutRef.current = null
        setSaveSuccessMessage(false)
      }, 1800)
      return true
    } catch (e) {
      setSaveSuccessMessage(false)
      setItemsSaveError(
        e instanceof Error ? e.message : 'Failed to save items'
      )
      return false
    } finally {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        setIsSaving(false)
      }, 500)
    }
  }

  const handleCancel = async (): Promise<boolean> => {
    if (!bag) return false
    if (isSaving) return false
    if (!isDirty) return true
    setValidationError(null)
    setItemsSaveError(null)
    setItemsLoadError(null)
    setSaveSuccessMessage(false)
    clearSaveError?.()
    setIsSaving(true)
    try {
      const { bagRow, items } = await reloadFromDb(bag.id)
      const kg =
        bagRow.bag_weight_kg ?? (bagRow.bag_weight != null ? bagRow.bag_weight / 1000 : 0)
      setDraft({
        name: bagRow.name,
        color: bagRow.color ?? '',
        bag_weight_kg: kg,
        locked: bagRow.locked,
      })
      setWeightDisplay(String(kg))
      applyLoadedItems(items)
      setExpandedItemId(null)
      setSelectedMoveItemIds([])
      return true
    } catch (e) {
      setItemsLoadError(e instanceof Error ? e.message : 'Failed to reload')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      hasUnsavedChanges: () => isDirty,
      saveChanges: handleSave,
      discardChanges: handleCancel,
    }),
    [handleCancel, handleSave, isDirty]
  )

  const canSave =
    isEditMode && bag && draft && isDirty && !isSaving && !validationError

  return (
    <div
      className="fixed right-0 top-0 h-[100dvh] w-72 z-20 flex flex-col border-l border-slate-200 bg-white shadow-xl"
      data-details-panel
    >
      <header className="flex-none p-3 pt-10">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900 truncate">Bag details</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onToggleEditMode}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        {saveSuccessMessage && (
          <div className="mb-2 text-xs text-emerald-600">Saved</div>
        )}
        {moveSuccessMessage && (
          <div className="mb-2 text-xs text-emerald-600">{moveSuccessMessage}</div>
        )}
        {undoToast && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <div className="flex items-center justify-between gap-2">
              <span>
                Moved {undoToast.movedCount} item{undoToast.movedCount === 1 ? '' : 's'}.
              </span>
              <button
                type="button"
                className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60"
                onClick={() => {
                  void handleUndoMove()
                }}
                disabled={isUndoingMove || isMovingItems}
              >
                {isUndoingMove ? 'Undoing…' : 'Undo'}
              </button>
            </div>
          </div>
        )}
        {(saveError || validationError || itemsLoadError || itemsSaveError) && (
          <div className="mb-2 text-xs text-red-600" role="alert">
            {validationError ??
              saveError ??
              itemsSaveError ??
              itemsLoadError}
          </div>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 pt-0">
        <dl className="space-y-2 text-sm text-slate-700">
        {SHOW_DEBUG && (
          <>
            <div>
              <dt className="text-sm font-medium text-slate-900">id</dt>
              <dd className="font-mono truncate text-slate-700">{bag?.id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-900">pack_id</dt>
              <dd className="font-mono truncate text-slate-700">{bag?.pack_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-900">x</dt>
              <dd className="text-slate-700">{bag != null ? bag.x : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-900">y</dt>
              <dd className="text-slate-700">{bag != null ? bag.y : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-900">width</dt>
              <dd className="text-slate-700">{bag != null ? bag.width : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-900">height</dt>
              <dd className="text-slate-700">{bag != null ? bag.height : '—'}</dd>
            </div>
          </>
        )}

        {bag != null && draft != null && (
          <>
            {/* Bag name + weight on one row */}
            <div>
              <dt className="sr-only">Bag name and weight</dt>
              <dd className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="details-bag-name" className="block text-xs font-medium text-slate-500 mb-0.5">Bag name</label>
                  <input
                    id="details-bag-name"
                    ref={nameInputRef}
                    type="text"
                    className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                    maxLength={60}
                    value={draft.name}
                    onChange={handleNameChange}
                    disabled={readonly || isSaving}
                  />
                </div>
                <div className="w-20 shrink-0">
                  <label htmlFor="details-bag-weight" className="block text-xs font-medium text-slate-500 mb-0.5">kg</label>
                  <input
                    id="details-bag-weight"
                    type="text"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                    placeholder="0"
                    value={weightDisplay}
                    onChange={handleWeightChange}
                    onBlur={handleWeightBlur}
                    disabled={readonly || isSaving}
                  />
                </div>
              </dd>
            </div>
            {/* Color: small circles */}
            <div>
              <dt className="text-xs font-medium text-slate-500 mb-1">Color</dt>
              <dd className="flex flex-wrap gap-1.5 items-center">
                {PRESET_COLORS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    className="h-6 w-6 rounded-full border border-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:ring-offset-1 disabled:pointer-events-none disabled:opacity-50"
                    style={{
                      backgroundColor: value,
                      ...(displayColor.toLowerCase() === value.toLowerCase()
                        ? { boxShadow: '0 0 0 2px white, 0 0 0 3px #94a3b8' }
                        : {}),
                    }}
                    title={label}
                    onClick={() => handleColorChange(value)}
                    disabled={readonly || isSaving}
                    aria-pressed={displayColor.toLowerCase() === value.toLowerCase()}
                  />
                ))}
                <input
                  type="color"
                  className="h-6 w-6 rounded-full cursor-pointer border border-slate-200 disabled:pointer-events-none disabled:opacity-50 overflow-hidden"
                  value={displayColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  disabled={readonly || isSaving}
                  aria-label="Custom color"
                />
              </dd>
            </div>

            {/* Items */}
            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <dt className="text-sm font-medium text-slate-900">Items</dt>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                    onClick={handleToggleMultiSelectMode}
                    disabled={
                      isSaving ||
                      isMovingItems ||
                      isUndoingMove ||
                      moveConflictState != null ||
                      (!isMultiSelectMode && visibleItems.length === 0)
                    }
                  >
                    {isMultiSelectMode ? 'Done selecting' : 'Multi-select'}
                  </button>
                  {isEditMode && (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                      onClick={handleAddItem}
                      disabled={isSaving || isMovingItems || isUndoingMove || isMultiSelectMode || moveConflictState != null}
                    >
                      + Item
                    </button>
                  )}
                </div>
              </div>
              <dd className="space-y-3">
                {visibleItems
                  .map((item) => {
                    const isExpanded = isEditMode && !isMultiSelectMode && expandedItemId === item.id
                    const isCollapsed = readonly || isMultiSelectMode || !isExpanded
                    const isSelectedForMove = selectedMoveItemIds.includes(item.id)
                    const collapsedProps = isMultiSelectMode
                      ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          className:
                            `rounded-xl border py-2 px-3 shadow-sm cursor-pointer ${
                              isSelectedForMove
                                ? 'border-slate-500 bg-slate-100'
                                : 'border-slate-200 bg-slate-50/80'
                            }`,
                          onClick: () => handleToggleMoveSelection(item.id),
                          onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleToggleMoveSelection(item.id)
                            }
                          },
                          'aria-pressed': isSelectedForMove,
                        }
                      : isEditMode
                        ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          className:
                            'rounded-xl border border-slate-200 bg-slate-50/80 py-2 px-3 shadow-sm cursor-pointer',
                          onClick: () => setExpandedItemId(item.id),
                          onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setExpandedItemId(item.id)
                            }
                          },
                        }
                      : {
                          className:
                            'rounded-xl border border-slate-200 bg-slate-50/80 py-2 px-3 shadow-sm',
                        }
                    return isCollapsed ? (
                      <div key={item.id} {...collapsedProps}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {item.name || 'Untitled'}
                          </span>
                          {isMultiSelectMode && (
                            <span
                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] font-semibold ${
                                isSelectedForMove
                                  ? 'border-slate-600 bg-slate-700 text-white'
                                  : 'border-slate-300 bg-white text-slate-500'
                              }`}
                              aria-hidden="true"
                            >
                              {isSelectedForMove ? '✓' : ''}
                            </span>
                          )}
                          {!isMultiSelectMode && SHOW_ITEM_WEIGHT && (item.weight ?? 0) > 0 && (
                            <span className="shrink-0 text-xs text-slate-500">
                              {item.weight} kg
                            </span>
                          )}
                        </div>
                        {item.description != null &&
                          item.description.trim() !== '' && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                              {item.description}
                            </p>
                          )}
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                            placeholder="Name"
                            maxLength={60}
                            value={item.name}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                name: e.target.value,
                              })
                            }
                            disabled={readonly || isSaving}
                          />
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
                            title="Delete item"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMarkItemDeleted(item.id)
                            }}
                            disabled={isSaving}
                            aria-label="Delete item"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                            placeholder="kg"
                            value={itemWeightDisplayById[item.id] ?? ''}
                            onChange={(e) =>
                              setItemWeightDisplayById((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              const parsed = normalizeItemWeight(
                                itemWeightDisplayById[item.id] ?? ''
                              )
                              handleUpdateItem(item.id, { weight: parsed })
                              setItemWeightDisplayById((prev) => ({
                                ...prev,
                                [item.id]:
                                  parsed == null || parsed === 0 ? '' : String(parsed),
                              }))
                            }}
                            disabled={readonly || isSaving}
                          />
                          <span className="text-xs text-slate-500">kg</span>
                        </div>
                        <textarea
                          className="min-h-[48px] w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                          placeholder="Description (optional)"
                          value={item.description ?? ''}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              description:
                                e.target.value.trim() === ''
                                  ? null
                                  : e.target.value,
                            })
                          }
                          disabled={readonly || isSaving}
                        />
                      </div>
                    )
                  })}
                {visibleItems.length === 0 && (
                  <p className="text-xs text-slate-600">No items</p>
                )}
              </dd>
              {isMultiSelectMode && (
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Selected: {selectedMoveItemIds.length}</span>
                    {moveTargetsLoadError && (
                      <span className="text-red-600" role="alert">
                        {moveTargetsLoadError}
                      </span>
                    )}
                  </div>
                  <label htmlFor="move-target-search" className="block text-xs font-medium text-slate-500">
                    Target (Workspace / Box)
                  </label>
                  <input
                    id="move-target-search"
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                    placeholder="Search workspace or box"
                    value={moveTargetQuery}
                    onChange={(event) => setMoveTargetQuery(event.target.value)}
                    disabled={isSaving || isMovingItems || isUndoingMove || isLoadingMoveTargets || moveConflictState != null}
                  />
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                    {isLoadingMoveTargets && (
                      <p className="px-2 py-1 text-xs text-slate-500">Loading targets…</p>
                    )}
                    {!isLoadingMoveTargets && filteredMoveTargetOptions.length === 0 && (
                      <p className="px-2 py-1 text-xs text-slate-500">No matching boxes</p>
                    )}
                    {!isLoadingMoveTargets &&
                      filteredMoveTargetOptions.map((option) => (
                        <button
                          key={option.bagId}
                          type="button"
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                            moveTargetBagId === option.bagId
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                          onClick={() => setMoveTargetBagId(option.bagId)}
                          disabled={isSaving || isMovingItems || isUndoingMove || moveConflictState != null}
                        >
                          {option.workspaceName} / {option.boxName}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleMoveSelected}
                    disabled={
                      isSaving ||
                      isMovingItems ||
                      isUndoingMove ||
                      moveConflictState != null ||
                      isLoadingMoveTargets ||
                      selectedMoveItemIds.length === 0 ||
                      moveTargetBagId == null
                    }
                  >
                    {isMovingItems ? 'Moving…' : 'Move selected'}
                  </button>
                  {moveConflictState && currentMoveConflict && (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                      <p className="text-xs text-amber-900">
                        Conflict {moveConflictState.flow.index + 1}/{moveConflictState.flow.conflicts.length}:{' '}
                        &quot;{currentMoveConflict.name}&quot; already exists in target box.
                      </p>
                      <input
                        type="text"
                        className="w-full rounded-md border border-amber-300 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                        maxLength={60}
                        value={moveConflictState.renameValue}
                        onChange={(event) =>
                          setMoveConflictState((previous) =>
                            previous
                              ? { ...previous, renameValue: event.target.value }
                              : previous
                          )
                        }
                        placeholder="Enter a new name"
                        disabled={isMovingItems || isUndoingMove}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60"
                          onClick={handleMoveConflictCancel}
                          disabled={isMovingItems || isUndoingMove}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60"
                          onClick={handleMoveConflictConfirm}
                          disabled={isMovingItems || isUndoingMove}
                        >
                          Rename & continue
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-slate-600">
                <span>
                  Items: {totals.itemCount}
                </span>
                <span>
                  Bag total: {formatKg(totals.totalWeightKg)}
                </span>
              </div>
            </div>

            {isEditMode && (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void handleSave()
                  }}
                  disabled={!canSave || isMovingItems || isUndoingMove || moveConflictState != null}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void handleCancel()
                  }}
                  disabled={!isDirty || isSaving || isMovingItems || isUndoingMove || moveConflictState != null}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
        </dl>
      </div>
    </div>
  )
})

DetailsPanel.displayName = 'DetailsPanel'
