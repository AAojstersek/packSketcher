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
}

export function TemplatesSection({ templates }: TemplatesSectionProps) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="mb-12 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Background Templates</h2>
        <button
          type="button"
          onClick={() => setCollapsed((previous) => !previous)}
          className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-expanded={!collapsed}
          aria-controls="dashboard-template-grid"
        >
          {collapsed ? 'Expand' : 'Minimize'}
        </button>
      </div>

      {!collapsed && (
        <div id="dashboard-template-grid" className="p-4">
          <TemplateGrid templates={templates} />
        </div>
      )}
    </div>
  )
}
