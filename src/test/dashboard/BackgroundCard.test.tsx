import { BackgroundCard } from '@/app/(dashboard)/dashboard/BackgroundCard'
import type { Background } from '@/types'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()
const originalFetch = global.fetch
let dispatchEventSpy: ReturnType<typeof vi.spyOn>

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}))

vi.mock('next/image', () => ({
  __esModule: true,
  // Simple img stub to avoid Next.js image warnings in tests
  default: ({ fill: _fill, ...props }: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...props} />
  },
}))

const mockBackground: Background = {
  id: 'bg-1',
  user_id: 'user-1',
  name: 'Garage',
  type: 'motorcycle',
  image_url: '/image.png',
  width: 1200,
  height: 800,
  is_public: false,
  created_at: '2024-01-01T00:00:00Z',
}

afterEach(() => {
  vi.restoreAllMocks()
  refreshMock.mockReset()
  global.fetch = originalFetch
})

beforeEach(() => {
  dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
})

describe('BackgroundCard delete button', () => {
  it('calls delete endpoint and refreshes when confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn() })
    global.fetch = fetchMock as any

    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /delete workspace/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds/bg-1', { method: 'DELETE' })
      expect(refreshMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not delete when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const fetchMock = vi.fn()
    global.fetch = fetchMock as any

    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /delete workspace/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces API error messages when delete fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Delete failed' }),
    })
    global.fetch = fetchMock as any

    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /delete workspace/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('hides workspace type in the card UI', () => {
    render(<BackgroundCard bg={mockBackground} />)

    expect(screen.queryByText(/motorcycle/i)).not.toBeInTheDocument()
  })
})

describe('BackgroundCard rename flow', () => {
  it('opens rename modal with prefilled current name and cancels', async () => {
    const user = userEvent.setup()
    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /rename workspace/i }))

    const dialog = screen.getByRole('dialog', { name: /rename workspace/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/workspace name/i)).toHaveValue('Garage')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: /rename workspace/i })).not.toBeInTheDocument()
  })

  it('submits rename and refreshes dashboard on success', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'bg-1', name: 'Garage 2' }),
    })
    global.fetch = fetchMock as any

    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /rename workspace/i }))
    const nameInput = screen.getByLabelText(/workspace name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Garage 2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds/bg-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Garage 2' }),
      })
      expect(refreshMock).toHaveBeenCalled()
    })
    expect(dispatchEventSpy).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: /rename workspace/i })).not.toBeInTheDocument()
  })

  it('renders rename API errors in modal', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Workspace name is already in use' }),
    })
    global.fetch = fetchMock as any

    render(<BackgroundCard bg={mockBackground} />)

    await user.click(screen.getByRole('button', { name: /rename workspace/i }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Workspace name is already in use')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
