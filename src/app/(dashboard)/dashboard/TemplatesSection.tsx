'use client'

import { useEffect, useRef, useState } from 'react'
import type { BackgroundType } from '@/types'
import { TemplateGrid } from './TemplateGrid'
import { TEMPLATE_CREATED_EVENT, type TemplateCreatedEventDetail } from './events'

interface Template {
  name: string
  type: BackgroundType
  imageUrl: string
}

interface TemplatesSectionProps {
  templates: Template[]
  className?: string
}

const STORAGE_KEY = 'packsketcher:dashboard:templates-collapsed'
const TEMPLATE_SUCCESS_TOAST_DURATION_MS = 3_000

function readInitialCollapsedState(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    // Ignore storage read failures and keep default expanded state.
  }
  return false
}

function persistCollapsedState(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Ignore storage write failures.
  }
}

export function TemplatesSection({ templates, className }: TemplatesSectionProps) {
  const [collapsed, setCollapsed] = useState(readInitialCollapsedState)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const handleToggle = () => {
    setCollapsed((previous) => {
      const next = !previous
      persistCollapsedState(next)
      return next
    })
  }

  useEffect(() => {
    const handleTemplateCreated = (event: Event) => {
      const customEvent = event as CustomEvent<TemplateCreatedEventDetail>
      const detailName = customEvent.detail?.workspaceName
      const workspaceName = typeof detailName === 'string' && detailName.trim().length > 0
        ? detailName.trim()
        : 'workspace'

      setCollapsed(true)
      persistCollapsedState(true)
      setToastMessage(`Added "${workspaceName}" to My Workspaces.`)

      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current)
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null)
        toastTimerRef.current = null
      }, TEMPLATE_SUCCESS_TOAST_DURATION_MS)
    }

    window.addEventListener(TEMPLATE_CREATED_EVENT, handleTemplateCreated)
    return () => {
      window.removeEventListener(TEMPLATE_CREATED_EVENT, handleTemplateCreated)
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [])

  return (
    <>
      <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className ?? ''}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 sm:px-5 sm:py-4">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Background Templates</h2>
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:text-sm"
            aria-expanded={!collapsed}
            aria-controls="dashboard-template-grid"
          >
            {collapsed ? 'Expand' : 'Minimize'}
          </button>
        </div>

        {!collapsed && (
          <div id="dashboard-template-grid" className="p-4 sm:p-5">
            <TemplateGrid templates={templates} />
          </div>
        )}
      </div>

      {toastMessage && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 flex justify-center px-4"
          aria-live="polite"
        >
          <p
            role="status"
            className="max-w-md rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-slate-900 shadow-lg"
          >
            {toastMessage}
          </p>
        </div>
      )}
    </>
  )
}
