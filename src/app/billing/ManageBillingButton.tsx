'use client'

import { useState } from 'react'

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openPortal = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || typeof payload.url !== 'string') {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : 'Could not open billing portal.'
        setError(message)
        return
      }
      window.location.href = payload.url
    } catch {
      setError('Could not open billing portal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
