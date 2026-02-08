import { TemplatesSection } from '@/app/(dashboard)/dashboard/TemplatesSection'
import { TEMPLATE_CREATED_EVENT } from '@/app/(dashboard)/dashboard/events'
import type { BackgroundType } from '@/types'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/dashboard/TemplateGrid', () => ({
  TemplateGrid: ({ templates }: { templates: Array<{ name: string }> }) => (
    <ul data-testid="template-grid">
      {templates.map((template) => (
        <li key={template.name}>{template.name}</li>
      ))}
    </ul>
  ),
}))

const templates: Array<{ name: string; type: BackgroundType; imageUrl: string }> = [
  { name: 'Motorcycle', type: 'motorcycle', imageUrl: '/moto.png' },
  { name: 'Bicycle', type: 'bicycle', imageUrl: '/bike.png' },
]

const storageKey = 'packsketcher:dashboard:templates-collapsed'

let storageData: Record<string, string> = {}

describe('TemplatesSection', () => {
  beforeEach(() => {
    storageData = {}
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storageData[key] ?? null,
        setItem: (key: string, value: string) => {
          storageData[key] = String(value)
        },
        removeItem: (key: string) => {
          delete storageData[key]
        },
        clear: () => {
          storageData = {}
        },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders expanded by default', () => {
    render(<TemplatesSection templates={templates} />)

    const minimizeButton = screen.getByRole('button', { name: 'Minimize' })
    expect(minimizeButton).toBeInTheDocument()
    expect(minimizeButton).toHaveAttribute('aria-expanded', 'true')
    expect(minimizeButton).toHaveAttribute('aria-controls', 'dashboard-template-grid')
    expect(screen.getByTestId('template-grid')).toBeInTheDocument()
    expect(screen.getByText('Motorcycle')).toBeInTheDocument()
  })

  it('collapses and stores preference on click', async () => {
    const user = userEvent.setup()
    render(<TemplatesSection templates={templates} />)

    await user.click(screen.getByRole('button', { name: 'Minimize' }))

    const expandButton = screen.getByRole('button', { name: 'Expand' })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('template-grid')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(storageKey)).toBe('true')
  })

  it('restores collapsed state from localStorage', () => {
    window.localStorage.setItem(storageKey, 'true')

    render(<TemplatesSection templates={templates} />)

    return waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
      expect(screen.queryByTestId('template-grid')).not.toBeInTheDocument()
    })
  })

  it('re-expands and updates localStorage when toggled back', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(storageKey, 'true')
    render(<TemplatesSection templates={templates} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Motorcycle')).toBeInTheDocument()
    expect(window.localStorage.getItem(storageKey)).toBe('false')
  })

  it('collapses and shows success toast when template-created event is dispatched', async () => {
    render(<TemplatesSection templates={templates} />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TEMPLATE_CREATED_EVENT, {
          detail: { workspaceName: 'Motorcycle 2' },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    })
    expect(window.localStorage.getItem(storageKey)).toBe('true')
    expect(screen.getByRole('status')).toHaveTextContent('Added "Motorcycle 2" to My Background.')
  })

  it('resets toast timer and keeps latest workspace name on repeated success events', async () => {
    vi.useFakeTimers()
    render(<TemplatesSection templates={templates} />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TEMPLATE_CREATED_EVENT, {
          detail: { workspaceName: 'Motorcycle 2' },
        })
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('Added "Motorcycle 2" to My Background.')

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TEMPLATE_CREATED_EVENT, {
          detail: { workspaceName: 'Bicycle 3' },
        })
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('Added "Bicycle 3" to My Background.')

    act(() => {
      vi.advanceTimersByTime(2_500)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
