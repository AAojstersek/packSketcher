'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bag } from '@/types'
import { supabase } from '@/lib/supabase/browser'
import { friendlySupabaseMessage } from '@/lib/supabase/errorMapping'
import { DetailsPanel, type DetailsPanelHandle } from '@/components/planner/DetailsPanel'
import { nextBoxName } from '@/lib/boxes/naming'
import { formatBoxLabel } from '@/lib/boxes/labels'
import { swapBagZIndex, type SwapDirection } from '@/lib/rpc/bags'
import { reorderBagsOneStep } from '@/lib/boxes/reorder'
import { shouldPromptUnsavedGuard, type UnsavedGuardAction } from '@/lib/planner/unsavedGuard'

// Survives remounts (Strict Mode / fast refresh) so we don't overwrite localItems after resize/drag.
let lastSyncedPackId: string | null = null

/** Parse hex color to [r, g, b] 0-255. Supports #RRGGBB and #RGB. Fallback: neutral gray. */
function hexToRgb(hex: string): [number, number, number] {
  const s = (hex ?? '').trim()
  if (s.startsWith('#')) {
    const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s)
    if (short) {
      return [
        parseInt(short[1] + short[1], 16),
        parseInt(short[2] + short[2], 16),
        parseInt(short[3] + short[3], 16),
      ]
    }
    const long = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(s)
    if (long) {
      return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)]
    }
  }
  return [128, 128, 128]
}

function getRenderOrderedItems(items: Bag[]): Bag[] {
  return [...items].sort((a, b) => {
    if (a.z_index !== b.z_index) {
      return a.z_index - b.z_index
    }
    if (a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at)
    }
    return a.id.localeCompare(b.id)
  })
}

const LONG_PRESS_MS = 550
const LONG_PRESS_MOVE_TOLERANCE = 10
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br'

interface ResizeStart {
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
}

function getTouchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function getTouchCenter(a: Touch, b: Touch): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  }
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="m19.4 15 .8 1.4-1.7 3-1.6-.2a8.2 8.2 0 0 1-2 1.2L14.5 22h-5l-.4-1.6a8.2 8.2 0 0 1-2-1.2l-1.6.2-1.7-3 .8-1.4a8.6 8.6 0 0 1 0-2L3.8 11l1.7-3 1.6.2a8.2 8.2 0 0 1 2-1.2L9.5 5h5l.4 1.6a8.2 8.2 0 0 1 2 1.2l1.6-.2 1.7 3-.8 1.4a8.6 8.6 0 0 1 0 2Z" />
    </svg>
  )
}

interface PlannerCanvasProps {
  imageUrl: string
  name: string
  packId: string
  bags: Bag[]
  isEditMode: boolean
  selectedBagId: string | null
  highlightBagId: string | null
  onToggleEditMode: () => void
  onSelectBagId: (bagId: string | null) => void
  onHighlightBagIdChange: (bagId: string | null) => void
  addBagRequestId: number
  onOpenDetails: (bagId: string | null) => void
  onRegisterToggleEditModeHandler?: (handler: (() => void) | null) => void
  onRegisterMoveItemsGuardHandler?: (
    handler: ((action: () => Promise<void> | void) => void) | null
  ) => void
}

