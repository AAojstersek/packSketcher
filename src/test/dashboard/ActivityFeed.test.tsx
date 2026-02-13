import { ActivityFeed } from '@/app/(dashboard)/dashboard/ActivityFeed'
import type { ActivityResponse } from '@/lib/activities'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/activities/relativeTime', () => ({
  formatRelativeTime: () => '2h ago',
}))

const activities: ActivityResponse[] = [
  {
    id: 'activity-1',
    eventType: 'item_created',
    message: 'Created item Tent',
    createdAt: '2026-02-06T10:00:00Z',
  },
]

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => activities,
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders activity rows with relative time', async () => {
    const user = userEvent.setup()
    render(<ActivityFeed activities={activities} />)

    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(screen.queryByText('Created item Tent')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Created item Tent')).toBeInTheDocument()
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })

  it('does not fetch activities while the feed stays collapsed', () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    render(<ActivityFeed activities={activities} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('collapses and expands the feed', async () => {
    const user = userEvent.setup()
    render(<ActivityFeed activities={activities} />)

    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Created item Tent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByText('Created item Tent')).not.toBeInTheDocument()
  })

  it('refreshes list on activities refresh event', async () => {
    const refreshed: ActivityResponse[] = [
      {
        id: 'activity-2',
        eventType: 'box_deleted',
        message: 'Deleted box Left',
        createdAt: '2026-02-06T11:00:00Z',
      },
    ]
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => activities,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => refreshed,
      } as Response)

    const user = userEvent.setup()
    render(<ActivityFeed activities={activities} />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Created item Tent')).toBeInTheDocument()

    window.dispatchEvent(new Event('packsketcher:activities-refresh'))

    await waitFor(() => {
      expect(screen.getByText('Deleted box Left')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ignores refresh event while collapsed', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    render(<ActivityFeed activities={activities} />)

    window.dispatchEvent(new Event('packsketcher:activities-refresh'))

    await waitFor(() => {
      expect(screen.queryByText('Created item Tent')).not.toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
