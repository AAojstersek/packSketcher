import { UploadCustomBackgroundButton } from '@/app/(dashboard)/dashboard/UploadCustomBackgroundButton'
import { readImageDimensions } from '@/lib/backgroundUpload/imageDimensions'
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

vi.mock('@/lib/backgroundUpload/imageDimensions', () => ({
  readImageDimensions: vi.fn(),
}))

function openModal(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: /upload custom background/i }))
}

afterEach(() => {
  vi.restoreAllMocks()
  refreshMock.mockReset()
  global.fetch = originalFetch
})

beforeEach(() => {
  dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
})

describe('UploadCustomBackgroundButton', () => {
  it('shows validation error for unsupported file type', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<UploadCustomBackgroundButton />)
    await openModal(user)

    const fileInput = screen.getByLabelText(/image file/i)
    const invalid = new File(['x'], 'bg.gif', { type: 'image/gif' })
    await user.upload(fileInput, invalid)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Only PNG, JPEG, and WEBP images are supported.')
    })
    expect(readImageDimensions).not.toHaveBeenCalled()
  })

  it('submits valid upload and refreshes dashboard', async () => {
    const user = userEvent.setup()
    vi.mocked(readImageDimensions).mockResolvedValue({ width: 1920, height: 1080 })

    let resolveFetch: ((value: unknown) => void) | null = null
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(pendingFetch)
    global.fetch = fetchMock as unknown as typeof fetch

    render(<UploadCustomBackgroundButton />)
    await openModal(user)

    await user.type(screen.getByLabelText(/workspace name/i), 'Garage custom')
    const fileInput = screen.getByLabelText(/image file/i)
    const file = new File(['image'], 'garage.png', { type: 'image/png' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds', expect.objectContaining({ method: 'POST' }))

    resolveFetch?.({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'bg-1' }),
    })

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
    expect(dispatchEventSpy).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('surfaces API errors from upload endpoint', async () => {
    const user = userEvent.setup()
    vi.mocked(readImageDimensions).mockResolvedValue({ width: 1600, height: 900 })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Bucket missing' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<UploadCustomBackgroundButton />)
    await openModal(user)

    await user.type(screen.getByLabelText(/workspace name/i), 'Garage custom')
    const fileInput = screen.getByLabelText(/image file/i)
    const file = new File(['image'], 'garage.webp', { type: 'image/webp' })
    await user.upload(fileInput, file)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Bucket missing')
    })
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
