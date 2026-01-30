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

export function BackgroundCard({ bg }: BackgroundCardProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setError(data.error ?? 'Failed to delete')
        return
      }
      router.refresh()
    } catch {
      setError('Failed to delete')
    } finally {
      setDeleting(false)
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
              className="object-cover"
            />
          </div>
        )}
        <div className="p-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            {bg.name}
          </h3>
          <p className="text-sm text-slate-500 capitalize mb-1">
            {bg.type}
          </p>
          <p className="text-xs text-slate-400">
            {formatDate(bg.created_at)}
          </p>
        </div>
      </Link>
      <button
        type="button"
        className="absolute top-2 right-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
        title="Delete workspace"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete workspace"
      >
        <TrashIcon />
      </button>
      {error && (
        <p className="px-4 pb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
