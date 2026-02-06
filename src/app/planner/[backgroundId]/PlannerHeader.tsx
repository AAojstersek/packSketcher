'use client'

import Link from 'next/link'

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
      </div>
    </header>
  )
}
