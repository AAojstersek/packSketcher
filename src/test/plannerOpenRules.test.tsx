import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  fromMock.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: [], error: null })),
      })),
    })),
  }))
}

function loadPlannerImage() {
  const image = screen.getByRole('img', { name: 'Garage' }) as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
  Object.defineProperty(image, 'clientWidth', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'clientHeight', { configurable: true, value: 600 })
  fireEvent.load(image)
}

function renderCanvas(selectedBagId: string | null, isCoarse = false) {
  setPointerMode(isCoarse)
  mockSupabaseBasics()

  return render(
    <PlannerCanvas
      imageUrl="/garage.png"
      name="Garage"
      packId="pack-1"
      bags={baseBags}
      isEditMode={false}
      selectedBagId={selectedBagId}
      highlightBagId={null}
      onToggleEditMode={() => {}}
      onSelectBagId={() => {}}
      onHighlightBagIdChange={() => {}}
      addBagRequestId={0}
      onOpenDetails={() => {}}
    />
  )
}

describe('Planner open/close rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('desktop: opens details by double-click only, closes by overlay and Escape', async () => {
    const user = userEvent.setup()
    const { container } = renderCanvas('bag-1', false)
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open details for Box 1/i })).not.toBeInTheDocument()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })

    await screen.findByLabelText('Bag details panel')

    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })
  })

  it('mobile: opens details on double-tap and does not render gear', async () => {
    const user = userEvent.setup()
    const { container } = renderCanvas('bag-1', true)
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open details for Box 1/i })).not.toBeInTheDocument()

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })

    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 146, clientY: 136 })
    await screen.findByLabelText('Bag details panel')
    expect(screen.queryByRole('button', { name: 'Close panel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })
  })

  it('mobile: does not open details when taps are too far apart in time', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const { container } = renderCanvas('bag-1', true)
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    now = 1401
    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 141, clientY: 131 })

    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })
  })

  it('mobile: does not open details when second tap hits another box', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const { container } = renderCanvas('bag-1', true)
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()

    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    now = 1200
    fireEvent.click(canvas as HTMLCanvasElement, { clientX: 420, clientY: 150 })

    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })
  })

  it('keeps panel on current box when selection changes', async () => {
    const { container, rerender } = renderCanvas('bag-1', false)
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    await screen.findByLabelText('Bag details panel')
    expect(screen.getByLabelText('Box name')).toHaveValue('Box 1')

    rerender(
      <PlannerCanvas
        imageUrl="/garage.png"
        name="Garage"
        packId="pack-1"
        bags={baseBags}
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

    expect(screen.getByLabelText('Box name')).toHaveValue('Box 1')
  })
})
