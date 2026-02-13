'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Background } from '@/types'

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

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface BackgroundCardProps {
  bg: Background
}

function notifyActivitiesRefresh() {
  window.dispatchEvent(new Event('packsketcher:activities-refresh'))
}

export function BackgroundCard({ bg }: BackgroundCardProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState(bg.name)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openRename = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setRenameName(bg.name)
    setRenameError(null)
    setRenameOpen(true)
  }

  const closeRename = () => {
    if (renameSubmitting) return
    setRenameOpen(false)
    setRenameError(null)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this workspace? This cannot be undone.')) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/backgrounds/${bg.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to delete workspace. Please try again.')
        return
      }
      notifyActivitiesRefresh()
      router.refresh()
    } catch {
      setError('Failed to delete workspace. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleRenameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRenameError(null)

    const normalized = renameName.trim()
    if (!normalized) {
      setRenameError('Name is required')
      return
    }
    if (normalized.length > 60) {
      setRenameError('Name must be 60 characters or fewer')
      return
    }

    setRenameSubmitting(true)
    try {
      const res = await fetch(`/api/backgrounds/${bg.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: normalized }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setRenameError(data.error ?? 'Failed to rename workspace. Please try again.')
        return
      }

      notifyActivitiesRefresh()
      setRenameOpen(false)
      router.refresh()
    } catch {
      setRenameError('Failed to rename workspace. Please try again.')
    } finally {
      setRenameSubmitting(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={`/planner/${bg.id}`}
        className="block"
      >
        {bg.image_url && (
          <div className="relative h-48 bg-slate-100">
            <Image
              src={bg.image_url}
              alt={bg.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="p-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            {bg.name}
          </h3>
          <p className="text-xs text-slate-400">
            {formatDate(bg.created_at)}
          </p>
        </div>
      </Link>
      <div className="absolute top-2 left-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
          title="Rename workspace"
          onClick={openRename}
          disabled={deleting}
          aria-label="Rename workspace"
        >
          <PencilIcon />
        </button>
      </div>
      <div className="absolute top-2 right-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
          title="Delete workspace"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete workspace"
        >
          <TrashIcon />
        </button>
      </div>
      {error && (
        <p className="px-4 pb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {renameOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={closeRename}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`rename-workspace-title-${bg.id}`}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id={`rename-workspace-title-${bg.id}`}
              className="text-lg font-semibold text-slate-900"
            >
              Rename workspace
            </h3>
            <form className="mt-4 space-y-4" onSubmit={handleRenameSubmit}>
              <div>
                <label htmlFor={`rename-workspace-input-${bg.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                  Workspace name
                </label>
                <input
                  id={`rename-workspace-input-${bg.id}`}
                  type="text"
                  maxLength={60}
                  value={renameName}
                  onChange={(event) => setRenameName(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  disabled={renameSubmitting}
                />
              </div>

              {renameError && (
                <p role="alert" className="text-sm text-red-600">
                  {renameError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRename}
                  disabled={renameSubmitting}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameSubmitting}
                  className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-60"
                >
                  {renameSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
