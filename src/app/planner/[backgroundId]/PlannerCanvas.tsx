'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bag } from '@/types'
import { supabase } from '@/lib/supabase/browser'
import { friendlySupabaseMessage } from '@/lib/supabase/errorMapping'
import { DetailsPanel, type DetailsPanelHandle } from '@/components/planner/DetailsPanel'
import { nextBoxName } from '@/lib/boxes/naming'
import { decideBoxLabelLayout } from '@/lib/boxes/labels'
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
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_MAX_DISTANCE_PX = 24
const VIEWPORT_WHEEL_IDLE_MS = 120
const USE_DIRECT_VIEWPORT_TRANSFORM = true
const PLANNER_PERF_DEBUG = process.env.NEXT_PUBLIC_PLANNER_PERF_DEBUG === 'true'
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br'
type TouchPoint = { clientX: number; clientY: number }
type Viewport = { scale: number; offsetX: number; offsetY: number }

interface ResizeStart {
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
}

function getTouchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function getTouchCenter(a: TouchPoint, b: TouchPoint): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  }
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
  const transformLayerRef = useRef<HTMLDivElement>(null)
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
  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 })
  const pendingViewportRef = useRef<Viewport | null>(null)
  const viewportRafRef = useRef<number | null>(null)
  const wheelGestureIdleTimeoutRef = useRef<number | null>(null)
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
  const lastTapRef = useRef<{
    bagId: string
    clientX: number
    clientY: number
    timestamp: number
  } | null>(null)
  const pinchStateRef = useRef<{
    startDistance: number
    startScale: number
    anchorWorldX: number
    anchorWorldY: number
  } | null>(null)
  const autoCenteredSearchKeyRef = useRef<string | null>(null)
  const drawRafRef = useRef<number | null>(null)
  const pendingDrawItemsRef = useRef<Bag[] | null>(null)
  const perfMetricsRef = useRef<{
    drawDurations: number[]
    interactionFrames: number[]
    lastInteractionTs: number
    drawCount: number
  }>({
    drawDurations: [],
    interactionFrames: [],
    lastInteractionTs: 0,
    drawCount: 0,
  })

  const detailsItem =
    detailsItemId != null ? localItems.find((i) => i.id === detailsItemId) ?? null : null
  const selectedItemId = selectedBagId
  const setSelectedItemId = onSelectBagId

  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 2.5

  const HANDLE_SIZE_DESKTOP = 8
  const HANDLE_SIZE_COARSE = 12
  const HANDLE_TOUCH_HIT_SLOP = 8
  const MIN_ITEM_SIZE = 40
  const LABEL_TRUNCATE_THRESHOLD = 8
  const VERTICAL_LABEL_MIN_LANE_WIDTH = 24

  useEffect(() => {
    dragItemIdRef.current = dragItemId
    selectedItemIdRef.current = selectedItemId
    highlightBagIdRef.current = highlightBagId
    localItemsRef.current = localItems
    resizeHandleRef.current = resizeHandle
    isEditModeRef.current = isEditMode
    isDetailsOpenRef.current = isDetailsOpen
  }, [
    dragItemId,
    highlightBagId,
    isDetailsOpen,
    isEditMode,
    localItems,
    resizeHandle,
    selectedItemId,
  ])

  function appendPerfSample(samples: number[], value: number, maxSamples = 240) {
    samples.push(value)
    if (samples.length > maxSamples) samples.shift()
  }

  function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
    return sorted[index]
  }

  const recordInteractionFrame = useCallback(() => {
    if (!PLANNER_PERF_DEBUG) return
    const now = performance.now()
    const metrics = perfMetricsRef.current
    if (metrics.lastInteractionTs > 0) {
      appendPerfSample(metrics.interactionFrames, now - metrics.lastInteractionTs)
    }
    metrics.lastInteractionTs = now
  }, [])

  const logPerfSnapshotIfNeeded = useCallback(() => {
    if (!PLANNER_PERF_DEBUG) return
    const metrics = perfMetricsRef.current
    metrics.drawCount += 1
    if (metrics.drawCount % 120 !== 0) return
    const drawP95 = percentile(metrics.drawDurations, 0.95)
    const frameP95 = percentile(metrics.interactionFrames, 0.95)
    console.debug('[planner-perf]', {
      drawP95Ms: Number(drawP95.toFixed(2)),
      frameP95Ms: Number(frameP95.toFixed(2)),
      drawSamples: metrics.drawDurations.length,
      frameSamples: metrics.interactionFrames.length,
    })
  }, [])

  function setHoveredItemIdIfChanged(nextId: string | null) {
    setHoveredItemId((previous) => (previous === nextId ? previous : nextId))
  }

  function setHoveredHandleIfChanged(nextHandle: ResizeHandle | null) {
    setHoveredHandle((previous) => (previous === nextHandle ? previous : nextHandle))
  }

  const getViewportSnapshot = useCallback((): Viewport => {
    return pendingViewportRef.current ?? viewportRef.current
  }, [])

  const applyViewportToDom = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport
    const transformLayer = transformLayerRef.current
    if (!transformLayer) return
    if (USE_DIRECT_VIEWPORT_TRANSFORM) {
      transformLayer.style.transform = `translate3d(${nextViewport.offsetX}px, ${nextViewport.offsetY}px, 0) scale(${nextViewport.scale})`
      return
    }
    transformLayer.style.setProperty('--planner-tx', `${nextViewport.offsetX}px`)
    transformLayer.style.setProperty('--planner-ty', `${nextViewport.offsetY}px`)
    transformLayer.style.setProperty('--planner-scale', `${nextViewport.scale}`)
  }, [])

  const beginViewportGesture = useCallback(() => {
    const transformLayer = transformLayerRef.current
    if (!transformLayer) return
    transformLayer.style.willChange = 'transform'
  }, [])

  const endViewportGesture = useCallback(() => {
    const transformLayer = transformLayerRef.current
    if (!transformLayer) return
    transformLayer.style.willChange = 'auto'
  }, [])

  const flushViewportUpdate = useCallback(() => {
    viewportRafRef.current = null
    const nextViewport = pendingViewportRef.current
    pendingViewportRef.current = null
    if (!nextViewport) return
    applyViewportToDom(nextViewport)
  }, [applyViewportToDom])

  const queueViewportUpdate = useCallback(
    (nextViewport: Viewport) => {
      pendingViewportRef.current = nextViewport
      if (viewportRafRef.current != null) return
      viewportRafRef.current = window.requestAnimationFrame(flushViewportUpdate)
    },
    [flushViewportUpdate]
  )

  const scheduleWheelGestureEnd = useCallback(() => {
    if (wheelGestureIdleTimeoutRef.current != null) {
      window.clearTimeout(wheelGestureIdleTimeoutRef.current)
    }
    wheelGestureIdleTimeoutRef.current = window.setTimeout(() => {
      endViewportGesture()
      wheelGestureIdleTimeoutRef.current = null
    }, VIEWPORT_WHEEL_IDLE_MS)
  }, [endViewportGesture])

  const clientToWorld = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const viewport = getViewportSnapshot()
    const rect = el.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    return {
      x: (mouseX - viewport.offsetX) / viewport.scale,
      y: (mouseY - viewport.offsetY) / viewport.scale,
    }
  }, [getViewportSnapshot])

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

  const drawOverlay = useCallback((itemsToDraw?: Bag[]) => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return
    const renderItems = itemsToDraw ?? localItemsRef.current

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const drawStartedAt = PLANNER_PERF_DEBUG ? performance.now() : 0

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Compute scale factors (items are stored in original image pixel coordinates)
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    
    if (imageNaturalWidth > 0 && imageNaturalHeight > 0) {
      const scaleX = canvas.width / imageNaturalWidth
      const scaleY = canvas.height / imageNaturalHeight

      // Draw items using scaled coordinates and bag.color, lowest z-index first.
      getRenderOrderedItems(renderItems).forEach((item) => {
        const itemX = item.x * scaleX
        const itemY = item.y * scaleY
        const itemWidth = item.width * scaleX
        const itemHeight = item.height * scaleY
        const [r, g, b] = hexToRgb(item.color ?? '#888888')
        const isSelected = item.id === selectedItemId
        const isHighlighted = !isSelected && highlightBagId != null && item.id === highlightBagId
        const isHovered = item.id === hoveredItemId

        // Outer ring to make selected/linked boxes easier to spot on busy backgrounds.
        if (isSelected) {
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.28)`
          ctx.lineWidth = 6
          ctx.strokeRect(itemX - 3, itemY - 3, itemWidth + 6, itemHeight + 6)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
          ctx.lineWidth = 1
          ctx.strokeRect(itemX - 1.5, itemY - 1.5, itemWidth + 3, itemHeight + 3)
        } else if (isHighlighted) {
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`
          ctx.lineWidth = 4
          ctx.strokeRect(itemX - 2, itemY - 2, itemWidth + 4, itemHeight + 4)
        }

        // Fill with bag color. Selected/hovered items get stronger contrast.
        const fillAlpha = isSelected ? 0.22 : isHighlighted ? 0.18 : isHovered ? 0.16 : 0.12
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillAlpha})`
        ctx.fillRect(itemX, itemY, itemWidth, itemHeight)

        // Border: bag color, higher alpha; thickness by state
        const strokeAlpha = isSelected ? 0.95 : isHighlighted ? 0.85 : isHovered ? 0.78 : 0.65
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${strokeAlpha})`
        ctx.lineWidth = isSelected ? 3 : isHovered ? 2.25 : 1.5
        ctx.strokeRect(itemX, itemY, itemWidth, itemHeight)

        // Box label in top-left; rotate vertically when horizontal label is hidden or heavily truncated.
        const labelPaddingX = 6
        const labelPaddingY = 4
        const labelFontSize = 12
        const labelHeight = labelFontSize + 4
        const maxLabelWidth = itemWidth - labelPaddingX * 2
        const maxLabelHeight = itemHeight - labelPaddingY * 2
        const verticalMaxLabelRun =
          itemWidth >= VERTICAL_LABEL_MIN_LANE_WIDTH ? itemHeight - labelPaddingY * 2 - 4 : 0
        if (maxLabelWidth > 0 && maxLabelHeight > 0) {
          ctx.font = `600 ${labelFontSize}px ui-sans-serif, system-ui, sans-serif`
          ctx.textBaseline = 'top'
          const labelLayout = decideBoxLabelLayout({
            rawName: item.name,
            horizontalMaxWidth: maxLabelWidth,
            verticalMaxRun: verticalMaxLabelRun,
            measureText: (value) => ctx.measureText(value).width,
            canRotateVertical: true,
            options: {
              aggressiveTruncateThreshold: LABEL_TRUNCATE_THRESHOLD,
            },
          })
          if (labelLayout) {
            const textWidth = ctx.measureText(labelLayout.text).width
            const bgX = itemX + labelPaddingX - 2
            const bgY = itemY + labelPaddingY - 1
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
            if (labelLayout.orientation === 'horizontal') {
              if (maxLabelHeight >= labelHeight) {
                const bgWidth = textWidth + 4
                const bgHeight = labelHeight
                ctx.fillRect(bgX, bgY, bgWidth, bgHeight)
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
                ctx.fillText(labelLayout.text, itemX + labelPaddingX, itemY + labelPaddingY)
              }
            } else {
              const bgWidth = labelHeight
              const bgHeight = textWidth + 4
              if (bgWidth <= itemWidth && bgHeight <= itemHeight) {
                ctx.fillRect(bgX, bgY, bgWidth, bgHeight)
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
                ctx.save()
                ctx.translate(itemX + labelPaddingX, itemY + labelPaddingY)
                ctx.rotate(Math.PI / 2)
                ctx.fillText(labelLayout.text, 0, -labelHeight + 2)
                ctx.restore()
              }
            }
          }
        }

        // Corner handles when selected: bright interior + colored outline for better visibility.
        if (isSelected) {
          const handleSize = isCoarsePointer ? HANDLE_SIZE_COARSE : HANDLE_SIZE_DESKTOP
          ctx.fillStyle = 'rgba(255, 255, 255, 0.98)'
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`
          ctx.lineWidth = 2
          const centerDotSize = Math.max(2, Math.floor(handleSize * 0.35))
          const corners = [
            [itemX, itemY],
            [itemX + itemWidth - handleSize, itemY],
            [itemX + itemWidth - handleSize, itemY + itemHeight - handleSize],
            [itemX, itemY + itemHeight - handleSize],
          ]
          corners.forEach(([cx, cy]) => {
            ctx.fillRect(cx, cy, handleSize, handleSize)
            ctx.strokeRect(cx, cy, handleSize, handleSize)
            const dotX = cx + (handleSize - centerDotSize) / 2
            const dotY = cy + (handleSize - centerDotSize) / 2
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`
            ctx.fillRect(dotX, dotY, centerDotSize, centerDotSize)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.98)'
          })
        }
      })
    }

    if (PLANNER_PERF_DEBUG) {
      const drawDuration = performance.now() - drawStartedAt
      appendPerfSample(perfMetricsRef.current.drawDurations, drawDuration)
      logPerfSnapshotIfNeeded()
    }
  }, [
    highlightBagId,
    hoveredItemId,
    imageLoaded,
    isCoarsePointer,
    logPerfSnapshotIfNeeded,
    selectedItemId,
  ])

  const flushScheduledDraw = useCallback(() => {
    drawRafRef.current = null
    const pendingItems = pendingDrawItemsRef.current
    pendingDrawItemsRef.current = null
    drawOverlay(pendingItems ?? undefined)
  }, [drawOverlay])

  const scheduleOverlayDraw = useCallback((itemsToDraw?: Bag[]) => {
    pendingDrawItemsRef.current = itemsToDraw ?? null
    if (drawRafRef.current != null) return
    drawRafRef.current = window.requestAnimationFrame(flushScheduledDraw)
  }, [flushScheduledDraw])

  const updateCanvasSize = useCallback(() => {
    const img = imageRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    // Match canvas size to rendered image size
    const displayWidth = Math.max(1, Math.round(img.clientWidth))
    const displayHeight = Math.max(1, Math.round(img.clientHeight))

    // Avoid expensive canvas resets when dimensions did not change.
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth
      canvas.height = displayHeight

      // Set canvas CSS to match exactly (no scaling)
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`
    }

    // Redraw overlay
    scheduleOverlayDraw()
  }, [scheduleOverlayDraw])

  useEffect(() => {
    applyViewportToDom(viewportRef.current)
  }, [applyViewportToDom])

  useEffect(() => {
    const img = imageRef.current
    if (!img) return

    const handleImageLoad = () => {
      // Store original image dimensions
      imageNaturalWidthRef.current = img.naturalWidth
      imageNaturalHeightRef.current = img.naturalHeight
      setImageLoaded(true)
      applyViewportToDom(viewportRef.current)
      updateCanvasSize()
    }

    if (img.complete) {
      handleImageLoad()
    } else {
      img.addEventListener('load', handleImageLoad)
      return () => img.removeEventListener('load', handleImageLoad)
    }
  }, [applyViewportToDom, imageUrl, updateCanvasSize])

  useEffect(() => {
    if (!imageLoaded) return
    const img = imageRef.current
    if (!img) return

    const handleResize = () => updateCanvasSize()
    window.addEventListener('resize', handleResize)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateCanvasSize())
      observer.observe(img)
    }

    updateCanvasSize()
    return () => {
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [imageLoaded, imageUrl, updateCanvasSize])

  useEffect(() => {
    if (!imageLoaded) return
    scheduleOverlayDraw()
  }, [
    highlightBagId,
    hoveredHandle,
    hoveredItemId,
    imageLoaded,
    isCoarsePointer,
    localItems,
    scheduleOverlayDraw,
    selectedItemId,
  ])

  useEffect(() => {
    if (!imageLoaded) return
    if (!selectedItemId || highlightBagId !== selectedItemId) return

    const autoCenterKey = `${packId}:${selectedItemId}`
    if (autoCenteredSearchKeyRef.current === autoCenterKey) return

    const canvas = canvasRef.current
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return

    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    const targetBag = localItemsRef.current.find((item) => item.id === selectedItemId)
    if (!targetBag) return

    const scaleX = canvas.width / imageNaturalWidth
    const scaleY = canvas.height / imageNaturalHeight
    const bagCenterX = (targetBag.x + targetBag.width / 2) * scaleX
    const bagCenterY = (targetBag.y + targetBag.height / 2) * scaleY
    const viewport = getViewportSnapshot()

    queueViewportUpdate({
      scale: viewport.scale,
      offsetX: canvas.width / 2 - bagCenterX * viewport.scale,
      offsetY: canvas.height / 2 - bagCenterY * viewport.scale,
    })
    autoCenteredSearchKeyRef.current = autoCenterKey
  }, [
    getViewportSnapshot,
    highlightBagId,
    imageLoaded,
    localItems,
    packId,
    queueViewportUpdate,
    selectedItemId,
  ])

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current)
        drawRafRef.current = null
      }
      if (viewportRafRef.current != null) {
        cancelAnimationFrame(viewportRafRef.current)
        viewportRafRef.current = null
      }
      if (wheelGestureIdleTimeoutRef.current != null) {
        window.clearTimeout(wheelGestureIdleTimeoutRef.current)
        wheelGestureIdleTimeoutRef.current = null
      }
      endViewportGesture()
    }
  }, [endViewportGesture])

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
    const frameId = window.requestAnimationFrame(() => {
      setLocalItems(bags)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [packId, bags])

  /** Returns true if keyboard events should go to the element (no canvas shortcuts). */
  const isTypingTarget = useCallback((target: EventTarget | null): boolean => {
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
  }, [])

  const skipWhenTyping = useCallback((e: KeyboardEvent): boolean => {
    return isTypingTarget(e.target) || isTypingTarget(document.activeElement)
  }, [isTypingTarget])

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
    const apply = () => {
      const coarse = media.matches
      setIsCoarsePointer(coarse)
      if (coarse) {
        if (longPressTimerRef.current != null) {
          window.clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        longPressStartRef.current = null
        setContextMenu(null)
      }
    }
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
      requestGuardedAction(async () => {
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
  }, [detailsItemId, onHighlightBagIdChange, onOpenDetails, requestGuardedAction, setSelectedItemId, skipWhenTyping])

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

  const handleWheel = useCallback((e: WheelEvent) => {
    const el = containerRef.current
    if (!el) return
    e.preventDefault()
    beginViewportGesture()
    scheduleWheelGestureEnd()
    const viewport = getViewportSnapshot()
    if (e.ctrlKey) {
      const rect = el.getBoundingClientRect()
      const worldX = (e.clientX - rect.left - viewport.offsetX) / viewport.scale
      const worldY = (e.clientY - rect.top - viewport.offsetY) / viewport.scale
      const newScale = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, viewport.scale * (e.deltaY < 0 ? 1.1 : 0.9))
      )
      queueViewportUpdate({
        scale: newScale,
        offsetX: e.clientX - rect.left - worldX * newScale,
        offsetY: e.clientY - rect.top - worldY * newScale,
      })
    } else {
      queueViewportUpdate({
        scale: viewport.scale,
        offsetX: viewport.offsetX - e.deltaX,
        offsetY: viewport.offsetY - e.deltaY,
      })
    }
    recordInteractionFrame()
  }, [
    MAX_ZOOM,
    MIN_ZOOM,
    beginViewportGesture,
    getViewportSnapshot,
    queueViewportUpdate,
    recordInteractionFrame,
    scheduleWheelGestureEnd,
  ])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const getResizedBagFromPointer = useCallback((
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
  }, [MIN_ITEM_SIZE])

  const applyResizeAtCanvasPoint = useCallback((canvasX: number, canvasY: number) => {
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
    const draftItems = localItemsRef.current.map((entry) => (entry.id === id ? updated : entry))
    recordInteractionFrame()
    scheduleOverlayDraw(draftItems)
  }, [getResizedBagFromPointer, recordInteractionFrame, scheduleOverlayDraw])

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return
    if (spacePressedRef.current) {
      beginViewportGesture()
      const viewport = getViewportSnapshot()
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panStartOffsetRef.current = { x: viewport.offsetX, y: viewport.offsetY }
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

  const finishDrag = useCallback(async () => {
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
    const x = Math.round(item.x)
    const y = Math.round(item.y)
    setLocalItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, x, y } : it))
    )
    const { error: updateError } = await supabase
      .from('bags')
      .update({ x, y })
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
  }, [])

  const finishResize = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    if (!isDragging) return
    const onMouseUp = () => {
      void finishDrag()
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [finishDrag, isDragging])

  useEffect(() => {
    if (!isPanning) return
    const onPanEnd = () => {
      endViewportGesture()
      setIsPanning(false)
    }
    window.addEventListener('mouseup', onPanEnd)
    return () => window.removeEventListener('mouseup', onPanEnd)
  }, [endViewportGesture, isPanning])

  useEffect(() => {
    if (!isResizing) return
    const onResizeMove = (e: MouseEvent) => {
      const world = clientToWorld(e.clientX, e.clientY)
      applyResizeAtCanvasPoint(world.x, world.y)
    }
    const onResizeEnd = () => {
      void finishResize()
    }
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)
    return () => {
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeEnd)
    }
  }, [applyResizeAtCanvasPoint, clientToWorld, finishResize, isResizing])

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (isPanning) {
      const viewport = getViewportSnapshot()
      queueViewportUpdate({
        scale: viewport.scale,
        offsetX: panStartOffsetRef.current.x + (e.clientX - panStartRef.current.x),
        offsetY: panStartOffsetRef.current.y + (e.clientY - panStartRef.current.y),
      })
      recordInteractionFrame()
      return
    }
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current

    if (isDragging && dragItemId) {
      const item =
        draggedItemCurrentRef.current ?? localItemsRef.current.find((entry) => entry.id === dragItemId)
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
      const draftItems = localItemsRef.current.map((entry) =>
        entry.id === dragItemId ? updated : entry
      )
      recordInteractionFrame()
      scheduleOverlayDraw(draftItems)
      return
    }

    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    setHoveredItemIdIfChanged(hitId ?? null)
    if (hitId && hitId === selectedItemId) {
      const item = localItems.find((i) => i.id === hitId)
      const handle = item ? getHandleAtCanvasPoint(canvas, worldX, worldY, item) : null
      setHoveredHandleIfChanged(handle)
    } else {
      setHoveredHandleIfChanged(null)
    }
  }

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      endViewportGesture()
      setIsPanning(false)
      return
    }
    if (isResizing) {
      void finishResize()
    } else if (isDragging && dragItemId) {
      void finishDrag()
    }
  }

  const openContextMenuAt = (bagId: string, x: number, y: number) => {
    setContextMenu({ bagId, x, y })
  }

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (isCoarsePointer) return
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
      beginViewportGesture()
      if (touchResizeStateRef.current && isResizing) {
        void finishResize()
      }
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      setContextMenu(null)

      const first = e.touches[0]
      const second = e.touches[1]
      const center = getTouchCenter(first, second)
      const rect = canvas.getBoundingClientRect()
      const viewport = getViewportSnapshot()
      const anchorWorldX = (center.x - rect.left - viewport.offsetX) / viewport.scale
      const anchorWorldY = (center.y - rect.top - viewport.offsetY) / viewport.scale
      pinchStateRef.current = {
        startDistance: getTouchDistance(first, second),
        startScale: viewport.scale,
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

    if (!isCoarsePointer) {
      clearLongPressTimer()
      longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
      longPressTimerRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = true
        touchDragStateRef.current = null
        openContextMenuAt(hitId, touch.clientX, touch.clientY)
        clearLongPressTimer()
      }, LONG_PRESS_MS)
    }
  }

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return

    if (e.touches.length >= 2) {
      e.preventDefault()
      if (touchResizeStateRef.current && isResizing) {
        void finishResize()
      }
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null

      const first = e.touches[0]
      const second = e.touches[1]
      if (!pinchStateRef.current) {
        beginViewportGesture()
        const center = getTouchCenter(first, second)
        const rect = canvas.getBoundingClientRect()
        const viewport = getViewportSnapshot()
        pinchStateRef.current = {
          startDistance: getTouchDistance(first, second),
          startScale: viewport.scale,
          anchorWorldX: (center.x - rect.left - viewport.offsetX) / viewport.scale,
          anchorWorldY: (center.y - rect.top - viewport.offsetY) / viewport.scale,
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
      queueViewportUpdate({
        scale: newScale,
        offsetX: center.x - rect.left - pinch.anchorWorldX * newScale,
        offsetY: center.y - rect.top - pinch.anchorWorldY * newScale,
      })
      recordInteractionFrame()
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
    const draftItems = localItemsRef.current.map((entry) =>
      entry.id === touchDrag.bagId ? updated : entry
    )
    recordInteractionFrame()
    scheduleOverlayDraw(draftItems)
  }

  const handleCanvasTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length >= 2) return
    if (e.touches.length === 1) {
      endViewportGesture()
      pinchStateRef.current = null
      clearLongPressTimer()
      touchDragStateRef.current = null
      touchResizeStateRef.current = null
      return
    }

    endViewportGesture()
    clearLongPressTimer()
    pinchStateRef.current = null
    const wasResizing = touchResizeStateRef.current != null
    const wasDragging = touchDragStateRef.current?.started ?? false
    touchResizeStateRef.current = null
    touchDragStateRef.current = null

    if (wasResizing && isResizing) {
      void finishResize()
    } else if (wasDragging && isDragging) {
      void finishDrag()
    } else {
      setIsDragging(false)
      setDragItemId(null)
      draggedItemCurrentRef.current = null
    }
  }

  const handleCanvasTouchCancel = () => {
    endViewportGesture()
    clearLongPressTimer()
    pinchStateRef.current = null
    const wasResizing = touchResizeStateRef.current != null
    touchResizeStateRef.current = null
    touchDragStateRef.current = null
    if (wasResizing && isResizing) {
      void finishResize()
    } else if (isDragging) {
      void finishDrag()
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

  const deleteBagById = async (bagId: string) => {
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
    if (previousSelectedId === bagId) {
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
    const bagId = contextMenu?.bagId
    if (!bagId) return
    setContextMenu(null)
    requestGuardedAction(() => deleteBagById(bagId), 'delete_box')
  }

  const handleDeleteFromDetails = () => {
    if (!detailsItemId) return
    requestGuardedAction(() => deleteBagById(detailsItemId), 'delete_box')
  }

  const createBagAtViewportCenter = useCallback(async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !imageLoaded || !userId) return

    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    const width = 250
    const height = 120
    const rect = container.getBoundingClientRect()
    const viewport = getViewportSnapshot()
    const centerCanvasX = (rect.width / 2 - viewport.offsetX) / viewport.scale
    const topAreaCanvasY = (rect.height * 0.2 - viewport.offsetY) / viewport.scale
    const centerOriginal = canvasToOriginal(canvas, centerCanvasX, topAreaCanvasY)

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
      return [...prev, optimisticItem]
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
        return prev.filter((item) => item.id !== tempId)
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
      return prev.map((item) => (item.id === tempId ? data : item))
    })
    setSelectedItemId(data.id)
    setDetailsItemId((previous) => (previous === tempId ? data.id : previous))
    onOpenDetails(data.id)
  }, [
    getViewportSnapshot,
    imageLoaded,
    onHighlightBagIdChange,
    onOpenDetails,
    packId,
    setSelectedItemId,
    userId,
  ])

  useEffect(() => {
    if (addBagRequestId <= handledAddBagRequestRef.current) return
    if (!isEditMode) {
      handledAddBagRequestRef.current = addBagRequestId
      return
    }
    if (!imageLoaded || !userId) return

    handledAddBagRequestRef.current = addBagRequestId
    const frameId = window.requestAnimationFrame(() => {
      void createBagAtViewportCenter()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [addBagRequestId, createBagAtViewportCenter, imageLoaded, isEditMode, userId])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (contextMenu != null) {
      setContextMenu(null)
    }
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      lastTapRef.current = null
      return
    }
    if (didDragRef.current) {
      didDragRef.current = false
      lastTapRef.current = null
      return
    }
    if (didResizeRef.current) {
      didResizeRef.current = false
      lastTapRef.current = null
      return
    }
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return

    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)

    // Hit test: clicking on an item selects it only (no add-item)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    if (hitId != null) {
      if (isCoarsePointer) {
        const previousTap = lastTapRef.current
        const now = Date.now()
        const isDoubleTap =
          previousTap != null &&
          previousTap.bagId === hitId &&
          now - previousTap.timestamp <= DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - previousTap.clientX, e.clientY - previousTap.clientY) <=
            DOUBLE_TAP_MAX_DISTANCE_PX

        setSelectedItemId(hitId)
        if (highlightBagId !== hitId) {
          onHighlightBagIdChange(null)
        }

        if (isDoubleTap) {
          openDetailsForBag(hitId)
          lastTapRef.current = null
          return
        }

        lastTapRef.current = {
          bagId: hitId,
          clientX: e.clientX,
          clientY: e.clientY,
          timestamp: now,
        }
        return
      }
      setSelectedItemId(hitId)
      if (highlightBagId !== hitId) {
        onHighlightBagIdChange(null)
      }
      return
    }

    // Click on empty space: clear selection only (add box comes from header button).
    setSelectedItemId(null)
    onHighlightBagIdChange(null)
    lastTapRef.current = null
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

  const applyToggleEditMode = useCallback(() => {
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
  }, [onToggleEditMode])

  const requestToggleEditMode = useCallback(() => {
    if (isEditModeRef.current) {
      requestGuardedAction(() => {
        applyToggleEditMode()
      }, 'toggle_edit_off')
      return
    }
    applyToggleEditMode()
  }, [applyToggleEditMode, requestGuardedAction])

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

  return (
    <div className="w-full">
      <div className="relative">
        <div
          ref={containerRef}
          className="relative w-full bg-white rounded-lg shadow-lg overflow-hidden"
        >
          <div
            ref={transformLayerRef}
            className="relative w-full"
            style={{
              transform: USE_DIRECT_VIEWPORT_TRANSFORM
                ? 'translate3d(0px, 0px, 0) scale(1)'
                : 'translate3d(var(--planner-tx, 0px), var(--planner-ty, 0px), 0) scale(var(--planner-scale, 1))',
              transformOrigin: '0 0',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
              WebkitTransformStyle: 'preserve-3d',
              contain: 'paint',
              willChange: 'auto',
            }}
          >
            {/* Background Image */}
            <Image
              ref={imageRef}
              src={imageUrl}
              alt={name}
              width={1}
              height={1}
              priority
              unoptimized
              className="w-full h-auto block"
              style={{
                width: '100%',
                height: 'auto',
                maxWidth: '100%',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
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
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
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
                setHoveredItemIdIfChanged(null)
                setHoveredHandleIfChanged(null)
              }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
            />
          </div>
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
          {!isCoarsePointer && (
            <div
              className="fixed inset-0 bg-black/20 z-10"
              role="button"
              tabIndex={-1}
              onClick={requestCloseDetails}
              aria-label="Close panel"
            />
          )}
          <DetailsPanel
            ref={detailsPanelRef}
            bag={detailsItem}
            isEditMode={isEditMode}
            isCoarsePointer={isCoarsePointer}
            onClose={requestCloseDetails}
            onToggleEditMode={requestToggleEditMode}
            onDeleteBox={handleDeleteFromDetails}
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
      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}
    </div>
  )
}
