import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Dashboard help page', () => {
  it('renders key guide sections', async () => {
    const mod = await import('@/app/(dashboard)/dashboard/help/page')
    const HelpPage = mod.default

    render(<HelpPage />)

    expect(screen.getByRole('heading', { name: 'Quick Start' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mobile Gestures' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Troubleshooting' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByText(/docs\/user-guide\.md/i)).not.toBeInTheDocument()
  })
})
