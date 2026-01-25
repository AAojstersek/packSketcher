'use client'

import { useEffect, useRef, useState } from 'react'
import type { Item } from '@/types'

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

  const drawOverlay = () => {
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
      items.forEach((item) => {
        const itemX = item.x * scaleX
        const itemY = item.y * scaleY
        const itemWidth = item.width * scaleX
        const itemHeight = item.height * scaleY

        // Fill with semi-transparent color
        ctx.fillStyle = 'rgba(0, 200, 0, 0.25)'
        ctx.fillRect(itemX, itemY, itemWidth, itemHeight)

        // Stroke border
        ctx.strokeStyle = 'rgba(0, 200, 0, 0.8)'
        ctx.lineWidth = 1
        ctx.strokeRect(itemX, itemY, itemWidth, itemHeight)
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
  }, [imageLoaded, items])

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
        className="absolute top-0 left-0 pointer-events-none"
      />
    </div>
  )
}
