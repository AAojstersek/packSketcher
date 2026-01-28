'use client'

import { useEffect, useRef, useState } from 'react'
import type { Bag } from '@/types'
import { supabase } from '@/lib/supabase/browser'
import { DetailsPanel } from '@/components/planner/DetailsPanel'

// Survives remounts (Strict Mode / fast refresh) so we don't overwrite localItems after resize/drag.
let lastSyncedPackId: string | null = null

interface PlannerCanvasProps {
  imageUrl: string
  name: string
  packId: string
  bags: Bag[]
}

export function PlannerCanvas({ imageUrl, name, packId, bags }: PlannerCanvasProps) {
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const dragStartPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const didDragRef = useRef(false)
  const dragItemIdRef = useRef<string | null>(null)
  const draggedItemCurrentRef = useRef<Bag | null>(null)
  const selectedItemIdRef = useRef<string | null>(null)
  const localItemsRef = useRef<Bag[]>(localItems)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const resizeStartRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const resizeItemIdRef = useRef<string | null>(null)
  const resizedItemCurrentRef = useRef<Bag | null>(null)
  const resizeHandleRef = useRef<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const didResizeRef = useRef(false)
  const [hoveredHandle, setHoveredHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)
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
  const [isEditMode, setIsEditMode] = useState(false)
  const isEditModeRef = useRef(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const isDetailsOpenRef = useRef(false)
  const [detailsItemId, setDetailsItemId] = useState<string | null>(null)
  const [detailsSaveError, setDetailsSaveError] = useState<string | null>(null)

  const detailsItem =
    detailsItemId != null ? localItems.find((i) => i.id === detailsItemId) ?? null : null

  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 2.5

  const HANDLE_SIZE = 8
  const MIN_ITEM_SIZE = 40

  dragItemIdRef.current = dragItemId
  selectedItemIdRef.current = selectedItemId
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
    for (const item of [...itemsList].reverse()) {
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
    item: Bag
  ): 'tl' | 'tr' | 'bl' | 'br' | null {
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current
    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null
    const scaleX = canvas.width / imageNaturalWidth
    const scaleY = canvas.height / imageNaturalHeight
    const itemX = item.x * scaleX
    const itemY = item.y * scaleY
    const itemW = item.width * scaleX
    const itemH = item.height * scaleY
    const s = HANDLE_SIZE
    const corners: { handle: 'tl' | 'tr' | 'bl' | 'br'; cx: number; cy: number }[] = [
      { handle: 'tl', cx: itemX, cy: itemY },
      { handle: 'tr', cx: itemX + itemW - s, cy: itemY },
      { handle: 'br', cx: itemX + itemW - s, cy: itemY + itemH - s },
      { handle: 'bl', cx: itemX, cy: itemY + itemH - s },
    ]
    for (const { handle, cx, cy } of corners) {
      if (canvasX >= cx && canvasX <= cx + s && canvasY >= cy && canvasY <= cy + s) return handle
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

      // Draw items using scaled coordinates
      itemsToDraw.forEach((item) => {
        const itemX = item.x * scaleX
        const itemY = item.y * scaleY
        const itemWidth = item.width * scaleX
        const itemHeight = item.height * scaleY

        // Fill with semi-transparent color
        ctx.fillStyle = 'rgba(0, 200, 0, 0.25)'
        ctx.fillRect(itemX, itemY, itemWidth, itemHeight)

        // Stroke by state: selected > hovered > normal
        if (item.id === selectedItemId) {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.95)'
          ctx.lineWidth = 3
        } else if (item.id === hoveredItemId) {
          ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'
          ctx.lineWidth = 2
        } else {
          ctx.strokeStyle = 'rgba(0, 160, 0, 0.9)'
          ctx.lineWidth = 1
        }
        ctx.strokeRect(itemX, itemY, itemWidth, itemHeight)

        // Corner handles when selected
        if (item.id === selectedItemId) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.95)'
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.95)'
          ctx.lineWidth = 1
          const corners = [
            [itemX, itemY],
            [itemX + itemWidth - HANDLE_SIZE, itemY],
            [itemX + itemWidth - HANDLE_SIZE, itemY + itemHeight - HANDLE_SIZE],
            [itemX, itemY + itemHeight - HANDLE_SIZE],
          ]
          corners.forEach(([cx, cy]) => {
            ctx.fillRect(cx, cy, HANDLE_SIZE, HANDLE_SIZE)
            ctx.strokeRect(cx, cy, HANDLE_SIZE, HANDLE_SIZE)
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
  }, [imageLoaded, localItems, hoveredItemId, selectedItemId, isDragging, isResizing, scale, offsetX, offsetY])

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
      setLocalItems((prev) => prev.filter((i) => i.id !== id))
      setSelectedItemId(null)
      const { error: deleteError } = await supabase.from('bags').delete().eq('id', id)
      if (deleteError) {
        setLocalItems((prev) => [...prev, item])
        setError(deleteError.message ?? 'Failed to delete bag.')
        setTimeout(() => setError(null), 5000)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      setError(updateError.message ?? 'Failed to move bag.')
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
      setError('Resize save failed: ' + (updateError.message ?? 'unknown'))
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
      const canvas = canvasRef.current
      if (!canvas) return
      const world = clientToWorldFromRefs(e.clientX, e.clientY)
      const canvasX = world.x
      const canvasY = world.y
      const imageNaturalWidth = imageNaturalWidthRef.current
      const imageNaturalHeight = imageNaturalHeightRef.current
      const id = resizeItemIdRef.current
      const handle = resizeHandleRef.current
      if (!id || !handle || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return
      const items = localItemsRef.current
      const item = items.find((i) => i.id === id)
      const start = resizeStartRef.current
      if (!item || !start) return
      const scaleX = imageNaturalWidth / canvas.width
      const scaleY = imageNaturalHeight / canvas.height
      const orig = { x: canvasX * scaleX, y: canvasY * scaleY }
      const mx = orig.x
      const my = orig.y
      const imgW = imageNaturalWidth
      const imgH = imageNaturalHeight
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
      newW = Math.max(minS, Math.min(newW, imgW - newX))
      newH = Math.max(minS, Math.min(newH, imgH - newY))
      if (handle === 'tl') {
        newX = start.origX + start.origW - newW
        newY = start.origY + start.origH - newH
      } else if (handle === 'tr') {
        newY = start.origY + start.origH - newH
      } else if (handle === 'bl') {
        newX = start.origX + start.origW - newW
      }
      newX = Math.max(0, Math.min(newX, imgW - newW))
      newY = Math.max(0, Math.min(newY, imgH - newH))
      newX = Math.round(newX)
      newY = Math.round(newY)
      newW = Math.round(newW)
      newH = Math.round(newH)
      const updated = { ...item, x: newX, y: newY, width: newW, height: newH }
      resizedItemCurrentRef.current = updated
      setLocalItems((prev) => prev.map((it) => (it.id === id ? updated : it)))
      drawOverlay(
        localItemsRef.current.map((it) => (it.id === id ? updated : it))
      )
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

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      return
    }

    // Click on empty space: clear selection and add new item
    setSelectedItemId(null)
    if (!isEditMode) return

    // Get image natural dimensions
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current

    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    // Convert world coordinates to original image coordinates
    const orig = canvasToOriginal(canvas, worldX, worldY)
    const origX = orig.x
    const origY = orig.y

    // Create item centered at click position
    const width = 250
    const height = 120
    let x = Math.round(origX - width / 2)
    let y = Math.round(origY - height / 2)

    // Clamp coordinates to image bounds
    x = Math.max(0, Math.min(x, imageNaturalWidth - width))
    y = Math.max(0, Math.min(y, imageNaturalHeight - height))

    // Create optimistic bag with temporary ID
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
      name: 'Bag',
      color: '',
      bag_weight: 0,
      locked: false,
      updated_at: new Date().toISOString(),
    }

    // Add optimistic item immediately
    const updatedItems = [...localItems, optimisticItem]
    setLocalItems(updatedItems)
    drawOverlay(updatedItems)

    // Insert to Supabase
    const { data, error: insertError } = await supabase
      .from('bags')
      .insert({
        pack_id: packId,
        user_id: userId,
        x,
        y,
        width,
        height,
        name: 'Bag',
        color: '',
        bag_weight: 0,
        locked: false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      // Remove optimistic bag and show error
      setLocalItems((prev) => {
        const itemsWithoutTemp = prev.filter((item) => item.id !== tempId)
        drawOverlay(itemsWithoutTemp)
        return itemsWithoutTemp
      })
      setError(insertError.message || 'Failed to create bag')
      
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000)
    } else if (data) {
      // Replace optimistic bag with real bag
      setLocalItems((prev) => {
        const replaced = prev.map((item) => (item.id === tempId ? data : item))
        drawOverlay(replaced)
        return replaced
      })
    }
  }

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return
    const { x: worldX, y: worldY } = clientToWorld(e.clientX, e.clientY)
    const hitId = getItemAtCanvasPoint(canvas, worldX, worldY, localItems)
    if (hitId != null) {
      setDetailsItemId(hitId)
      setIsDetailsOpen(true)
    }
  }

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
    setDetailsItemId(null)
    setDetailsSaveError(null)
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
      setDetailsSaveError(updateError.message ?? 'Failed to save bag')
      setTimeout(() => setDetailsSaveError(null), 5000)
    } else {
      setDetailsSaveError(null)
    }
  }

  const handleToggleEditMode = () => {
    if (isEditMode) {
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
        resizeStartRef.current = null
        didResizeRef.current = false
      }
    }
    setIsEditMode((prev) => !prev)
  }

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
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => {
              setHoveredItemId(null)
              setHoveredHandle(null)
            }}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
          />
        </div>
      </div>
      {!isDetailsOpen && (
        <div className="absolute top-0 right-0 z-50 pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto mt-2 mr-2 px-2 py-1 text-sm rounded border border-gray-300 bg-white shadow hover:bg-gray-50"
            onClick={handleToggleEditMode}
          >
            {isEditMode ? 'Done' : 'Edit'}
          </button>
        </div>
      )}
      {isDetailsOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-10"
            role="button"
            tabIndex={-1}
            onClick={handleCloseDetails}
            aria-label="Close panel"
          />
          <DetailsPanel
            bag={detailsItem}
            isEditMode={isEditMode}
            onClose={handleCloseDetails}
            onToggleEditMode={handleToggleEditMode}
            onUpdateBag={handleUpdateBag}
            saveError={detailsSaveError}
            clearSaveError={() => setDetailsSaveError(null)}
          />
        </>
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
