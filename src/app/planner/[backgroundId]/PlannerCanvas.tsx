'use client'

import { useEffect, useRef, useState } from 'react'

interface PlannerCanvasProps {
  imageUrl: string
  name: string
}

export function PlannerCanvas({ imageUrl, name }: PlannerCanvasProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  const drawOverlay = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw test rectangle: centered, 40% width, 20% height
    const rectWidth = canvas.width * 0.4
    const rectHeight = canvas.height * 0.2
    const rectX = (canvas.width - rectWidth) / 2
    const rectY = (canvas.height - rectHeight) / 2

    // Fill with semi-transparent color
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
    ctx.fillRect(rectX, rectY, rectWidth, rectHeight)

    // Stroke border
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight)
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
  }, [imageLoaded])

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
