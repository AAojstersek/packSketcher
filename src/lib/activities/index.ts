import type { ActivityEventType } from '@/types'

export interface RawActivityRow {
  id?: string
  event_type?: ActivityEventType
  message?: string
  created_at?: string
}

export interface ActivityResponse {
  id: string
  eventType: ActivityEventType
  message: string
  createdAt: string
}

/**
 * Convert DB rows (snake_case) into the camelCase shape the UI will consume.
 * Drops rows missing any required fields.
 */
export function shapeActivitiesResponse(rows: RawActivityRow[]): ActivityResponse[] {
  return rows
    .map((row) => {
      if (!row.id || !row.event_type || !row.message || !row.created_at) {
        return null
      }
      return {
        id: row.id,
        eventType: row.event_type,
        message: row.message,
        createdAt: row.created_at,
      }
    })
    .filter((row): row is ActivityResponse => Boolean(row))
}
