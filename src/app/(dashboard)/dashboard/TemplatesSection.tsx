'use client'

import { useState } from 'react'
import type { BackgroundType } from '@/types'
import { TemplateGrid } from './TemplateGrid'

interface Template {
  name: string
  type: BackgroundType
  imageUrl: string
}

interface TemplatesSectionProps {
  templates: Template[]
  className?: string
}

export function TemplatesSection({ templates, className }: TemplatesSectionProps) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 sm:px-5 sm:py-4">
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Background Templates</h2>
        <button
          type="button"
          onClick={() => setCollapsed((previous) => !previous)}
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
  )
}
