import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bag } from '@/types'
import { PlannerCanvas } from '@/app/planner/[backgroundId]/PlannerCanvas'

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

const bags: Bag[] = [
  {
    id: 'bag-1',
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
  },
  {
    id: 'bag-2',
    pack_id: 'pack-1',
    user_id: 'user-1',
    x: 380,
    y: 110,
    width: 220,
    height: 120,
    created_at: '2026-02-01T10:01:00.000Z',
    name: 'Box 2',
    color: '#16a34a',
    bag_weight: 0,
    locked: false,
    updated_at: '2026-02-01T10:01:00.000Z',
    z_index: 2,
  },
]

function setPointerModeDesktop() {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })
}

function mockSupabaseDeleteFailure() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  rpcMock.mockResolvedValue({ data: true, error: null })

  fromMock.mockImplementation((table: string) => {
    if (table === 'items') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      }
    }

    if (table === 'bags') {
      return {
        select: vi.fn((columns: string) => {
          if (columns === 'id,name,pack_id') {
            return {
              order: vi.fn(async () => ({
                data: [
                  { id: 'bag-1', name: 'Box 1', pack_id: 'pack-1' },
                  { id: 'bag-2', name: 'Box 2', pack_id: 'pack-1' },
                ],
                error: null,
              })),
            }
          }
          return {
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: bags[0], error: null })),
            })),
          }
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({
            error: { code: 'XX000', message: 'Delete failed in DB' },
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }

    if (table === 'packs') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: [{ id: 'pack-1', background_id: 'bg-1' }], error: null })),
        })),
      }
    }

    if (table === 'backgrounds') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: [{ id: 'bg-1', name: 'Workspace 1' }], error: null })),
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

function loadPlannerImage() {
  const image = screen.getByRole('img', { name: 'Garage' }) as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
  Object.defineProperty(image, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'clientHeight', { configurable: true, value: 600 })
  fireEvent.load(image)
}

describe('Planner optimistic rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPointerModeDesktop()
    mockSupabaseDeleteFailure()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('restores selection/details when delete fails from context menu', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={bags}
        isEditMode
        selectedBagId="bag-1"
        highlightBagId={null}
        onToggleEditMode={() => {}}
        onSelectBagId={() => {}}
        onHighlightBagIdChange={() => {}}
        addBagRequestId={0}
        onOpenDetails={() => {}}
      />
    )

    loadPlannerImage()
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    await screen.findByLabelText('Bag details panel')

    fireEvent.contextMenu(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed in DB')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('Bag details panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Box name')).toHaveValue('Box 1')
  })
})
