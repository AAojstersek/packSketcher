import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bag } from '@/types'
import { PlannerCanvas } from '@/app/planner/[backgroundId]/PlannerCanvas'

const { getUserMock, fromMock, updateMock, updateEqMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  updateEqMock: vi.fn(),
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}))

const baseBag: Bag = {
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
}

function setPointerModeCoarse() {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)',
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

function mockSupabaseForResize() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({
    eq: updateEqMock,
  })

  fromMock.mockImplementation((table: string) => {
    if (table === 'bags') {
      return {
        update: updateMock,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
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

function loadPlannerImage() {
  const image = screen.getByRole('img', { name: 'Garage' }) as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
  Object.defineProperty(image, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'clientHeight', { configurable: true, value: 600 })
  fireEvent.load(image)
}

describe('Planner mobile resize handles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPointerModeCoarse()
    mockSupabaseForResize()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses coarse-pointer handle hit slop and persists resize geometry', async () => {
    const { container } = render(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={[baseBag]}
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

    // Start just outside visual corner handle but inside coarse-pointer hit slop.
    fireEvent.touchStart(canvas as HTMLCanvasElement, {
      touches: [{ identifier: 1, clientX: 94, clientY: 94 }],
      targetTouches: [{ identifier: 1, clientX: 94, clientY: 94 }],
      changedTouches: [{ identifier: 1, clientX: 94, clientY: 94 }],
    })
    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [{ identifier: 1, clientX: 70, clientY: 70 }],
      targetTouches: [{ identifier: 1, clientX: 70, clientY: 70 }],
      changedTouches: [{ identifier: 1, clientX: 70, clientY: 70 }],
    })
    fireEvent.touchEnd(canvas as HTMLCanvasElement, {
      touches: [],
      targetTouches: [],
      changedTouches: [{ identifier: 1, clientX: 70, clientY: 70 }],
    })

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ x: 70, y: 70, width: 250, height: 150 })
      expect(updateEqMock).toHaveBeenCalledWith('id', 'bag-1')
    })
  })
})
