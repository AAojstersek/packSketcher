'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ActivityResponse } from '@/lib/activities'
import { formatRelativeTime } from '@/lib/activities/relativeTime'

interface ActivityFeedProps {
  activities: ActivityResponse[]
}

const REFRESH_EVENT = 'packsketcher:activities-refresh'
const REFRESH_INTERVAL_MS = 15_000

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [rows, setRows] = useState<ActivityResponse[]>(activities)

  const refreshActivities = useCallback(async () => {
    try {
      const response = await fetch('/api/activities', {
        cache: 'no-store',
      })
      if (!response.ok) return
      const data = await response.json()
      if (!Array.isArray(data)) return
      setRows(data as ActivityResponse[])
    } catch {
      // Keep previous feed data if refresh fails.
    }
  }, [])

  useEffect(() => {
    setRows(activities)
  }, [activities])

  useEffect(() => {
    if (collapsed) return

    void refreshActivities()

    const intervalId = window.setInterval(() => {
      void refreshActivities()
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [collapsed, refreshActivities])

  useEffect(() => {
    const handleRefresh = () => {
      if (collapsed) return
      void refreshActivities()
    }

    window.addEventListener(REFRESH_EVENT, handleRefresh)
    window.addEventListener('focus', handleRefresh)
    return () => {
      window.removeEventListener(REFRESH_EVENT, handleRefresh)
      window.removeEventListener('focus', handleRefresh)
    }
  }, [collapsed, refreshActivities])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 sm:px-5 sm:py-4">
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Activity Feed</h2>
        <button
          type="button"
          onClick={() => setCollapsed((previous) => !previous)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:text-sm"
          aria-expanded={!collapsed}
          aria-controls="dashboard-activity-feed"
        >
          {collapsed ? 'Expand' : 'Minimize'}
        </button>
      </div>

      {!collapsed && (
        <div id="dashboard-activity-feed" className="p-3 sm:p-5">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-500 sm:text-sm">No activity yet.</p>
          ) : (
            <ul className="space-y-2.5 sm:space-y-3">
              {rows.map((activity) => (
                <li key={activity.id} className="flex items-start justify-between gap-2 sm:gap-3">
                  <p className="text-xs text-slate-800 sm:text-sm">{activity.message}</p>
                  <span className="shrink-0 text-[11px] text-slate-500 sm:text-xs">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
