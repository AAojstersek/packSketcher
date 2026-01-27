'use client'

import { useEffect, useRef, useState } from 'react'
import type { Item } from '@/types'
import { supabase } from '@/lib/supabase/browser'

// Survives remounts (Strict Mode / fast refresh) so we don't overwrite localItems after resize/drag.
let lastSyncedPackId: string | null = null

interface PlannerCanvasProps {
  imageUrl: string
  name: string
  packId: string
  items: Item[]
}

export function PlannerCanvas({ imageUrl, name, packId, items }: PlannerCanvasProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageNaturalWidthRef = useRef<number>(0)
  const imageNaturalHeightRef = useRef<number>(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [localItems, setLocalItems] = useState<Item[]>(items)
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
  const draggedItemCurrentRef = useRef<Item | null>(null)
  const selectedItemIdRef = useRef<string | null>(null)
  const localItemsRef = useRef<Item[]>(localItems)
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
  const resizedItemCurrentRef = useRef<Item | null>(null)
  const resizeHandleRef = useRef<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const didResizeRef = useRef(false)
  const [hoveredHandle, setHoveredHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)

  const HANDLE_SIZE = 8
  const MIN_ITEM_SIZE = 40

  dragItemIdRef.current = dragItemId
  selectedItemIdRef.current = selectedItemId
  localItemsRef.current = localItems
  resizeHandleRef.current = resizeHandle

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
    itemsList: Item[]
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
    item: Item
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

  const drawOverlay = (itemsToDraw: Item[] = localItems) => {
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
  }, [imageLoaded, localItems, hoveredItemId, selectedItemId, isDragging, isResizing])

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

  // Sync localItems from props.items only when packId actually changes (e.g. navigating to another pack).
  // lastSyncedPackId is module-level so it survives remounts; we don't overwrite local edits after resize/drag.
  useEffect(() => {
    if (lastSyncedPackId === packId) return
    lastSyncedPackId = packId
    setLocalItems(items)
  }, [packId, items])

  // Delete selected item on Delete/Backspace
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const id = selectedItemIdRef.current
      if (id == null) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (e.key === 'Backspace') e.preventDefault()
      const items = localItemsRef.current
      const item = items.find((i) => i.id === id)
      if (!item) return
      setLocalItems((prev) => prev.filter((i) => i.id !== id))
      setSelectedItemId(null)
      const { error: deleteError } = await supabase.from('items').delete().eq('id', id)
      if (deleteError) {
        setLocalItems((prev) => [...prev, item])
        setError(deleteError.message ?? 'Failed to delete item')
        setTimeout(() => setError(null), 5000)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return
    const rect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - rect.left
    const canvasY = e.clientY - rect.top
    const hitId = getItemAtCanvasPoint(canvas, canvasX, canvasY, localItems)
    if (hitId == null || hitId !== selectedItemId) return
    const item = localItems.find((i) => i.id === hitId)
    if (!item) return
    const handle = getHandleAtCanvasPoint(canvas, canvasX, canvasY, item)
    if (handle != null) {
      e.preventDefault()
      e.stopPropagation()
      const orig = canvasToOriginal(canvas, canvasX, canvasY)
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
    const orig = canvasToOriginal(canvas, canvasX, canvasY)
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
      .from('items')
      .update({ x: item.x, y: item.y })
      .eq('id', id)
    if (updateError) {
      const start = dragStartPositionRef.current
      setLocalItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, x: start.x, y: start.y } : it
        )
      )
      setError(updateError.message ?? 'Failed to move item')
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
      .from('items')
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
      const rect = canvas.getBoundingClientRect()
      const canvasX = e.clientX - rect.left
      const canvasY = e.clientY - rect.top
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
    const rect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - rect.left
    const canvasY = e.clientY - rect.top
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current

    if (isDragging && dragItemId) {
      const item = localItems.find((i) => i.id === dragItemId)
      if (!item) return
      if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return
      const orig = canvasToOriginal(canvas, canvasX, canvasY)
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

    const hitId = getItemAtCanvasPoint(canvas, canvasX, canvasY, localItems)
    setHoveredItemId(hitId ?? null)
    if (hitId && hitId === selectedItemId) {
      const item = localItems.find((i) => i.id === hitId)
      const handle = item ? getHandleAtCanvasPoint(canvas, canvasX, canvasY, item) : null
      setHoveredHandle(handle)
    } else {
      setHoveredHandle(null)
    }
  }

  const handleCanvasMouseUp = () => {
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

    // Get click position relative to canvas
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Hit test: clicking on an item selects it only (no add-item)
    const hitId = getItemAtCanvasPoint(canvas, clickX, clickY, localItems)
    if (hitId != null) {
      setSelectedItemId(hitId)
      return
    }

    // Click on empty space: clear selection and add new item
    setSelectedItemId(null)

    // Get image natural dimensions
    const imageNaturalWidth = imageNaturalWidthRef.current
    const imageNaturalHeight = imageNaturalHeightRef.current

    if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return

    // Convert canvas coordinates to original image coordinates
    const scaleX = imageNaturalWidth / canvas.width
    const scaleY = imageNaturalHeight / canvas.height
    const origX = clickX * scaleX
    const origY = clickY * scaleY

    // Create item centered at click position
    const width = 250
    const height = 120
    let x = Math.round(origX - width / 2)
    let y = Math.round(origY - height / 2)

    // Clamp coordinates to image bounds
    x = Math.max(0, Math.min(x, imageNaturalWidth - width))
    y = Math.max(0, Math.min(y, imageNaturalHeight - height))

    // Create optimistic item with temporary ID
    const tempId = `temp-${Date.now()}`
    const optimisticItem: Item = {
      id: tempId,
      pack_id: packId,
      user_id: userId,
      x,
      y,
      width,
      height,
      created_at: new Date().toISOString(),
    }

    // Add optimistic item immediately
    const updatedItems = [...localItems, optimisticItem]
    setLocalItems(updatedItems)
    drawOverlay(updatedItems)

    // Insert to Supabase
    const { data, error: insertError } = await supabase
      .from('items')
      .insert({
        pack_id: packId,
        user_id: userId,
        x,
        y,
        width,
        height,
      })
      .select()
      .single()

    if (insertError) {
      // Remove optimistic item and show error
      setLocalItems((prev) => {
        const itemsWithoutTemp = prev.filter((item) => item.id !== tempId)
        drawOverlay(itemsWithoutTemp)
        return itemsWithoutTemp
      })
      setError(insertError.message || 'Failed to create item')
      
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000)
    } else if (data) {
      // Replace optimistic item with real item
      setLocalItems((prev) => {
        const replaced = prev.map((item) => (item.id === tempId ? data : item))
        drawOverlay(replaced)
        return replaced
      })
    }
  }

  return (
    <div ref={containerRef} className="relative w-full bg-white rounded-lg shadow-lg overflow-hidden">
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
          cursor: isDragging
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
      />

      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}
    </div>
  )
}
