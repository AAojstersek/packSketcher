'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  parseItemsSearchQuery,
  type ItemsSearchResult,
} from '@/lib/items/search'

const DEBOUNCE_MS = 250

export function GlobalItemSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItemsSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { shouldQuery, term } = useMemo(() => parseItemsSearchQuery(query), [query])

  // Debounced search
  useEffect(() => {
    if (!shouldQuery) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const message = (data as any)?.error ?? 'Search failed. Please try again.'
          setError(message)
          setResults([])
          return
        }
        const data = (await res.json()) as ItemsSearchResult[]
        setResults(data ?? [])
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return
        setError('Search failed. Please try again.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [shouldQuery, term])

  // Close on outside click
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleNavigate = (result: ItemsSearchResult) => {
    router.push(`/planner/${result.backgroundId}?bagId=${result.bagId}`)
    setOpen(false)
  }

  const showHint = !shouldQuery && term.length > 0

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="mb-2.5">
        <label className="block text-sm font-semibold text-slate-900 sm:text-base" htmlFor="global-item-search">
          Search items
        </label>
        <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">Find any item across all workspaces and open it directly.</p>
      </div>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        >
          🔍
        </span>
        <input
          id="global-item-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search items across workspaces"
          className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:py-2.5"
          aria-label="Global item search"
        />
      </div>

      {open && (
        <div
          className="absolute z-10 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          <div className="max-h-72 overflow-y-auto py-2">
            {showHint && (
              <p className="px-3 py-2 text-sm text-slate-500">Type 3+ characters</p>
            )}

            {shouldQuery && (
              <>
                {loading && (
                  <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
                )}
                {!loading && error && (
                  <p className="px-3 py-2 text-sm text-red-600" role="alert">
                    {error}
                  </p>
                )}
                {!loading && !error && results.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-500">No items found</p>
                )}
                {!loading && !error && results.length > 0 && (
                  <ul>
                    {results.map((result) => (
                      <li key={`${result.backgroundId}-${result.bagId}-${result.itemName}`}>
                        <button
                          type="button"
                          onClick={() => handleNavigate(result)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
                        >
                          <span className="font-medium">{result.itemName}</span>
                          <span className="text-slate-500"> — {result.workspaceName} / {result.boxName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
