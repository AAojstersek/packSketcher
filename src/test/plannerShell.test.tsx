import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { PlannerShell } from '@/app/planner/[backgroundId]/PlannerShell'

interface HeaderMockProps {
  isEditMode: boolean
  onToggleEditMode: () => void
  onAddBag: () => void
}

interface CanvasMockProps {
  isEditMode: boolean
  selectedBagId: string | null
  highlightBagId: string | null
  addBagRequestId: number
  onSelectBagId: (bagId: string | null) => void
  onHighlightBagIdChange: (bagId: string | null) => void
}

let latestHeaderProps: HeaderMockProps | undefined
let latestCanvasProps: CanvasMockProps | undefined

vi.mock('@/app/planner/[backgroundId]/PlannerHeader', () => ({
  PlannerHeader: (props: HeaderMockProps) => {
    latestHeaderProps = props
    return (
      <div>
        <button type="button" onClick={props.onToggleEditMode}>
          toggle-edit
        </button>
        <button type="button" onClick={props.onAddBag}>
          add-bag
        </button>
      </div>
    )
  },
}))

vi.mock('@/app/planner/[backgroundId]/PlannerCanvas', () => ({
  PlannerCanvas: (props: CanvasMockProps) => {
    latestCanvasProps = props
    return (
      <div>
        <button type="button" onClick={() => props.onSelectBagId('bag-2')}>
          select-bag-2
        </button>
        <button type="button" onClick={() => props.onHighlightBagIdChange('bag-3')}>
          highlight-bag-3
        </button>
      </div>
    )
  },
}))

describe('PlannerShell', () => {
  afterEach(() => {
    latestHeaderProps = undefined
    latestCanvasProps = undefined
  })

  it('wires shared state between header and canvas', async () => {
    const user = userEvent.setup()

    render(
      <PlannerShell
        backgroundName="Garage"
        imageUrl="/garage.png"
        packId="pack-1"
        bags={[]}
        initialHighlightBagId="bag-1"
      />
    )

    expect(latestHeaderProps?.isEditMode).toBe(false)
    expect(latestCanvasProps?.isEditMode).toBe(false)
    expect(latestCanvasProps?.selectedBagId).toBe('bag-1')
    expect(latestCanvasProps?.highlightBagId).toBe('bag-1')
    expect(latestCanvasProps?.addBagRequestId).toBe(0)

    await user.click(screen.getByRole('button', { name: 'toggle-edit' }))
    await waitFor(() => {
      expect(latestHeaderProps?.isEditMode).toBe(true)
      expect(latestCanvasProps?.isEditMode).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'select-bag-2' }))
    await waitFor(() => {
      expect(latestCanvasProps?.selectedBagId).toBe('bag-2')
      expect(latestCanvasProps?.highlightBagId).toBeNull()
    })

    await user.click(screen.getByRole('button', { name: 'highlight-bag-3' }))
    await waitFor(() => {
      expect(latestCanvasProps?.highlightBagId).toBe('bag-3')
    })

    await user.click(screen.getByRole('button', { name: 'add-bag' }))
    await waitFor(() => {
      expect(latestCanvasProps?.addBagRequestId).toBe(1)
    })
  })
})
