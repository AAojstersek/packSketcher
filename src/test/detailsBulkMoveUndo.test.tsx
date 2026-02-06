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

function mockSupabaseForMoveFlow(
  options?: { verifyRows?: Array<{ id: string; bag_id: string }> }
) {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  const verifyRows = options?.verifyRows ?? []

  fromMock.mockImplementation((table: string) => {
    if (table === 'items') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: verifyRows,
            error: null,
          })),
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

describe('DetailsPanel bulk move + undo integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseForMoveFlow()
  })

  it('moves selected items and restores them on undo', async () => {
    const user = userEvent.setup()

    moveItemsBulkMock.mockResolvedValue({
      movedCount: 0,
      conflicts: [],
      undo: [{ itemId: 'item-1', fromBagId: 'bag-current', fromName: 'Tent' }],
    })
    undoMoveItemsBulkMock.mockResolvedValue({
      movedCount: 1,
      conflicts: [],
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

    await user.click(screen.getByRole('button', { name: 'Move items' }))
    await user.click(screen.getByText('Tent'))
    await user.click(screen.getByRole('button', { name: 'Move selected' }))

    await waitFor(() => {
      expect(screen.queryByText('Tent')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Moved 1 item.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByText('Stove')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => {
      expect(undoMoveItemsBulkMock).toHaveBeenCalledWith(
        expect.anything(),
        [{ itemId: 'item-1', fromBagId: 'bag-current', fromName: 'Tent' }]
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Tent')).toBeInTheDocument()
    })
    expect(screen.getByText('Move undone.')).toBeInTheDocument()
  })

  it('treats move as success when DB shows item moved but RPC returns no count/undo', async () => {
    const user = userEvent.setup()
    mockSupabaseForMoveFlow({
      verifyRows: [{ id: 'item-1', bag_id: 'bag-target' }],
    })

    moveItemsBulkMock.mockResolvedValue({
      movedCount: 0,
      conflicts: [],
      undo: [],
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
    await user.click(screen.getByRole('button', { name: 'Move items' }))
    await user.click(screen.getByText('Tent'))
    await user.click(screen.getByRole('button', { name: 'Move selected' }))

    await waitFor(() => {
      expect(screen.queryByText('Tent')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1 item moved.')).toBeInTheDocument()
    expect(screen.queryByText('No items were moved.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})
