import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bag } from '@/types'
import { DetailsPanel } from '@/components/planner/DetailsPanel'

const { getUserMock, fromMock, moveItemsBulkMock, undoMoveItemsBulkMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  moveItemsBulkMock: vi.fn(),
  undoMoveItemsBulkMock: vi.fn(),
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}))

vi.mock('@/lib/rpc/items', () => ({
  moveItemsBulk: moveItemsBulkMock,
  undoMoveItemsBulk: undoMoveItemsBulkMock,
}))

const bag: Bag = {
  id: 'bag-current',
  pack_id: 'pack-1',
  user_id: 'user-1',
  x: 100,
  y: 100,
  width: 220,
  height: 120,
  created_at: '2026-02-01T10:00:00.000Z',
  name: 'Box 1',
  color: '#2563eb',
  bag_weight: 0,
  locked: false,
  updated_at: '2026-02-01T10:00:00.000Z',
  z_index: 1,
}

function mockSupabaseForDetailsPanel() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

  fromMock.mockImplementation((table: string) => {
    if (table === 'items') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: [
                {
                  id: 'item-1',
                  bag_id: 'bag-current',
                  user_id: 'user-1',
                  name: 'Tent',
                  description: null,
                  weight: 1.2,
                  created_at: '2026-02-01T10:01:00.000Z',
                  updated_at: '2026-02-01T10:01:00.000Z',
                },
                {
                  id: 'item-2',
                  bag_id: 'bag-current',
                  user_id: 'user-1',
                  name: 'Stove',
                  description: null,
                  weight: 0.7,
                  created_at: '2026-02-01T10:02:00.000Z',
                  updated_at: '2026-02-01T10:02:00.000Z',
                },
              ],
              error: null,
            })),
          })),
        })),
      }
    }

    if (table === 'bags') {
      return {
        select: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [
              { id: 'bag-current', name: 'Box 1', pack_id: 'pack-1' },
              { id: 'bag-target', name: 'Target Box', pack_id: 'pack-2' },
            ],
            error: null,
          })),
        })),
      }
    }

    if (table === 'packs') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [
              { id: 'pack-1', background_id: 'bg-1' },
              { id: 'pack-2', background_id: 'bg-2' },
            ],
            error: null,
          })),
        })),
      }
    }

    if (table === 'backgrounds') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [
              { id: 'bg-1', name: 'Workspace A' },
              { id: 'bg-2', name: 'Workspace B' },
            ],
            error: null,
          })),
        })),
      }
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    }
  })
}

describe('DetailsPanel move conflict handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseForDetailsPanel()
  })

  it('shows rename UI on conflict and keeps items unchanged until resolve', async () => {
    const user = userEvent.setup()

    moveItemsBulkMock
      .mockResolvedValueOnce({
        movedCount: 0,
        conflicts: [
          {
            itemId: 'item-1',
            name: 'Tent',
            reason: 'name_conflict',
            message: 'Target box already has an item named "Tent".',
          },
        ],
        undo: [],
      })
      .mockResolvedValueOnce({
        movedCount: 1,
        conflicts: [],
        undo: [{ itemId: 'item-1', fromBagId: 'bag-current', fromName: 'Tent' }],
      })

    render(
      <DetailsPanel
        bag={bag}
        isEditMode
        onClose={() => {}}
        onToggleEditMode={() => {}}
        onUpdateBag={() => {}}
        requestMoveItemsAction={(action) => {
          void action()
        }}
      />
    )

    await screen.findByText('Tent')
    await screen.findByText('Stove')

    await user.click(screen.getByRole('button', { name: 'Multi-select' }))
    await user.click(screen.getByText('Tent'))
    await user.click(screen.getByRole('button', { name: 'Move selected' }))

    await screen.findByText('Conflict 1/1: "Tent" already exists in target box.')
    expect(screen.getByText('Tent')).toBeInTheDocument()
    expect(screen.getByText('Stove')).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText('Enter a new name'))
    await user.type(screen.getByPlaceholderText('Enter a new name'), 'Tent 2')
    await user.click(screen.getByRole('button', { name: 'Rename & continue' }))

    await waitFor(() => {
      expect(screen.queryByText('Tent')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Stove')).toBeInTheDocument()
    expect(moveItemsBulkMock).toHaveBeenCalledTimes(2)
    expect(moveItemsBulkMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      ['item-1'],
      'bag-target',
      { 'item-1': 'Tent 2' }
    )
  })
})
