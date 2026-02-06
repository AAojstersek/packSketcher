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
    void refreshActivities()

    const handleRefresh = () => {
      void refreshActivities()
    }

    const intervalId = window.setInterval(() => {
      void refreshActivities()
    }, REFRESH_INTERVAL_MS)

    window.addEventListener(REFRESH_EVENT, handleRefresh)
    window.addEventListener('focus', handleRefresh)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(REFRESH_EVENT, handleRefresh)
      window.removeEventListener('focus', handleRefresh)
    }
  }, [refreshActivities])

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Activity Feed</h2>
        <button
          type="button"
          onClick={() => setCollapsed((previous) => !previous)}
          className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-expanded={!collapsed}
          aria-controls="dashboard-activity-feed"
        >
          {collapsed ? 'Expand' : 'Minimize'}
        </button>
      </div>

      {!collapsed && (
        <div id="dashboard-activity-feed" className="p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((activity) => (
                <li key={activity.id} className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-800">{activity.message}</p>
                  <span className="shrink-0 text-xs text-slate-500">
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