export function PlannerCanvas({
  imageUrl,
  name,
  packId,
  bags,
  isEditMode,
  selectedBagId,
  highlightBagId,
  onToggleEditMode,
  onSelectBagId,
  onHighlightBagIdChange,
  addBagRequestId,
  onOpenDetails,
  onRegisterToggleEditModeHandler,
  onRegisterMoveItemsGuardHandler,
}: PlannerCanvasProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageNaturalWidthRef = useRef<number>(0)
  const imageNaturalHeightRef = useRef<number>(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [localItems, setLocalItems] = useState<Bag[]>(bags)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const dragStartPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const didDragRef = useRef(false)
  const dragItemIdRef = useRef<string | null>(null)
  const draggedItemCurrentRef = useRef<Bag | null>(null)
  const selectedItemIdRef = useRef<string | null>(null)
  const highlightBagIdRef = useRef<string | null>(null)
  const localItemsRef = useRef<Bag[]>(localItems)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null)
  const resizeStartRef = useRef<ResizeStart | null>(null)
  const resizeItemIdRef = useRef<string | null>(null)
  const resizedItemCurrentRef = useRef<Bag | null>(null)
  const resizeHandleRef = useRef<ResizeHandle | null>(null)
  const didResizeRef = useRef(false)
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null)
  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const scaleRef = useRef(1)
  const offsetXRef = useRef(0)
  const offsetYRef = useRef(0)
  const [isPanning, setIsPanning] = useState(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const spacePressedRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panStartOffsetRef = useRef({ x: 0, y: 0 })
  const isEditModeRef = useRef(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const isDetailsOpenRef = useRef(false)
  const [detailsItemId, setDetailsItemId] = useState<string | null>(null)
  const [detailsSaveError, setDetailsSaveError] = useState<string | null>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const detailsPanelRef = useRef<DetailsPanelHandle | null>(null)
  const [isUnsavedGuardOpen, setIsUnsavedGuardOpen] = useState(false)
  const [unsavedGuardBusyAction, setUnsavedGuardBusyAction] = useState<'save' | 'discard' | null>(null)
  const pendingGuardActionRef = useRef<(() => Promise<void> | void) | null>(null)
  const pendingNavigationHrefRef = useRef<string | null>(null)
  const requestGuardedActionRef = useRef<
    (
      action: () => Promise<void> | void,
      actionType: UnsavedGuardAction,
      options?: { navigationHref?: string }
    ) => void
  >(() => {})
  const handledAddBagRequestRef = useRef(0)
  const [contextMenu, setContextMenu] = useState<{
    bagId: string
    x: number
    y: number
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextClickRef = useRef(false)
  const touchDragStateRef = useRef<{
    bagId: string
    dx: number
    dy: number
    started: boolean
  } | null>(null)
  const touchResizeStateRef = useRef<{
    bagId: string
    handle: ResizeHandle
  } | null>(null)
  const pinchStateRef = useRef<{
    startDistance: number
    startScale: number
    anchorWorldX: number
    anchorWorldY: number
  } | null>(null)

  const detailsItem =
    detailsItemId != null ? localItems.find((i) => i.id === detailsItemId) ?? null : null
  const selectedItemId = selectedBagId
  const setSelectedItemId = onSelectBagId
  const selectedItem = selectedItemId
    ? localItems.find((item) => item.id === selectedItemId) ?? null
    : null

  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 2.5

  const HANDLE_SIZE_DESKTOP = 8
  const HANDLE_SIZE_COARSE = 12
  const HANDLE_TOUCH_HIT_SLOP = 8
  const MIN_ITEM_SIZE = 40

  dragItemIdRef.current = dragItemId
  selectedItemIdRef.current = selectedItemId
  highlightBagIdRef.current = highlightBagId
  localItemsRef.current = localItems
  resizeHandleRef.current = resizeHandle
  scaleRef.current = scale
  offsetXRef.current = offsetX
  offsetYRef.current = offsetY
  isEditModeRef.current = isEditMode
  isDetailsOpenRef.current = isDetailsOpen

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    return {
      x: (mouseX - offsetX) / scale,
      y: (mouseY - offsetY) / scale,
    }
  }

  function clientToWorldFromRefs(clientX: number, clientY: number): { x: number; y: number } {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    return {
      x: (mouseX - offsetXRef.current) / scaleRef.current,
      y: (mouseY - offsetYRef.current) / scaleRef.current,
    }
  }

  function canvasToOriginal(
    canvas: HTMLCanvasElement,
    canvasX: number,
    canvasY: number
  ): { x: number; y: number } {
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return { x: 0, y: 0 }
    const scaleX = imageNaturalWidth / canvas.width
    const scaleY = imageNaturalHeight / canvas.height
    return { x: canvasX * scaleX, y: canvasY * scaleY }
  }

  function getItemAtCanvasPoint(
    canvas: HTMLCanvasElement,
    canvasX: number,
    canvasY: number,
    itemsList: Bag[]
  ): string | null {
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0 || itemsList.length === 0) return null
    const scaleX = canvas.width / imageNaturalWidth
    const scaleY = canvas.height / imageNaturalHeight
    const orderedItems = getRenderOrderedItems(itemsList)
    for (let index = orderedItems.length - 1; index >= 0; index -= 1) {
      const item = orderedItems[index]
      const itemX = item.x * scaleX
      const itemY = item.y * scaleY
      const itemWidth = item.width * scaleX
      const itemHeight = item.height * scaleY
      if (
        canvasX >= itemX &&
        canvasX <= itemX + itemWidth &&
        canvasY >= itemY &&
        canvasY <= itemY + itemHeight
      ) {
        return item.id
      }
    }
    return null
  }

  function getHandleAtCanvasPoint(
    canvas: HTMLCanvasElement,
    canvasX: number,
    canvasY: number,
    item: Bag,
    options?: { handleSize?: number; hitSlop?: number }
  ): ResizeHandle | null {
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null
    const scaleX = canvas.width / imageNaturalWidth
    const scaleY = canvas.height / imageNaturalHeight
    const itemX = item.x * scaleX
    const itemY = item.y * scaleY
    const itemW = item.width * scaleX
    const itemH = item.height * scaleY
    const s = options?.handleSize ?? HANDLE_SIZE_DESKTOP
    const hitSlop = options?.hitSlop ?? 0
    const corners: { handle: ResizeHandle; cx: number; cy: number }[] = [
      { handle: 'tl', cx: itemX, cy: itemY },
      { handle: 'tr', cx: itemX + itemW - s, cy: itemY },
      { handle: 'br', cx: itemX + itemW - s, cy: itemY + itemH - s },
      { handle: 'bl', cx: itemX, cy: itemY + itemH - s },
    ]
    for (const { handle, cx, cy } of corners) {
      if (
        canvasX >= cx - hitSlop &&
        canvasX <= cx + s + hitSlop &&
        canvasY >= cy - hitSlop &&
        canvasY <= cy + s + hitSlop
      ) {
        return handle
      }
    }
    return null
  }

  const drawOverlay = (itemsToDraw: Bag[] = localItems) => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Compute scale factors (items are stored in original image pixel coordinates)
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    
    if (imageNaturalWidth > 0 && imageNaturalHeight > 0) {
      const scaleX = canvas.width / imageNaturalWidth
      const scaleY = canvas.height / imageNaturalHeight

      // Draw items using scaled coordinates and bag.color, lowest z-index first.
      getRenderOrderedItems(itemsToDraw).forEach((item) => {
        const itemX = item.x * scaleX
        const itemY = item.y * scaleY
        const itemWidth = item.width * scaleX
        const itemHeight = item.height * scaleY
        const [r, g, b] = hexToRgb(item.color ?? '#888888')
        const isSelected = item.id === selectedItemId
        const isHighlighted = !isSelected && highlightBagId != null && item.id === highlightBagId
        const isHovered = item.id === hoveredItemId

        // Subtle outer stroke for selected (glow)
        if (isSelected || isHighlighted) {
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`
          ctx.lineWidth = isSelected ? 5 : 3
          ctx.strokeRect(itemX - 2, itemY - 2, itemWidth + 4, itemHeight + 4)
        }

        // Fill with bag color, low alpha
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`
        ctx.fillRect(itemX, itemY, itemWidth, itemHeight)

        // Border: bag color, higher alpha; thickness by state
        const strokeAlpha = isSelected || isHighlighted ? 0.8 : 0.65
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${strokeAlpha})`
        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5
        ctx.strokeRect(itemX, itemY, itemWidth, itemHeight)

        // Box label in top-left; truncate or hide when space is too small.
        const labelPaddingX = 6
        const labelPaddingY = 4
        const labelFontSize = 12
        const labelHeight = labelFontSize + 4
        const maxLabelWidth = itemWidth - labelPaddingX * 2
        const maxLabelHeight = itemHeight - labelPaddingY * 2
        if (maxLabelWidth > 0 && maxLabelHeight >= labelHeight) {
          ctx.font = `600 ${labelFontSize}px ui-sans-serif, system-ui, sans-serif`
          ctx.textBaseline = 'top'
          const label = formatBoxLabel(
            item.name,
            maxLabelWidth,
            (value) => ctx.measureText(value).width
          )
          if (label) {
            const textWidth = ctx.measureText(label).width
            const bgX = itemX + labelPaddingX - 2
            const bgY = itemY + labelPaddingY - 1
            const bgWidth = textWidth + 4
            const bgHeight = labelHeight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
            ctx.fillRect(bgX, bgY, bgWidth, bgHeight)
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
            ctx.fillText(label, itemX + labelPaddingX, itemY + labelPaddingY)
          }
        }

        // Corner handles when selected (bag color, high alpha)
        if (isSelected) {
          const handleSize = isCoarsePointer ? HANDLE_SIZE_COARSE : HANDLE_SIZE_DESKTOP
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`
          ctx.lineWidth = 1
          const corners = [
            [itemX, itemY],
            [itemX + itemWidth - handleSize, itemY],
            [itemX + itemWidth - handleSize, itemY + itemHeight - handleSize],
            [itemX, itemY + itemHeight - handleSize],
          ]
          corners.forEach(([cx, cy]) => {
            ctx.fillRect(cx, cy, handleSize, handleSize)
            ctx.strokeRect(cx, cy, handleSize, handleSize)
          })
        }
      })
    }
  }

  const updateCanvasSize = () => {
    const img = imageRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    // Match canvas size to rendered image size
    const displayWidth = img.clientWidth
    const displayHeight = img.clientHeight

    // Set canvas internal resolution (this clears the canvas)
    canvas.width = displayWidth
    canvas.height = displayHeight

    // Set canvas CSS to match exactly (no scaling)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    // Redraw overlay
    drawOverlay()
  }

  useEffect(() => {
    const img = imageRef.current
    if (!img) return

    const handleImageLoad = () => {
      // Store original image dimensions
      imageNaturalWidthRef.current = img.naturalWidth
      imageNaturalHeightRef.current = img.naturalHeight
      setImageLoaded(true)
      updateCanvasSize()
    }

    if (img.complete) {
      handleImageLoad()
    } else {
      img.addEventListener('load', handleImageLoad)
      return () => img.removeEventListener('load', handleImageLoad)
    }
  }, [imageUrl])

  useEffect(() => {
    if (!imageLoaded) return

    updateCanvasSize()

    // Handle window resize
    const handleResize = () => {
      updateCanvasSize()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageLoaded, localItems, hoveredItemId, selectedItemId, highlightBagId, isDragging, isResizing, scale, offsetX, offsetY])

  // Fetch and cache user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      }
    }
    fetchUserId()
  }, [])

  // Sync localItems from props.bags only when packId actually changes (e.g. navigating to another pack).
  // lastSyncedPackId is module-level so it survives remounts; we don't overwrite local edits after resize/drag.
  useEffect(() => {
    if (lastSyncedPackId === packId) return
    lastSyncedPackId = packId
    setLocalItems(bags)
  }, [packId, bags])

  /** Returns true if keyboard events should go to the element (no canvas shortcuts). */
  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    if (!el || typeof el.closest !== 'function') return false
    const tag = el.tagName?.toLowerCase()
    const isControl =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      !!el.isContentEditable
    if (isControl) return true
    return !!el.closest('input, textarea, select, [contenteditable="true"]')
  }

  function skipWhenTyping(e: KeyboardEvent): boolean {
    return isTypingTarget(e.target) || isTypingTarget(document.activeElement)
  }

  function showTemporaryError(message: string) {
    setError(message)
    window.setTimeout(() => setError(null), 5000)
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }

  const openDetailsForBag = (bagId: string) => {
    setDetailsItemId(bagId)
    setIsDetailsOpen(true)
    setDetailsSaveError(null)
    onOpenDetails(bagId)
  }

  const hasUnsavedDetailsChanges = useCallback(() => {
    if (!isDetailsOpenRef.current) return false
    return detailsPanelRef.current?.hasUnsavedChanges() ?? false
  }, [])

  const closeDetailsImmediately = useCallback(() => {
    setIsDetailsOpen(false)
    setDetailsItemId(null)
    setDetailsSaveError(null)
    onOpenDetails(null)
  }, [onOpenDetails])

  const clearPendingGuardAction = useCallback(() => {
    pendingGuardActionRef.current = null
    pendingNavigationHrefRef.current = null
    setUnsavedGuardBusyAction(null)
    setIsUnsavedGuardOpen(false)
  }, [])

  const runPendingGuardAction = useCallback(async () => {
    const pendingAction = pendingGuardActionRef.current
    const pendingNavigationHref = pendingNavigationHrefRef.current
    clearPendingGuardAction()
    if (pendingAction) {
      await pendingAction()
      return
    }
    if (pendingNavigationHref) {
      window.location.assign(pendingNavigationHref)
    }
  }, [clearPendingGuardAction])

  const requestGuardedAction = useCallback(
    (
      action: () => Promise<void> | void,
      actionType: UnsavedGuardAction,
      options?: { navigationHref?: string }
    ) => {
      const shouldGuard = shouldPromptUnsavedGuard(actionType, {
        isDetailsPanelOpen: isDetailsOpenRef.current,
        hasUnsavedChanges: hasUnsavedDetailsChanges(),
      })
      if (!shouldGuard) {
        void action()
        return
      }
      pendingGuardActionRef.current = action
      pendingNavigationHrefRef.current = options?.navigationHref ?? null
      setUnsavedGuardBusyAction(null)
      setIsUnsavedGuardOpen(true)
    },
    [hasUnsavedDetailsChanges]
  )
  requestGuardedActionRef.current = requestGuardedAction

  const handleUnsavedGuardCancel = useCallback(() => {
    clearPendingGuardAction()
  }, [clearPendingGuardAction])

  const handleUnsavedGuardSave = useCallback(async () => {
    const panel = detailsPanelRef.current
    if (!panel) {
      await runPendingGuardAction()
      return
    }
    setUnsavedGuardBusyAction('save')
    const saved = await panel.saveChanges()
    if (!saved) {
      setUnsavedGuardBusyAction(null)
      return
    }
    await runPendingGuardAction()
  }, [runPendingGuardAction])

  const handleUnsavedGuardDiscard = useCallback(async () => {
    const panel = detailsPanelRef.current
    if (!panel) {
      await runPendingGuardAction()
      return
    }
    setUnsavedGuardBusyAction('discard')
    const discarded = await panel.discardChanges()
    if (!discarded) {
      setUnsavedGuardBusyAction(null)
      return
    }
    await runPendingGuardAction()
  }, [runPendingGuardAction])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia('(pointer: coarse)')
    const apply = () => setIsCoarsePointer(media.matches)
    apply()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }

    media.addListener(apply)
    return () => media.removeListener(apply)
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const shouldGuard = shouldPromptUnsavedGuard('navigate_away', {
        isDetailsPanelOpen: isDetailsOpenRef.current,
        hasUnsavedChanges: hasUnsavedDetailsChanges(),
      })
      if (!shouldGuard) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedDetailsChanges])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

      const currentUrl = new URL(window.location.href)
      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.href === currentUrl.href) return

      const shouldGuard = shouldPromptUnsavedGuard('navigate_away', {
        isDetailsPanelOpen: isDetailsOpenRef.current,
        hasUnsavedChanges: hasUnsavedDetailsChanges(),
      })
      if (!shouldGuard) return

      event.preventDefault()
      requestGuardedAction(
        () => {
          window.location.assign(nextUrl.href)
        },
        'navigate_away',
        { navigationHref: nextUrl.href }
      )
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [hasUnsavedDetailsChanges, requestGuardedAction])

  /** True when focus is in an input/textarea/contentEditable — do not capture Space. */
  function isTypingActive(): boolean {
    const el = document.activeElement
    return !!(
      el &&
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement).isContentEditable ||
        el.getAttribute?.('role') === 'textbox')
    )
  }

  // Delete selected item on Delete/Backspace
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (skipWhenTyping(e)) return
      if (!isEditModeRef.current) return
      const id = selectedItemIdRef.current
      if (id == null) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (e.key === 'Backspace') e.preventDefault()
      const items = localItemsRef.current
      const item = items.find((i) => i.id === id)
      if (!item) return
      if (item.locked) return
      const previousItems = items
      const previousSelectedId = selectedItemIdRef.current
      const previousHighlightId = highlightBagIdRef.current
      const previousDetailsItemId = detailsItemId
      const wasDetailsOpenForItem =
        isDetailsOpenRef.current && previousDetailsItemId != null && previousDetailsItemId === id
      requestGuardedActionRef.current(async () => {
        setLocalItems((prev) => prev.filter((i) => i.id !== id))
        setSelectedItemId(null)
        onHighlightBagIdChange(null)
        if (wasDetailsOpenForItem) {
          setIsDetailsOpen(false)
          setDetailsItemId(null)
          onOpenDetails(null)
        }
        const { error: deleteError } = await supabase.from('bags').delete().eq('id', id)
        if (deleteError) {
          setLocalItems(previousItems)
          setSelectedItemId(previousSelectedId)
          onHighlightBagIdChange(previousHighlightId)
          if (wasDetailsOpenForItem && previousDetailsItemId != null) {
            setIsDetailsOpen(true)
            setDetailsItemId(previousDetailsItemId)
            onOpenDetails(previousDetailsItemId)
          }
          setError(friendlySupabaseMessage(deleteError, 'Failed to delete bag.'))
          setTimeout(() => setError(null), 5000)
        }
      }, 'delete_box')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailsItemId, onHighlightBagIdChange, onOpenDetails, setSelectedItemId])

  // Only attach Space-to-pan when details panel is closed. When panel is open, no listener → Space always works in inputs.
  useEffect(() => {
    if (isDetailsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const activeEl = document.activeElement
      const target = e.target as Node | null
      const typing =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable ||
        (target as HTMLElement)?.isContentEditable
      if (typing) return
      e.preventDefault()
      spacePressedRef.current = true
      setSpacePressed(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const activeEl = document.activeElement
      const target = e.target as Node | null
      const typing =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable ||
        (target as HTMLElement)?.isContentEditable
      if (typing) return
      spacePressedRef.current = false
      setSpacePressed(false)
      setIsPanning(false)
    }
    window.addEventListener('keydown', onKeyDown, false)
    window.addEventListener('keyup', onKeyUp, false)
    return () => {
      window.removeEventListener('keydown', onKeyDown, false)
      window.removeEventListener('keyup', onKeyUp, false)
    }
  }, [isDetailsOpen])

  // Prevent background scroll while details panel is open
  useEffect(() => {
    if (!isDetailsOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isDetailsOpen])

  useEffect(() => {
    if (!contextMenu) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (contextMenuRef.current?.contains(target)) return
      setContextMenu(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    return () => clearLongPressTimer()
  }, [])

  const handleWheelRef = useRef((_e: WheelEvent) => {})
  handleWheelRef.current = (e: WheelEvent) => {
    const el = containerRef.current
    if (!el) return
    e.preventDefault()
    if (e.ctrlKey) {
      const rect = el.getBoundingClientRect()
      const scaleVal = scaleRef.current
      const offsetXVal = offsetXRef.current
      const offsetYVal = offsetYRef.current
      const worldX = (e.clientX - rect.left - offsetXVal) / scaleVal
      const worldY = (e.clientY - rect.top - offsetYVal) / scaleVal
      const newScale = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, scaleVal * (e.deltaY < 0 ? 1.1 : 0.9))
      )
      setScale(newScale)
      setOffsetX(e.clientX - rect.left - worldX * newScale)
      setOffsetY(e.clientY - rect.top - worldY * newScale)
    } else {
      setOffsetX(offsetXRef.current - e.deltaX)
      setOffsetY(offsetYRef.current - e.deltaY)
    }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => handleWheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const getResizedBagFromPointer = (
    start: ResizeStart,
    handle: ResizeHandle,
    pointerX: number,
    pointerY: number,
    imageWidth: number,
    imageHeight: number
  ): Pick<Bag, 'x' | 'y' | 'width' | 'height'> => {
    const mx = pointerX
    const my = pointerY
    const minS = MIN_ITEM_SIZE
    let newX: number
    let newY: number
    let newW: number
    let newH: number
    switch (handle) {
      case 'tl':
        newX = mx
        newY = my
        newW = start.origX + start.origW - mx
        newH = start.origY + start.origH - my
        break
      case 'tr':
        newX = start.origX
        newY = my
        newW = mx - start.origX
        newH = start.origY + start.origH - my
        break
      case 'br':
        newX = start.origX
        newY = start.origY
        newW = mx - start.origX
        newH = my - start.origY
        break
      case 'bl':
        newX = mx
        newY = start.origY
        newW = start.origX + start.origW - mx
        newH = my - start.origY
        break
    }
    newW = Math.max(minS, Math.min(newW, imageWidth - newX))
    newH = Math.max(minS, Math.min(newH, imageHeight - newY))
    if (handle === 'tl') {
      newX = start.origX + start.origW - newW
      newY = start.origY + start.origH - newH
    } else if (handle === 'tr') {
      newY = start.origY + start.origH - newH
    } else if (handle === 'bl') {
      newX = start.origX + start.origW - newW
    }
    newX = Math.max(0, Math.min(newX, imageWidth - newW))
    newY = Math.max(0, Math.min(newY, imageHeight - newH))

    return {
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH),
    }
  }

  const applyResizeAtCanvasPoint = (canvasX: number, canvasY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    const id = resizeItemIdRef.current
    const handle = resizeHandleRef.current
    if (!id || !handle || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    const item = localItemsRef.current.find((entry) => entry.id === id)
    const start = resizeStartRef.current
    if (!item || !start) return

    const scaleX = imageNaturalWidth / canvas.width
    const scaleY = imageNaturalHeight / canvas.height
    const pointerX = canvasX * scaleX
    const pointerY = canvasY * scaleY
    const resized = getResizedBagFromPointer(
      start,
      handle,
      pointerX,
      pointerY,
      imageNaturalWidth,
      imageNaturalHeight
    )
    const updated = { ...item, ...resized }
    resizedItemCurrentRef.current = updated
    setLocalItems((prev) => prev.map((entry) => (entry.id === id ? updated : entry)))
    drawOverlay(localItemsRef.current.map((entry) => (entry.id === id ? updated : entry)))
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return
    if (spacePressedRef.current) {
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panStartOffsetRef.current = { x: offsetX, y: offsetY }
      setIsPanning(true)
      return
    }
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    if (hitId == null || hitId !== selectedItemId) return
    if (!isEditMode) return
    const item = localItems.find((i) => i.id === hitId)
    if (!item) return
    if (item.locked) return
    const handle = getHandleAtCanvasPoint(canvas, worldX, worldY, item)
    if (handle != null) {
      e.preventDefault()
      e.stopPropagation()
      const orig = canvasToOriginal(canvas, worldX, worldY)
      resizeStartRef.current = {
        startX: orig.x,
        startY: orig.y,
        origX: item.x,
        origY: item.y,
        origW: item.width,
        origH: item.height,
      }
      resizeItemIdRef.current = hitId
      resizedItemCurrentRef.current = { ...item }
      didResizeRef.current = true
      setIsResizing(true)
      setResizeHandle(handle)
      return
    }
    const orig = canvasToOriginal(canvas, worldX, worldY)
    dragStartPositionRef.current = { x: item.x, y: item.y }
    didDragRef.current = false
    setIsDragging(true)
    setDragItemId(hitId)
    setDragOffset({ dx: orig.x - item.x, dy: orig.y - item.y })
    draggedItemCurrentRef.current = { ...item }
  }

  const handleDragEnd = useRef<() => void>(() => {})
  handleDragEnd.current = async () => {
    const id = dragItemIdRef.current
    if (!id) return
    const item = draggedItemCurrentRef.current
    if (!item) {
      setIsDragging(false)
      setDragItemId(null)
      return
    }
    setIsDragging(false)
    setDragItemId(null)
    dragItemIdRef.current = null
    draggedItemCurrentRef.current = null
    const { error: updateError } = await supabase
      .from('bags')
      .update({ x: item.x, y: item.y })
      .eq('id', id)
    if (updateError) {
      const start = dragStartPositionRef.current
      setLocalItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, x: start.x, y: start.y } : it
        )
      )
      setError(friendlySupabaseMessage(updateError, 'Failed to move bag.'))
      setTimeout(() => setError(null), 5000)
    }
  }

  const handleResizeEnd = useRef<() => void>(() => {})
  handleResizeEnd.current = async () => {
    const id = resizeItemIdRef.current
    if (!id) return
    const start = resizeStartRef.current
    const item =
      resizedItemCurrentRef.current ?? localItemsRef.current.find((i) => i.id === id)
    if (!item) {
      setIsResizing(false)
      setResizeHandle(null)
      resizeItemIdRef.current = null
      resizeHandleRef.current = null
      touchResizeStateRef.current = null
      return
    }
    const x = Math.round(item.x)
    const y = Math.round(item.y)
    const width = Math.round(item.width)
    const height = Math.round(item.height)
    setLocalItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, x, y, width, height } : it))
    )
    setIsResizing(false)
    setResizeHandle(null)
    resizeItemIdRef.current = null
    resizeHandleRef.current = null
    touchResizeStateRef.current = null
    resizedItemCurrentRef.current = null
    resizeStartRef.current = null
    const { error: updateError } = await supabase
      .from('bags')
      .update({ x, y, width, height })
      .eq('id', id)
    if (updateError && start) {
      setLocalItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, x: start.origX, y: start.origY, width: start.origW, height: start.origH } : it
        )
      )
      setError(friendlySupabaseMessage(updateError, 'Resize save failed.'))
      setTimeout(() => setError(null), 5000)
    }
  }

  useEffect(() => {
    if (!isDragging) return
    const onMouseUp = () => handleDragEnd.current()
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [isDragging])

  useEffect(() => {
    if (!isResizing) return
    const onResizeMove = (e: MouseEvent) => {
      const world = clientToWorldFromRefs(e.clientX, e.clientY)
      applyResizeAtCanvasPoint(world.x, world.y)
    }
    const onResizeEnd = () => handleResizeEnd.current()
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)
    return () => {
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeEnd)
    }
  }, [isResizing])

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (isPanning) {
      setOffsetX(panStartOffsetRef.current.x + (e.clientX - panStartRef.current.x))
      setOffsetY(panStartOffsetRef.current.y + (e.clientY - panStartRef.current.y))
      return
    }
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current

    if (isDragging && dragItemId) {
      const item = localItems.find((i) => i.id === dragItemId)
      if (!item) return
      if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return
      const orig = canvasToOriginal(canvas, worldX, worldY)
      let newX = Math.round(orig.x - dragOffset.dx)
      let newY = Math.round(orig.y - dragOffset.dy)
      newX = Math.max(0, Math.min(newX, imageNaturalWidth - item.width))
      newY = Math.max(0, Math.min(newY, imageNaturalHeight - item.height))
      const updated = { ...item, x: newX, y: newY }
      draggedItemCurrentRef.current = updated
      didDragRef.current = true
      setLocalItems((prev) =>
        prev.map((it) => (it.id === dragItemId ? updated : it))
      )
      drawOverlay(
        localItems.map((it) => (it.id === dragItemId ? updated : it))
      )
      return
    }

    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    setHoveredItemId(hitId ?? null)
    if (hitId && hitId === selectedItemId) {
      const item = localItems.find((i) => i.id === hitId)
      const handle = item ? getHandleAtCanvasPoint(canvas, worldX, worldY, item) : null
      setHoveredHandle(handle)
    } else {
      setHoveredHandle(null)
    }
  }

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
      return
    }
    if (isResizing) {
      handleResizeEnd.current()
    } else if (isDragging && dragItemId) {
      handleDragEnd.current()
    }
  }

  const openContextMenuAt = (bagId: string, x: number, y: number) => {
    setContextMenu({ bagId, x, y })
  }

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isEditMode) return
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded || selectedItemId == null) return
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItemsRef.current)
    if (!hitId || hitId !== selectedItemId) return
    openContextMenuAt(hitId, e.clientX, e.clientY)
  }

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return

    if (e.touches.length >= 2) {
      e.preventDefault()
      if (touchResizeStateRef.current && isResizing) {
        handleResizeEnd.current()
      }
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      setContextMenu(null)

      const first = e.touches[0]
      const second = e.touches[1]
      const center = getTouchCenter(first, second)
      const rect = canvas.getBoundingClientRect()
      const anchorWorldX = (center.x - rect.left - offsetXRef.current) / scaleRef.current
      const anchorWorldY = (center.y - rect.top - offsetYRef.current) / scaleRef.current
      pinchStateRef.current = {
        startDistance: getTouchDistance(first, second),
        startScale: scaleRef.current,
        anchorWorldX,
        anchorWorldY,
      }
      return
    }

    pinchStateRef.current = null
    if (e.touches.length !== 1 || !isEditMode || selectedItemId == null) {
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      return
    }

    const touch = e.touches[0]
    const { x: worldX, y: worldY } = clientToWorld(touch.clientX, touch.clientY)
    const selectedItem = localItemsRef.current.find((item) => item.id === selectedItemId)
    if (!selectedItem || selectedItem.locked) {
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      return
    }

    const touchHandle = getHandleAtCanvasPoint(canvas, worldX, worldY, selectedItem, {
      handleSize: isCoarsePointer ? HANDLE_SIZE_COARSE : HANDLE_SIZE_DESKTOP,
      hitSlop: HANDLE_TOUCH_HIT_SLOP,
    })
    if (touchHandle) {
      e.preventDefault()
      clearLongPressTimer()
      touchDragStateRef.current = null
      const orig = canvasToOriginal(canvas, worldX, worldY)
      resizeStartRef.current = {
        startX: orig.x,
        startY: orig.y,
        origX: selectedItem.x,
        origY: selectedItem.y,
        origW: selectedItem.width,
        origH: selectedItem.height,
      }
      resizeItemIdRef.current = selectedItem.id
      resizeHandleRef.current = touchHandle
      resizedItemCurrentRef.current = { ...selectedItem }
      touchResizeStateRef.current = { bagId: selectedItem.id, handle: touchHandle }
      didResizeRef.current = true
      setIsResizing(true)
      setResizeHandle(touchHandle)
      return
    }

    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItemsRef.current)
    if (!hitId || hitId !== selectedItemId) {
      touchDragStateRef.current = null
      return
    }

    const orig = canvasToOriginal(canvas, worldX, worldY)
    touchDragStateRef.current = {
      bagId: hitId,
      dx: orig.x - selectedItem.x,
      dy: orig.y - selectedItem.y,
      started: false,
    }

    clearLongPressTimer()
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true
      touchDragStateRef.current = null
      openContextMenuAt(hitId, touch.clientX, touch.clientY)
      clearLongPressTimer()
    }, LONG_PRESS_MS)
  }

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return

    if (e.touches.length >= 2) {
      e.preventDefault()
      if (touchResizeStateRef.current && isResizing) {
        handleResizeEnd.current()
      }
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null

      const first = e.touches[0]
      const second = e.touches[1]
      if (!pinchStateRef.current) {
        const center = getTouchCenter(first, second)
        const rect = canvas.getBoundingClientRect()
        pinchStateRef.current = {
          startDistance: getTouchDistance(first, second),
          startScale: scaleRef.current,
          anchorWorldX: (center.x - rect.left - offsetXRef.current) / scaleRef.current,
          anchorWorldY: (center.y - rect.top - offsetYRef.current) / scaleRef.current,
        }
      }

      const pinch = pinchStateRef.current
      if (!pinch || pinch.startDistance <= 0) return
      const center = getTouchCenter(first, second)
      const distance = getTouchDistance(first, second)
      const newScale = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinch.startScale * (distance / pinch.startDistance))
      )
      const rect = canvas.getBoundingClientRect()
      setScale(newScale)
      setOffsetX(center.x - rect.left - pinch.anchorWorldX * newScale)
      setOffsetY(center.y - rect.top - pinch.anchorWorldY * newScale)
      return
    }

    pinchStateRef.current = null
    const touch = e.touches[0]
    if (!touch) return

    const touchResize = touchResizeStateRef.current
    if (touchResize) {
      const item = localItemsRef.current.find((entry) => entry.id === touchResize.bagId)
      if (!item) return
      e.preventDefault()
      clearLongPressTimer()
      const { x: worldX, y: worldY } = clientToWorld(touch.clientX, touch.clientY)
      applyResizeAtCanvasPoint(worldX, worldY)
      return
    }

    e.preventDefault()

    if (longPressStartRef.current) {
      const moved = Math.hypot(
        touch.clientX - longPressStartRef.current.x,
        touch.clientY - longPressStartRef.current.y
      )
      if (moved > LONG_PRESS_MOVE_TOLERANCE) {
        clearLongPressTimer()
      }
    }

    const touchDrag = touchDragStateRef.current
    if (!touchDrag) return
    e.preventDefault()

    const item = localItemsRef.current.find((entry) => entry.id === touchDrag.bagId)
    if (!item) return
    if (!touchDrag.started) {
      touchDrag.started = true
      setIsDragging(true)
      setDragItemId(touchDrag.bagId)
      setDragOffset({ dx: touchDrag.dx, dy: touchDrag.dy })
      draggedItemCurrentRef.current = { ...item }
    }

    const { x: worldX, y: worldY } = clientToWorld(touch.clientX, touch.clientY)
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    const orig = canvasToOriginal(canvas, worldX, worldY)
    let newX = Math.round(orig.x - touchDrag.dx)
    let newY = Math.round(orig.y - touchDrag.dy)
    newX = Math.max(0, Math.min(newX, imageNaturalWidth - item.width))
    newY = Math.max(0, Math.min(newY, imageNaturalHeight - item.height))
    const updated = { ...item, x: newX, y: newY }
    draggedItemCurrentRef.current = updated
    didDragRef.current = true
    setLocalItems((prev) =>
      prev.map((entry) => (entry.id === touchDrag.bagId ? updated : entry))
    )
    drawOverlay(localItemsRef.current.map((entry) => (entry.id === touchDrag.bagId ? updated : entry)))
  }

  const handleCanvasTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length >= 2) return
    if (e.touches.length === 1) {
      pinchStateRef.current = null
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      return
    }

    clearLongPressTimer()
    pinchStateRef.current = null
    const wasResizing = touchResizeStateRef.current != null
    const wasDragging = touchDragStateRef.current?.started ?? false
    touchResizeStateRef.current = null
    touchDragStateRef.current = null

    if (wasResizing && isResizing) {
      handleResizeEnd.current()
    } else if (wasDragging && isDragging) {
      handleDragEnd.current()
    } else {
      setIsDragging(false)
      setDragItemId(null)
      draggedItemCurrentRef.current = null
    }
  }

  const handleCanvasTouchCancel = () => {
    clearLongPressTimer()
    pinchStateRef.current = null
    const wasResizing = touchResizeStateRef.current != null
    touchResizeStateRef.current = null
    touchDragStateRef.current = null
    if (wasResizing && isResizing) {
      handleResizeEnd.current()
    } else if (isDragging) {
      handleDragEnd.current()
    } else {
      setIsDragging(false)
      setDragItemId(null)
      draggedItemCurrentRef.current = null
    }
  }

  const performReorderFromMenu = async (direction: SwapDirection) => {
    const bagId = contextMenu?.bagId
    if (!bagId) return
    setContextMenu(null)

    const previousItems = localItemsRef.current
    const optimistic = reorderBagsOneStep(previousItems, bagId, direction)
    if (!optimistic.swapped) {
      clearLongPressTimer()
      return
    }

    setLocalItems(optimistic.nextItems)
    const result = await swapBagZIndex(supabase, bagId, direction)
    if (!result.swapped) {
      setLocalItems(previousItems)
      showTemporaryError(result.error ?? 'Unable to reorder box')
    }
  }

  const performDeleteFromMenu = async () => {
    const bagId = contextMenu?.bagId
    if (!bagId) return
    setContextMenu(null)

    if (!confirm('Are you sure you want to delete this box? This cannot be undone.')) {
      return
    }

    const previousItems = localItemsRef.current
    const existing = previousItems.find((item) => item.id === bagId)
    if (!existing) return
    const previousSelectedId = selectedItemIdRef.current
    const previousHighlightId = highlightBagIdRef.current
    const previousDetailsItemId = detailsItemId
    const wasDetailsOpenForItem =
      isDetailsOpenRef.current && previousDetailsItemId != null && previousDetailsItemId === bagId

    if (wasDetailsOpenForItem) {
      setIsDetailsOpen(false)
      setDetailsItemId(null)
      onOpenDetails(null)
    }

    setLocalItems((prev) => prev.filter((item) => item.id !== bagId))
    if (selectedItemId === bagId) {
      setSelectedItemId(null)
      onHighlightBagIdChange(null)
    }

    const { error: deleteError } = await supabase.from('bags').delete().eq('id', bagId)
    if (deleteError) {
      setLocalItems(previousItems)
      setSelectedItemId(previousSelectedId)
      onHighlightBagIdChange(previousHighlightId)
      if (wasDetailsOpenForItem && previousDetailsItemId != null) {
        setIsDetailsOpen(true)
        setDetailsItemId(previousDetailsItemId)
        onOpenDetails(previousDetailsItemId)
      }
      showTemporaryError(friendlySupabaseMessage(deleteError, 'Failed to delete box.'))
    }
  }

  const handleReorderFromMenu = (direction: SwapDirection) => {
    requestGuardedAction(() => performReorderFromMenu(direction), 'reorder_boxes')
  }

  const handleDeleteFromMenu = () => {
    requestGuardedAction(() => performDeleteFromMenu(), 'delete_box')
  }

  const createBagAtViewportCenter = async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !imageLoaded || !userId) return

    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    const width = 250
    const height = 120
    const rect = container.getBoundingClientRect()
    const centerCanvasX = (rect.width / 2 - offsetXRef.current) / scaleRef.current
    const centerCanvasY = (rect.height / 2 - offsetYRef.current) / scaleRef.current
    const centerOriginal = canvasToOriginal(canvas, centerCanvasX, centerCanvasY)

    let x = Math.round(centerOriginal.x - width / 2)
    let y = Math.round(centerOriginal.y - height / 2)
    x = Math.max(0, Math.min(x, imageNaturalWidth - width))
    y = Math.max(0, Math.min(y, imageNaturalHeight - height))

    const currentItems = localItemsRef.current
    const nextName = nextBoxName(currentItems.map((item) => item.name))
    const nextZIndex = currentItems.reduce((max, item) => Math.max(max, item.z_index), 0) + 1
    const tempId = `temp-${Date.now()}`
    const optimisticItem: Bag = {
      id: tempId,
      pack_id: packId,
      user_id: userId,
      x,
      y,
      width,
      height,
      created_at: new Date().toISOString(),
      name: nextName,
      color: '',
      bag_weight: 0,
      locked: false,
      updated_at: new Date().toISOString(),
      z_index: nextZIndex,
    }

    setSelectedItemId(tempId)
    onHighlightBagIdChange(null)
    setDetailsItemId(tempId)
    setIsDetailsOpen(true)
    onOpenDetails(tempId)

    setLocalItems((prev) => {
      const updated = [...prev, optimisticItem]
      drawOverlay(updated)
      return updated
    })

    const { data, error: insertError } = await supabase
      .from('bags')
      .insert({
        pack_id: packId,
        user_id: userId,
        x,
        y,
        width,
        height,
        name: nextName,
        color: '',
        bag_weight: 0,
        locked: false,
        updated_at: new Date().toISOString(),
        z_index: nextZIndex,
      })
      .select()
      .single()

    if (insertError || !data) {
      setLocalItems((prev) => {
        const updated = prev.filter((item) => item.id !== tempId)
        drawOverlay(updated)
        return updated
      })
      setSelectedItemId(null)
      setIsDetailsOpen(false)
      setDetailsItemId(null)
      onOpenDetails(null)
      setError(friendlySupabaseMessage(insertError, 'Failed to create bag'))
      setTimeout(() => setError(null), 5000)
      return
    }

    setLocalItems((prev) => {
      const updated = prev.map((item) => (item.id === tempId ? data : item))
      drawOverlay(updated)
      return updated
    })
    setSelectedItemId(data.id)
    setDetailsItemId((previous) => (previous === tempId ? data.id : previous))
    onOpenDetails(data.id)
  }

  useEffect(() => {
    if (addBagRequestId <= handledAddBagRequestRef.current) return
    if (!isEditMode) {
      handledAddBagRequestRef.current = addBagRequestId
      return
    }
    if (!imageLoaded || !userId) return

    handledAddBagRequestRef.current = addBagRequestId
    void createBagAtViewportCenter()
  }, [addBagRequestId, imageLoaded, isEditMode, userId])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (contextMenu != null) {
      setContextMenu(null)
    }
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    if (didResizeRef.current) {
      didResizeRef.current = false
      return
    }
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded || !userId) return

    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)

    // Hit test: clicking on an item selects it only (no add-item)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    if (hitId != null) {
      setSelectedItemId(hitId)
      if (highlightBagId !== hitId) {
        onHighlightBagIdChange(null)
      }
      return
    }

    // Click on empty space: clear selection only (add box comes from header button).
    setSelectedItemId(null)
    onHighlightBagIdChange(null)
  }

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isCoarsePointer) return
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    if (hitId != null) {
      openDetailsForBag(hitId)
    }
  }

  const requestCloseDetails = () => {
    requestGuardedAction(
      () => {
        closeDetailsImmediately()
      },
      'close_panel'
    )
  }

  const handleUpdateBag = async (
    bagId: string,
    patch: Partial<Pick<Bag, 'name' | 'color' | 'locked'> & { bag_weight_kg?: number }>
  ) => {
    const previousBag = localItemsRef.current.find((b) => b.id === bagId) ?? null
    if (!previousBag) return

    setLocalItems((prev) =>
      prev.map((b) => (b.id === bagId ? { ...b, ...patch } : b))
    )

    const payload: Record<string, unknown> = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.color !== undefined) payload.color = patch.color
    if (patch.bag_weight_kg !== undefined) payload.bag_weight_kg = patch.bag_weight_kg
    if (patch.locked !== undefined) payload.locked = patch.locked

    const { error: updateError } = await supabase
      .from('bags')
      .update(payload)
      .eq('id', bagId)

    if (updateError) {
      setLocalItems((prev) =>
        prev.map((b) => (b.id === bagId ? previousBag : b))
      )
      setDetailsSaveError(friendlySupabaseMessage(updateError, 'Failed to save bag'))
      setTimeout(() => setDetailsSaveError(null), 5000)
    } else {
      setDetailsSaveError(null)
    }
  }

  const applyToggleEditMode = () => {
    setContextMenu(null)
    if (isEditModeRef.current) {
      const dragId = dragItemIdRef.current
      if (dragId) {
        const start = dragStartPositionRef.current
        setLocalItems((prev) =>
          prev.map((it) => (it.id === dragId ? { ...it, x: start.x, y: start.y } : it))
        )
        setIsDragging(false)
        setDragItemId(null)
        dragItemIdRef.current = null
        draggedItemCurrentRef.current = null
        didDragRef.current = false
      }
      const resizeId = resizeItemIdRef.current
      if (resizeId) {
        const start = resizeStartRef.current
        if (start) {
          setLocalItems((prev) =>
            prev.map((it) =>
              it.id === resizeId
                ? { ...it, x: start.origX, y: start.origY, width: start.origW, height: start.origH }
                : it
            )
          )
        }
        setIsResizing(false)
        setResizeHandle(null)
        resizeItemIdRef.current = null
        resizeHandleRef.current = null
        resizedItemCurrentRef.current = null
        touchResizeStateRef.current = null
        resizeStartRef.current = null
        didResizeRef.current = false
      }
    }
    onToggleEditMode()
  }

  const requestToggleEditMode = useCallback(() => {
    if (isEditModeRef.current) {
      requestGuardedAction(() => {
        applyToggleEditMode()
      }, 'toggle_edit_off')
      return
    }
    applyToggleEditMode()
  }, [requestGuardedAction])

  useEffect(() => {
    if (!onRegisterToggleEditModeHandler) return
    onRegisterToggleEditModeHandler(requestToggleEditMode)
    return () => onRegisterToggleEditModeHandler(null)
  }, [onRegisterToggleEditModeHandler, requestToggleEditMode])

  const requestMoveItemsAction = useCallback(
    (action: () => Promise<void> | void) => {
      requestGuardedAction(action, 'move_items')
    },
    [requestGuardedAction]
  )

  useEffect(() => {
    if (!onRegisterMoveItemsGuardHandler) return
    onRegisterMoveItemsGuardHandler(requestMoveItemsAction)
    return () => onRegisterMoveItemsGuardHandler(null)
  }, [onRegisterMoveItemsGuardHandler, requestMoveItemsAction])

  const menuBagId = contextMenu?.bagId ?? null
  const canBringForward = menuBagId
    ? reorderBagsOneStep(localItems, menuBagId, 'forward').swapped
    : false
  const canSendBackward = menuBagId
    ? reorderBagsOneStep(localItems, menuBagId, 'backward').swapped
    : false
  const selectedItemGearAnchor = (() => {
    if (!selectedItem || !imageLoaded) return null
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null

    const right = Math.max(0, Math.min(imageNaturalWidth, selectedItem.x + selectedItem.width))
    const top = Math.max(0, Math.min(imageNaturalHeight, selectedItem.y))
    return {
      left: `${(right / imageNaturalWidth) * 100}%`,
      top: `${(top / imageNaturalHeight) * 100}%`,
    }
  })()

  return (
    <div className="w-full">
      <div className="relative">
      <div
        ref={containerRef}
        className="relative w-full bg-white rounded-lg shadow-lg overflow-hidden"
      >
        <div
          className="relative w-full"
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Background Image */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt={name}
            className="w-full h-auto block"
            style={{ maxWidth: '100%' }}
          />

          {/* Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{
                cursor: isPanning
                ? 'grabbing'
                : spacePressed
                  ? 'grab'
                  : isDragging
                    ? 'grabbing'
                    : isResizing
                      ? resizeHandle === 'tl' || resizeHandle === 'br'
                        ? 'nwse-resize'
                        : 'nesw-resize'
                      : hoveredHandle
                        ? hoveredHandle === 'tl' || hoveredHandle === 'br'
                          ? 'nwse-resize'
                          : 'nesw-resize'
                        : hoveredItemId && hoveredItemId === selectedItemId
                          ? 'grab'
                        : hoveredItemId
                            ? 'pointer'
                            : 'crosshair',
                touchAction: 'none',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onContextMenu={handleCanvasContextMenu}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            onTouchEnd={handleCanvasTouchEnd}
            onTouchCancel={handleCanvasTouchCancel}
            onMouseLeave={() => {
              setHoveredItemId(null)
              setHoveredHandle(null)
            }}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
          />
          {selectedItem && selectedItemGearAnchor && (
            <button
              type="button"
              className="absolute z-20 -translate-x-[calc(100%+6px)] translate-y-1 inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent p-0 text-black transition-colors hover:text-black focus:outline-none focus:ring-2 focus:ring-slate-300"
              style={selectedItemGearAnchor}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openDetailsForBag(selectedItem.id)
              }}
              aria-label={`Open details for ${selectedItem.name}`}
            >
              <GearIcon />
            </button>
          )}
        </div>
      </div>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Box actions"
        >
          <button
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={() => void handleReorderFromMenu('forward')}
            disabled={!canBringForward}
          >
            Bring forward
          </button>
          <button
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={() => void handleReorderFromMenu('backward')}
            disabled={!canSendBackward}
          >
            Send backward
          </button>
          <button
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => void handleDeleteFromMenu()}
          >
            Delete
          </button>
        </div>
      )}
      {isDetailsOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-10"
            role="button"
            tabIndex={-1}
            onClick={requestCloseDetails}
            aria-label="Close panel"
          />
          <DetailsPanel
            ref={detailsPanelRef}
            bag={detailsItem}
            isEditMode={isEditMode}
            onClose={requestCloseDetails}
            onToggleEditMode={requestToggleEditMode}
            onUpdateBag={handleUpdateBag}
            requestMoveItemsAction={requestMoveItemsAction}
            enableEscapeClose={!isCoarsePointer}
            onSaveSuccess={(bagRow) =>
              setLocalItems((prev) =>
                prev.map((b) => (b.id === bagRow.id ? { ...b, ...bagRow } : b))
              )
            }
            saveError={detailsSaveError}
            clearSaveError={() => setDetailsSaveError(null)}
          />
        </>
      )}
      {isUnsavedGuardOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-slate-900">Unsaved changes</h3>
            <p className="mt-1 text-sm text-slate-600">
              You have unsaved changes. Save before continuing?
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                onClick={handleUnsavedGuardCancel}
                disabled={unsavedGuardBusyAction != null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                onClick={() => {
                  void handleUnsavedGuardSave()
                }}
                disabled={unsavedGuardBusyAction != null}
              >
                {unsavedGuardBusyAction === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-60"
                onClick={() => {
                  void handleUnsavedGuardDiscard()
                }}
                disabled={unsavedGuardBusyAction != null}
              >
                {unsavedGuardBusyAction === 'discard' ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}
    </div>
  )
}
