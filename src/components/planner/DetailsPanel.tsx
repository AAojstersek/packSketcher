'use client'

/**
 * DEV TEST CHECKLIST (manual):
 * - add item -> cancel
 * - edit item -> cancel
 * - delete item -> cancel
 * - add+edit+delete multiple -> save
 * - delete newly added item before save -> save (should not attempt DB delete)
 */

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

function formatItemWeightDisplay(weight: number): string {
  return weight === 0 ? '' : String(weight)
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
          return
        }
        const list = (itemsRes.data ?? []) as Item[]
        setPersistedItems(list)
        setDraftItems(list.map((i) => ({ ...i, isNew: false, isDirty: false, isDeleted: false })))
        setItemWeightDisplayById(
          Object.fromEntries(list.map((i) => [i.id, formatItemWeightDisplay(i.weight)]))
        )
      } catch (e) {
        if (!cancelled) {
          setItemsLoadError(e instanceof Error ? e.message : 'Failed to load items')
          setPersistedItems([])
          setDraftItems([])
          setItemWeightDisplayById({})
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
      className="fixed right-0 top-0 h-[100dvh] w-72 z-20 flex flex-col border-l border-gray-300 bg-white shadow-lg"
      data-details-panel
    >
      <header className="flex-none p-4 pt-14">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-800">Bag details</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 text-sm rounded border border-gray-300 bg-white shadow hover:bg-gray-50 text-slate-800"
              onClick={onToggleEditMode}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 text-slate-800"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        {(saveError || validationError || itemsLoadError || itemsSaveError) && (
          <div className="mb-3 text-sm text-red-600" role="alert">
            {validationError ??
              saveError ??
              itemsSaveError ??
              itemsLoadError}
          </div>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pt-0">
        <dl className="text-sm space-y-3 text-slate-700">
        {SHOW_DEBUG && (
          <>
            <div>
              <dt className="text-slate-800">id</dt>
              <dd className="font-mono truncate text-slate-700">{bag?.id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-800">pack_id</dt>
              <dd className="font-mono truncate text-slate-700">{bag?.pack_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-800">x</dt>
              <dd className="text-slate-700">{bag != null ? bag.x : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-800">y</dt>
              <dd className="text-slate-700">{bag != null ? bag.y : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-800">width</dt>
              <dd className="text-slate-700">{bag != null ? bag.width : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-800">height</dt>
              <dd className="text-slate-700">{bag != null ? bag.height : '—'}</dd>
            </div>
          </>
        )}

        {bag != null && draft != null && (
          <>
            <div>
              <dt className="text-slate-800 mb-1">Bag name</dt>
              <dd>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-slate-900 placeholder:text-slate-500"
                  maxLength={60}
                  value={draft.name}
                  onChange={handleNameChange}
                  disabled={readonly || isSaving}
                />
              </dd>
            </div>
            <div>
              <dt className="text-slate-800 mb-1">Color</dt>
              <dd className="flex flex-wrap gap-2 items-center">
                {PRESET_COLORS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500 disabled:opacity-50 disabled:pointer-events-none"
                    style={{ backgroundColor: value }}
                    title={label}
                    onClick={() => handleColorChange(value)}
                    disabled={readonly || isSaving}
                  />
                ))}
                <input
                  type="color"
                  className="w-8 h-8 cursor-pointer rounded border border-gray-300 disabled:opacity-50 disabled:pointer-events-none"
                  value={displayColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  disabled={readonly || isSaving}
                />
              </dd>
            </div>
            <div>
              <dt className="text-slate-800 mb-1">Bag weight (kg)</dt>
              <dd>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-slate-900 placeholder:text-slate-500"
                  value={weightDisplay}
                  onChange={handleWeightChange}
                  onBlur={handleWeightBlur}
                  disabled={readonly || isSaving}
                />
              </dd>
            </div>
            <div>
              <dt className="text-slate-800 mb-1">Locked</dt>
              <dd>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.locked}
                    onChange={handleLockedChange}
                    disabled={readonly || isSaving}
                  />
                  <span className="text-sm">Lock position and size</span>
                </label>
              </dd>
            </div>

            {/* Items */}
            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <dt className="text-slate-800 font-medium">Items</dt>
                {isEditMode && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                    onClick={handleAddItem}
                    disabled={isSaving}
                  >
                    + Item
                  </button>
                )}
              </div>
              <dd className="space-y-2">
                {draftItems
                  .filter((i) => !i.isDeleted)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="rounded border border-gray-200 p-2 bg-gray-50/80"
                    >
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-0.5 text-sm text-slate-900 placeholder:text-slate-500"
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
                        {isEditMode && (
                          <button
                            type="button"
                            className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Delete item"
                            onClick={() => handleMarkItemDeleted(item.id)}
                            disabled={isSaving}
                            aria-label="Delete item"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-20 border border-gray-300 rounded px-2 py-0.5 text-sm text-slate-900 placeholder:text-slate-500"
                          placeholder="kg"
                          value={itemWeightDisplayById[item.id] ?? ''}
                          onChange={(e) =>
                            setItemWeightDisplayById((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const parsed = normalizeItemWeight(itemWeightDisplayById[item.id] ?? '')
                            handleUpdateItem(item.id, { weight: parsed })
                            setItemWeightDisplayById((prev) => ({
                              ...prev,
                              [item.id]: parsed === 0 ? '' : String(parsed),
                            }))
                          }}
                          disabled={readonly || isSaving}
                        />
                        <span className="text-xs text-slate-600">kg</span>
                      </div>
                      {(item.description != null &&
                        item.description.trim() !== '') && (
                        <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {isEditMode && (
                        <textarea
                          className="mt-1 w-full border border-gray-300 rounded px-2 py-0.5 text-xs min-h-[48px] text-slate-900 placeholder:text-slate-500"
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
                      )}
                    </div>
                  ))}
                {draftItems.filter((i) => !i.isDeleted).length === 0 && (
                  <p className="text-xs text-slate-600">No items</p>
                )}
              </dd>
              <div className="mt-2 text-xs text-slate-700 space-y-0.5">
                <div>
                  Items total:{' '}
                  {formatKg(
                    draftItems
                      .filter((i) => !i.isDeleted)
                      .reduce((s, i) => s + i.weight, 0)
                  )}
                </div>
                <div>
                  Bag total:{' '}
                  {formatKg(
                    (draft.bag_weight_kg ??
                      bag.bag_weight_kg ??
                      (bag.bag_weight != null ? bag.bag_weight / 1000 : 0)) +
                      draftItems
                        .filter((i) => !i.isDeleted)
                        .reduce((s, i) => s + i.weight, 0)
                  )}
                </div>
              </div>
            </div>

            {isEditMode && (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
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
