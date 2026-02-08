'use client'

import { useCallback, useRef, useState } from 'react'
import type { Bag } from '@/types'
import { PlannerHeader } from './PlannerHeader'
import { PlannerCanvas } from './PlannerCanvas'

interface PlannerShellProps {
  backgroundName: string
  imageUrl: string
  packId: string
  bags: Bag[]
  initialHighlightBagId: string | null
}

export function PlannerShell({
  backgroundName,
  imageUrl,
  packId,
  bags,
  initialHighlightBagId,
}: PlannerShellProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedBagId, setSelectedBagId] = useState<string | null>(initialHighlightBagId)
  const [highlightBagId, setHighlightBagId] = useState<string | null>(initialHighlightBagId)
  const [addBagRequestId, setAddBagRequestId] = useState(0)
  const requestToggleEditModeRef = useRef<(() => void) | null>(null)

  const applyToggleEditMode = useCallback(() => {
    setIsEditMode((previous) => !previous)
  }, [])

  const handleToggleEditMode = useCallback(() => {
    if (requestToggleEditModeRef.current) {
      requestToggleEditModeRef.current()
      return
    }
    applyToggleEditMode()
  }, [applyToggleEditMode])

  const handleSelectBagId = useCallback((bagId: string | null) => {
    setSelectedBagId(bagId)
    setHighlightBagId((previous) => (bagId != null && bagId === previous ? previous : null))
  }, [])

  const handleAddBag = useCallback(() => {
    setAddBagRequestId((previous) => previous + 1)
  }, [])
  const handleOpenDetails = useCallback((bagId: string | null) => {
    void bagId
  }, [])

  return (
    <>
      <PlannerHeader
        backgroundName={backgroundName}
        isEditMode={isEditMode}
        onToggleEditMode={handleToggleEditMode}
        onAddBag={handleAddBag}
      />

      <PlannerCanvas
        imageUrl={imageUrl}
        name={backgroundName}
        packId={packId}
        bags={bags}
        isEditMode={isEditMode}
        selectedBagId={selectedBagId}
        highlightBagId={highlightBagId}
        onToggleEditMode={applyToggleEditMode}
        onSelectBagId={handleSelectBagId}
        onHighlightBagIdChange={setHighlightBagId}
        addBagRequestId={addBagRequestId}
        onOpenDetails={handleOpenDetails}
        onRegisterToggleEditModeHandler={(handler) => {
          requestToggleEditModeRef.current = handler
        }}
      />
    </>
  )
}
