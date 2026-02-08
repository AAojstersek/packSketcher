import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  window.dispatchEvent(new Event('resize'))
}

function mockCanvas2dContext() {
  const rotate = vi.fn()
  const fillRect = vi.fn()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
    callback(performance.now())
    return 1
  })
  const context = {
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    fillRect,
    measureText: vi.fn((value: string) => ({ width: value.length * 8 })),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate,
    lineWidth: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as CanvasRenderingContext2D
  )

  return { rotate, fillRect }
}

describe('Planner mobile resize handles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPointerMode(true)
    mockSupabaseForResize()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('renders long mobile labels and can rotate them vertically without crashing', async () => {
    mockCanvas2dContext()
    const longNameBag: Bag = {
      ...baseBag,
      id: 'bag-long',
      name: 'Very Long Emergency Supplies Name',
      width: 90,
      height: 300,
    }

    const { container } = render(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={[longNameBag]}
        isEditMode={false}
        selectedBagId={null}
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

    await waitFor(() => {
      expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0)
      expect((canvas as HTMLCanvasElement).height).toBeGreaterThan(0)
    })
  })

  it('does not open context menu after long press on coarse pointer', async () => {
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

    await waitFor(() => {
      expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0)
      expect((canvas as HTMLCanvasElement).height).toBeGreaterThan(0)
    })

    vi.useFakeTimers()

    act(() => {
      fireEvent.touchStart(canvas as HTMLCanvasElement, {
        touches: [{ identifier: 1, clientX: 150, clientY: 150 }],
        targetTouches: [{ identifier: 1, clientX: 150, clientY: 150 }],
        changedTouches: [{ identifier: 1, clientX: 150, clientY: 150 }],
      })
      vi.advanceTimersByTime(600)
    })

    expect(screen.queryByRole('menu', { name: 'Box actions' })).not.toBeInTheDocument()
  })

  it('does not open context menu from contextmenu event on coarse pointer', async () => {
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

    await waitFor(() => {
      expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0)
      expect((canvas as HTMLCanvasElement).height).toBeGreaterThan(0)
    })

    act(() => {
      fireEvent.contextMenu(canvas as HTMLCanvasElement, { clientX: 150, clientY: 150 })
    })

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Box actions' })).not.toBeInTheDocument()
    })
  })

  it('updates transform layer style during coarse-pointer pinch', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      callback(performance.now())
      return 1
    })

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
    const image = screen.getByRole('img', { name: 'Garage' })
    const transformLayer = image.parentElement as HTMLDivElement | null
    expect(transformLayer).toBeTruthy()

    act(() => {
      fireEvent.touchStart(canvas as HTMLCanvasElement, {
        touches: [
          { identifier: 1, clientX: 180, clientY: 180 },
          { identifier: 2, clientX: 240, clientY: 180 },
        ],
        targetTouches: [
          { identifier: 1, clientX: 180, clientY: 180 },
          { identifier: 2, clientX: 240, clientY: 180 },
        ],
        changedTouches: [
          { identifier: 1, clientX: 180, clientY: 180 },
          { identifier: 2, clientX: 240, clientY: 180 },
        ],
      })
    })

    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
    })

    await waitFor(() => {
      const transformValue = transformLayer?.style.transform ?? ''
      expect(transformValue).toContain('translate3d(')
      expect(transformValue).toContain('scale(')
      expect(transformValue).not.toContain('scale(1)')
    })
  })

  it('toggles transform layer will-change during pinch gesture lifecycle', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      callback(performance.now())
      return 1
    })

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
    const image = screen.getByRole('img', { name: 'Garage' })
    const transformLayer = image.parentElement as HTMLDivElement | null
    expect(transformLayer).toBeTruthy()

    fireEvent.touchStart(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
    })

    expect(transformLayer?.style.willChange).toBe('transform')

    act(() => {
      fireEvent.touchEnd(canvas as HTMLCanvasElement, {
        touches: [],
        targetTouches: [],
        changedTouches: [
          { identifier: 1, clientX: 180, clientY: 180 },
          { identifier: 2, clientX: 240, clientY: 180 },
        ],
      })
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(transformLayer?.style.willChange).toBe('auto')
  })

  it('keeps drag persistence functional after pinch zoom on coarse pointer', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      callback(performance.now())
      return 1
    })

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

    fireEvent.touchStart(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
    })

    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
    })

    fireEvent.touchEnd(canvas as HTMLCanvasElement, {
      touches: [],
      targetTouches: [],
      changedTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
    })

    fireEvent.touchStart(canvas as HTMLCanvasElement, {
      touches: [{ identifier: 1, clientX: 150, clientY: 150 }],
      targetTouches: [{ identifier: 1, clientX: 150, clientY: 150 }],
      changedTouches: [{ identifier: 1, clientX: 150, clientY: 150 }],
    })
    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [{ identifier: 1, clientX: 190, clientY: 190 }],
      targetTouches: [{ identifier: 1, clientX: 190, clientY: 190 }],
      changedTouches: [{ identifier: 1, clientX: 190, clientY: 190 }],
    })
    fireEvent.touchEnd(canvas as HTMLCanvasElement, {
      touches: [],
      targetTouches: [],
      changedTouches: [{ identifier: 1, clientX: 190, clientY: 190 }],
    })

    await waitFor(() => {
      expect(updateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        })
      )
      expect(updateEqMock).toHaveBeenCalledWith('id', 'bag-1')
    })
  })

  it('does not trigger extra overlay draw churn during pinch updates', async () => {
    const { fillRect } = mockCanvas2dContext()

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

    await waitFor(() => {
      expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0)
      expect((canvas as HTMLCanvasElement).height).toBeGreaterThan(0)
    })

    fillRect.mockClear()

    fireEvent.touchStart(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 180, clientY: 180 },
        { identifier: 2, clientX: 240, clientY: 180 },
      ],
    })

    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 170, clientY: 170 },
        { identifier: 2, clientX: 290, clientY: 170 },
      ],
    })

    fireEvent.touchMove(canvas as HTMLCanvasElement, {
      touches: [
        { identifier: 1, clientX: 165, clientY: 165 },
        { identifier: 2, clientX: 300, clientY: 165 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 165, clientY: 165 },
        { identifier: 2, clientX: 300, clientY: 165 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 165, clientY: 165 },
        { identifier: 2, clientX: 300, clientY: 165 },
      ],
    })

    expect(fillRect).not.toHaveBeenCalled()
  })
})

