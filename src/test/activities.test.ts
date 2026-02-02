import { describe, expect, it } from 'vitest'
import { shapeActivitiesResponse, type RawActivityRow } from '@/lib/activities'
import type { ActivityEventType } from '@/types'

const sampleEvent: ActivityEventType = 'item_created'

describe('shapeActivitiesResponse', () => {
  it('converts snake_case rows to camelCase', () => {
    const rows: RawActivityRow[] = [
      {
        id: '1',
        event_type: sampleEvent,
        message: 'Created item',
        created_at: '2026-02-01T00:00:00Z',
      },
    ]

    expect(shapeActivitiesResponse(rows)).toEqual([
      {
        id: '1',
        eventType: sampleEvent,
        message: 'Created item',
        createdAt: '2026-02-01T00:00:00Z',
      },
    ])
  })

  it('drops rows missing required fields', () => {
    const rows: RawActivityRow[] = [
      {
        id: '1',
        event_type: sampleEvent,
        message: 'Created item',
        created_at: undefined,
      },
    ]

    expect(shapeActivitiesResponse(rows)).toEqual([])
  })
})
