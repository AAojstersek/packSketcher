import { CreateFromTemplateButton } from '@/app/(dashboard)/dashboard/CreateFromTemplateButton'
import { TEMPLATE_CREATED_EVENT } from '@/app/(dashboard)/dashboard/events'
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

function assignFetchMock(fetchMock: ReturnType<typeof vi.fn>) {
  global.fetch = fetchMock as unknown as typeof fetch
}

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
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'bg-1', name: 'Motorcycle 2' }),
    })
    assignFetchMock(fetchMock)

    renderButton()

    await user.click(screen.getByRole('button', { name: /use this template/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds', expect.objectContaining({
        method: 'POST',
      }))
      expect(refreshMock).toHaveBeenCalled()
    })

    const templateCreatedEvent = dispatchEventSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === TEMPLATE_CREATED_EVENT) as CustomEvent<{ workspaceName: string }> | undefined

    expect(templateCreatedEvent).toBeDefined()
    expect(templateCreatedEvent?.detail).toEqual({ workspaceName: 'Motorcycle 2' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces friendly API errors', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Name already exists' }),
    })
    assignFetchMock(fetchMock)

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
    assignFetchMock(fetchMock)

    renderButton()

    await user.click(screen.getByRole('button', { name: /use this template/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create workspace')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
