'use client'

import { useState } from 'react'

type Interval = 'monthly' | 'yearly'

export function SubscribeActions() {
  const [loadingInterval, setLoadingInterval] = useState<Interval | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startCheckout = async (interval: Interval) => {
    setError(null)
    setLoadingInterval(interval)
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interval }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || typeof payload.url !== 'string') {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : 'Could not start checkout.'
        setError(message)
        return
      }
      window.location.href = payload.url
    } catch {
      setError('Could not start checkout.')
    } finally {
      setLoadingInterval(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => startCheckout('monthly')}
          disabled={loadingInterval !== null}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <div className="text-sm font-semibold text-slate-900">Monthly</div>
          <div className="text-xs text-slate-600">Billed every month</div>
          <div className="mt-2 text-sm text-slate-900">
            {loadingInterval === 'monthly' ? 'Redirecting…' : 'Choose monthly'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => startCheckout('yearly')}
          disabled={loadingInterval !== null}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <div className="text-sm font-semibold text-slate-900">Yearly</div>
          <div className="text-xs text-slate-600">Billed once per year</div>
          <div className="mt-2 text-sm text-slate-900">
            {loadingInterval === 'yearly' ? 'Redirecting…' : 'Choose yearly'}
          </div>
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Trial applies to eligible new subscribers.
      </p>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
