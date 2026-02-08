'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BackgroundType } from '@/types'
import { dispatchTemplateCreatedEvent } from './events'

interface CreateFromTemplateButtonProps {
  name: string
  type: BackgroundType
  imageUrl: string
}

function notifyActivitiesRefresh() {
  window.dispatchEvent(new Event('packsketcher:activities-refresh'))
}

export function CreateFromTemplateButton({
  name,
  type,
  imageUrl,
}: CreateFromTemplateButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClick = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/backgrounds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type,
          image_url: imageUrl,
          width: null,
          height: null,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const errorFromPayload =
          data && typeof data === 'object' && 'error' in data
            ? (data as { error?: unknown }).error
            : null
        const message = typeof errorFromPayload === 'string'
          ? errorFromPayload
          : 'Failed to create workspace. Please try again.'
        setError(message)
        return
      }

      const finalName =
        data &&
        typeof data === 'object' &&
        'name' in data &&
        typeof (data as { name?: unknown }).name === 'string'
          ? (data as { name: string }).name
          : name

      dispatchTemplateCreatedEvent({ workspaceName: finalName })
      notifyActivitiesRefresh()
      router.refresh()
    } catch {
      setError('Failed to create workspace. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
      >
        {loading ? 'Creating…' : 'Use this template'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 text-center" role="alert">{error}</p>
      )}
    </div>
  )
}
