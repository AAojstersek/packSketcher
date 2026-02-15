import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bag } from '@/types'
import { PlannerCanvas } from '@/app/planner/[backgroundId]/PlannerCanvas'

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}))

const baseBags: Bag[] = [
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

function setPointerMode(isCoarse: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)' ? isCoarse : false,
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

function mockSupabaseBasics() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

  fromMock.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: [], error: null })),
      })),
    })),
  }))
}

function renderCanvas(selectedBagId: string | null, highlightBagId: string | null) {
  setPointerMode(false)
  mockSupabaseBasics()

  return render(
    <PlannerCanvas
      imageUrl="/garage.png"
      name="Garage"
      packId="pack-1"
      bags={baseBags}
      isEditMode={false}
      selectedBagId={selectedBagId}
      highlightBagId={highlightBagId}
      onToggleEditMode={() => {}}
      onSelectBagId={() => {}}
      onHighlightBagIdChange={() => {}}
      addBagRequestId={0}
      onOpenDetails={() => {}}
    />
  )
}

function loadPlannerImage(container: HTMLElement): HTMLDivElement {
  const image = container.querySelector('img[alt="Garage"]') as HTMLImageElement | null
  if (!image) throw new Error('Planner image not found')
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
  Object.defineProperty(image, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'clientHeight', { configurable: true, value: 600 })
  fireEvent.load(image)

  const canvas = container.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas?.parentElement) throw new Error('Canvas transform layer not found')
  return canvas.parentElement as HTMLDivElement
}

describe('Planner search jump centering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      callback(performance.now())
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('auto-centers initial highlighted bag without changing zoom', async () => {
    const { container } = renderCanvas('bag-2', 'bag-2')
    const transformLayer = loadPlannerImage(container)

    await waitFor(() => {
      expect(transformLayer.style.transform).toBe('translate3d(10px, 130px, 0) scale(1)')
    })
  })

  it('does not auto-center when highlight and selection do not match', async () => {
    const { container } = renderCanvas('bag-2', null)
    const transformLayer = loadPlannerImage(container)

    await waitFor(() => {
      expect(transformLayer.style.transform).toBe('translate3d(0px, 0px, 0) scale(1)')
    })
  })

  it('centers only once per pack+bag and does not re-center after later highlight toggles', async () => {
    const { container, rerender } = renderCanvas('bag-2', 'bag-2')
    const transformLayer = loadPlannerImage(container)

    await waitFor(() => {
      expect(transformLayer.style.transform).toBe('translate3d(10px, 130px, 0) scale(1)')
    })

    const movedBags: Bag[] = baseBags.map((bag) =>
      bag.id === 'bag-2' ? { ...bag, x: 540, y: 220 } : bag
    )

    rerender(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={movedBags}
        isEditMode={false}
        selectedBagId="bag-2"
        highlightBagId={null}
        onToggleEditMode={() => {}}
        onSelectBagId={() => {}}
        onHighlightBagIdChange={() => {}}
        addBagRequestId={0}
        onOpenDetails={() => {}}
      />
    )

    rerender(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={movedBags}
        isEditMode={false}
        selectedBagId="bag-2"
        highlightBagId="bag-2"
        onToggleEditMode={() => {}}
        onSelectBagId={() => {}}
        onHighlightBagIdChange={() => {}}
        addBagRequestId={0}
        onOpenDetails={() => {}}
      />
    )

    await waitFor(() => {
      expect(transformLayer.style.transform).toBe('translate3d(10px, 130px, 0) scale(1)')
    })
  })
})
