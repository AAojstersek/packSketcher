'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
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

interface PlannerHeaderProps {
  backgroundId: string
  backgroundName: string
  isEditMode: boolean
  onToggleEditMode: () => void
  onAddBag: () => void
}

export function PlannerHeader({
  backgroundId,
  backgroundName,
  isEditMode,
  onToggleEditMode,
  onAddBag,
}: PlannerHeaderProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/backgrounds/${backgroundId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.error ?? 'Failed to delete')
        return
      }
      router.push('/dashboard')
    } catch {
      setDeleteError('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 pb-4 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          <ChevronLeftIcon />
          <span>Workspaces</span>
        </Link>
        <h1 className="truncate text-base font-semibold text-slate-900">
          {backgroundName}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {deleteError && (
          <p className="text-sm text-red-600" role="alert">
            {deleteError}
          </p>
        )}
        {isEditMode && (
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
            onClick={onAddBag}
          >
            + Add box
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
          onClick={onToggleEditMode}
        >
          {isEditMode ? 'Done' : 'Edit'}
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
          title="Delete workspace"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete workspace"
        >
          <TrashIcon />
        </button>
      </div>
    </header>
  )
}
