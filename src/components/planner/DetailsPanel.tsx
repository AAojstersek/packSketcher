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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bag, Item } from '@/types'
import { supabase } from '@/lib/supabase/browser'
import { normalizeBagName, normalizeBagWeightKg } from './bagDetailsValidation'
import { normalizeItemName, normalizeItemWeight } from './itemsValidation'

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
}

/**
 * Bag details side panel. In Edit mode: edits are held in local draft state;
 * click Save to persist via onUpdateBag, or Cancel to revert to the current bag.
 */
export function DetailsPanel({
  bag,
  isEditMode,
  onClose,
  onToggleEditMode,
  onUpdateBag,
  onSaveSuccess,
  saveError = null,
  clearSaveError,
}: DetailsPanelProps) {
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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

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


  // Clear save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  // Escape key closes the panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
      setItemsSaveError(null)
      clearSaveError?.()
    },
    [clearSaveError]
  )

  const handleMarkItemDeleted = useCallback((id: string) => {
    setDraftItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isDeleted: true } : i))
    )
    setItemsSaveError(null)
    clearSaveError?.()
  }, [clearSaveError])

  const handleSave = async () => {
    if (!bag || !draft || isSaving || !isDirty) return
    setValidationError(null)
    setItemsSaveError(null)
    clearSaveError?.()
    const name = normalizeBagName(draft.name)
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
        setItemsSaveError(rpcErr.message ?? 'Failed to save')
        return
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
      setPersistedItems(items)
      setDraftItems(items.map((i) => ({ ...i, isNew: false, isDirty: false, isDeleted: false })))
      setItemWeightDisplayById(
        Object.fromEntries(items.map((i) => [i.id, formatItemWeightDisplay(i.weight)]))
      )
      setExpandedItemId(null)
      onSaveSuccess?.(bagRow)
    } catch (e) {
      setItemsSaveError(
        e instanceof Error ? e.message : 'Failed to save items'
      )
    } finally {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        setIsSaving(false)
      }, 500)
    }
  }

  const handleCancel = async () => {
    if (!bag || isSaving) return
    setValidationError(null)
    setItemsSaveError(null)
    setItemsLoadError(null)
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
      setPersistedItems(items)
      setDraftItems(items.map((i) => ({ ...i, isNew: false, isDirty: false, isDeleted: false })))
      setItemWeightDisplayById(
        Object.fromEntries(items.map((i) => [i.id, formatItemWeightDisplay(i.weight)]))
      )
      setExpandedItemId(null)
    } catch (e) {
      setItemsLoadError(e instanceof Error ? e.message : 'Failed to reload')
    } finally {
      setIsSaving(false)
    }
  }

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
                {isEditMode && (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                    onClick={handleAddItem}
                    disabled={isSaving}
                  >
                    + Item
                  </button>
                )}
              </div>
              <dd className="space-y-3">
                {draftItems
                  .filter((i) => !i.isDeleted)
                  .map((item) => {
                    const isExpanded = isEditMode && expandedItemId === item.id
                    const isCollapsed = readonly || !isExpanded
                    const collapsedProps = isEditMode
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
                          {SHOW_ITEM_WEIGHT && (item.weight ?? 0) > 0 && (
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
                {draftItems.filter((i) => !i.isDeleted).length === 0 && (
                  <p className="text-xs text-slate-600">No items</p>
                )}
              </dd>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-slate-600">
                <span>
                  Items: {draftItems.filter((i) => !i.isDeleted).length}
                </span>
                <span>
                  Bag total: {formatKg(
                    (draft.bag_weight_kg ??
                      bag.bag_weight_kg ??
                      (bag.bag_weight != null ? bag.bag_weight / 1000 : 0)) +
                      draftItems
                        .filter((i) => !i.isDeleted)
                        .reduce((s, i) => s + (i.weight ?? 0), 0)
                  )}
                </span>
              </div>
            </div>

            {isEditMode && (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCancel}
                  disabled={!isDirty || isSaving}
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
}
