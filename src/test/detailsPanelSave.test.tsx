import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bag } from '@/types'
import { DetailsPanel } from '@/components/planner/DetailsPanel'

const { getUserMock, fromMock, rpcMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
    rpc: rpcMock,
  },
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

function mockSupabaseForSaveFlow() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  rpcMock.mockResolvedValue({ error: null })

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
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                ...bag,
                name: 'Renamed Box',
              },
              error: null,
            })),
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
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    }
  })
}

describe('DetailsPanel save flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseForSaveFlow()
  })

  it('saves edited bag details through save_bag_details RPC', async () => {
    const user = userEvent.setup()
    const onSaveSuccess = vi.fn()

    render(
      <DetailsPanel
        bag={bag}
        isEditMode
        onClose={() => {}}
        onToggleEditMode={() => {}}
        onUpdateBag={() => {}}
        onSaveSuccess={onSaveSuccess}
      />
    )

    await screen.findByText('Tent')

    const nameInput = screen.getByLabelText('Box name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Box')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('save_bag_details', {
        p_bag_id: 'bag-current',
        p_bag_patch: {
          name: 'Renamed Box',
          color: '#2563eb',
          bag_weight_kg: 0,
          locked: false,
        },
        p_items_upsert: [],
        p_item_ids_delete: [],
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
    expect(onSaveSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bag-current',
        name: 'Renamed Box',
      })
    )
  })
})
