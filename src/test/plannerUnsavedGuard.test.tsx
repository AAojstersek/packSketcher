import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function mockSupabase() {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  rpcMock.mockResolvedValue({ error: null })

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
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: baseBag, error: null })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
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

function renderCanvas(
  onToggleEditMode: () => void,
  registerToggle?: (handler: (() => void) | null) => void,
  registerMoveItems?: (
    handler: ((action: () => Promise<void> | void) => void) | null
  ) => void
) {
  setPointerModeDesktop()
  mockSupabase()

  return render(
    <PlannerCanvas
      imageUrl="/garage.png"
      name="Garage"
      packId="pack-1"
      bags={[baseBag]}
      isEditMode={true}
      selectedBagId="bag-1"
      highlightBagId={null}
      onToggleEditMode={onToggleEditMode}
      onSelectBagId={() => {}}
      onHighlightBagIdChange={() => {}}
      addBagRequestId={0}
      onOpenDetails={() => {}}
      onRegisterToggleEditModeHandler={registerToggle}
      onRegisterMoveItemsGuardHandler={registerMoveItems}
    />
  )
}

describe('Planner unsaved changes guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('guards close panel and supports Cancel/Discard choices', async () => {
    const user = userEvent.setup()
    const { container } = renderCanvas(() => {})
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    await screen.findByLabelText('Bag details panel')

    await user.clear(screen.getByLabelText('Box name'))
    await user.type(screen.getByLabelText('Box name'), 'Changed Box')

    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    const guardDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    expect(screen.getByLabelText('Bag details panel')).toBeInTheDocument()

    await user.click(within(guardDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Bag details panel')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    const discardDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await user.click(within(discardDialog).getByRole('button', { name: 'Discard' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Bag details panel')).not.toBeInTheDocument()
    })
  })

  it('guards toggle Edit off from header-driven handler', async () => {
    const user = userEvent.setup()
    const onToggleEditMode = vi.fn()
    let registeredHandler: (() => void) | null = null

    const { container } = renderCanvas(onToggleEditMode, (handler) => {
      registeredHandler = handler
    })
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    await screen.findByLabelText('Bag details panel')
    await user.type(screen.getByLabelText('Box name'), ' dirty')

    expect(registeredHandler).toBeTypeOf('function')
    await act(async () => {
      registeredHandler?.()
    })

    const toggleDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    expect(onToggleEditMode).not.toHaveBeenCalled()

    await user.click(within(toggleDialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => {
      expect(onToggleEditMode).toHaveBeenCalledTimes(1)
    })
  })

  it('guards move-items actions via registered handler', async () => {
    const user = userEvent.setup()
    const moveAction = vi.fn()
    let registeredMoveHandler:
      | ((action: () => Promise<void> | void) => void)
      | null = null

    const { container } = renderCanvas(
      () => {},
      undefined,
      (handler) => {
        registeredMoveHandler = handler
      }
    )
    loadPlannerImage()

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    fireEvent.doubleClick(canvas as HTMLCanvasElement, { clientX: 140, clientY: 130 })
    await screen.findByLabelText('Bag details panel')
    await user.type(screen.getByLabelText('Box name'), ' dirty')

    expect(registeredMoveHandler).toBeTypeOf('function')
    await act(async () => {
      registeredMoveHandler?.(() => {
        moveAction()
      })
    })

    const moveDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    expect(moveAction).not.toHaveBeenCalled()

    await user.click(within(moveDialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => {
      expect(moveAction).toHaveBeenCalledTimes(1)
    })
  })
})