describe('Planner desktop drag persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPointerMode(false)
    mockSupabaseForResize()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps dragged box at the committed position after mouseup', async () => {
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

    fireEvent.mouseDown(canvas as HTMLCanvasElement, { clientX: 150, clientY: 150 })
    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 350, clientY: 300 })
    fireEvent.mouseUp(window)

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ x: 300, y: 250 })
      expect(updateEqMock).toHaveBeenCalledWith('id', 'bag-1')
    })

    updateMock.mockClear()
    updateEqMock.mockClear()

    fireEvent.mouseDown(canvas as HTMLCanvasElement, { clientX: 350, clientY: 300 })
    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 380, clientY: 330 })
    fireEvent.mouseUp(window)

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ x: 330, y: 280 })
      expect(updateEqMock).toHaveBeenCalledWith('id', 'bag-1')
    })
  })

  it('rolls back to the original position when drag save fails', async () => {
    updateEqMock
      .mockResolvedValueOnce({ error: { message: 'db write failed' } })
      .mockResolvedValue({ error: null })

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

    fireEvent.mouseDown(canvas as HTMLCanvasElement, { clientX: 150, clientY: 150 })
    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 350, clientY: 300 })
    fireEvent.mouseUp(window)

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ x: 300, y: 250 })
    })

    updateMock.mockClear()
    updateEqMock.mockClear()

    fireEvent.mouseDown(canvas as HTMLCanvasElement, { clientX: 150, clientY: 150 })
    fireEvent.mouseMove(canvas as HTMLCanvasElement, { clientX: 180, clientY: 180 })
    fireEvent.mouseUp(window)

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ x: 130, y: 130 })
      expect(updateEqMock).toHaveBeenCalledWith('id', 'bag-1')
    })
  })
})
