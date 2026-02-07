import { TemplatesSection } from '@/app/(dashboard)/dashboard/TemplatesSection'
import type { BackgroundType } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

describe('TemplatesSection', () => {
  it('renders collapsed by default', () => {
    render(<TemplatesSection templates={templates} />)

    const expandButton = screen.getByRole('button', { name: 'Expand' })
    expect(expandButton).toBeInTheDocument()
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(expandButton).toHaveAttribute('aria-controls', 'dashboard-template-grid')
    expect(screen.queryByTestId('template-grid')).not.toBeInTheDocument()
    expect(screen.queryByText('Motorcycle')).not.toBeInTheDocument()
  })

  it('expands and shows templates on click', async () => {
    const user = userEvent.setup()
    render(<TemplatesSection templates={templates} />)

    await user.click(screen.getByRole('button', { name: 'Expand' }))

    const minimizeButton = screen.getByRole('button', { name: 'Minimize' })
    expect(minimizeButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('template-grid')).toBeInTheDocument()
    expect(screen.getByText('Motorcycle')).toBeInTheDocument()
    expect(screen.getByText('Bicycle')).toBeInTheDocument()
  })

  it('collapses back on second click', async () => {
    const user = userEvent.setup()
    render(<TemplatesSection templates={templates} />)

    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Motorcycle')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(screen.queryByTestId('template-grid')).not.toBeInTheDocument()
  })
})
