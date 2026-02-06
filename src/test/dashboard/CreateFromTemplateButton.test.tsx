import { CreateFromTemplateButton } from '@/app/(dashboard)/dashboard/CreateFromTemplateButton'
import type { BackgroundType } from '@/types'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()
const originalFetch = global.fetch

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}))

const renderButton = (overrides?: Partial<{ name: string; type: BackgroundType; imageUrl: string }>) =>
  render(
    <CreateFromTemplateButton
      name={overrides?.name ?? 'Motorcycle'}
      type={overrides?.type ?? 'motorcycle'}
      imageUrl={overrides?.imageUrl ?? '/image.png'}
    />
  )

afterEach(() => {
  vi.restoreAllMocks()
  refreshMock.mockReset()
  global.fetch = originalFetch
})

describe('CreateFromTemplateButton', () => {
  it('posts to API and refreshes on success, relying on server suffix', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'bg-1', name: 'Motorcycle 2' }),
    })
    global.fetch = fetchMock as any

    renderButton()

    await user.click(screen.getByRole('button', { name: /use this template/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds', expect.objectContaining({
        method: 'POST',
      }))
      expect(refreshMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces friendly API errors', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Name already exists' }),
    })
    global.fetch = fetchMock as any

    renderButton()

    await user.click(screen.getByRole('button', { name: /use this template/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name already exists')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows generic error on network failure', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'))
    global.fetch = fetchMock as any

    renderButton()

    await user.click(screen.getByRole('button', { name: /use this template/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create workspace')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
