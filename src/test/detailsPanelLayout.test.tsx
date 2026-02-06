import { render, screen } from '@testing-library/react'
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

function mockSupabaseForLayout() {
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
                  description: '2-person',
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

describe('DetailsPanel visual structure and landmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseForLayout()
  })

  it('renders section hierarchy and sticky save actions landmark in edit mode', async () => {
    render(
      <DetailsPanel
        bag={bag}
        isEditMode
        onClose={() => {}}
        onToggleEditMode={() => {}}
        onUpdateBag={() => {}}
      />
    )

    await screen.findByText('Tent')

    expect(screen.getByRole('region', { name: 'Box settings' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Items' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Totals' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Save actions' })).toBeInTheDocument()

    expect(screen.getByLabelText('Bag name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows bulk move section landmark only while multi-select is enabled', async () => {
    const user = userEvent.setup()

    render(
      <DetailsPanel
        bag={bag}
        isEditMode
        onClose={() => {}}
        onToggleEditMode={() => {}}
        onUpdateBag={() => {}}
      />
    )

    await screen.findByText('Tent')
    expect(screen.queryByRole('region', { name: 'Bulk move' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Move items' }))

    expect(screen.getByRole('region', { name: 'Bulk move' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move selected' })).toBeInTheDocument()
  })
})
