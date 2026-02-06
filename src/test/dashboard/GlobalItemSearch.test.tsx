import { GlobalItemSearch } from '@/app/(dashboard)/dashboard/GlobalItemSearch'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const originalFetch = global.fetch

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

describe('GlobalItemSearch', () => {
  afterEach(() => {
    pushMock.mockReset()
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('debounces API calls to ~250ms', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    global.fetch = fetchMock as any

    render(<GlobalItemSearch />)

    const input = screen.getByLabelText(/global item search/i)
    await user.type(input, 'abc')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 180)) // total ~330ms
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('closes dropdown on outside click', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          itemName: 'Pump',
          workspaceName: 'Garage',
          boxName: 'Front Box',
          backgroundId: 'bg-1',
          bagId: 'bag-1',
        },
      ]),
    })
    global.fetch = fetchMock as any

    render(<GlobalItemSearch />)

    const input = screen.getByLabelText(/global item search/i)
    await user.type(input, 'abc')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })

    const results = await screen.findAllByRole('button', { name: /Pump/ })
    expect(results.length).toBeGreaterThan(0)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(document.body)

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('closes dropdown on Escape', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
    global.fetch = fetchMock as any

    render(<GlobalItemSearch />)

    const input = screen.getByLabelText(/global item search/i)
    await user.type(input, 'abc')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('navigates to planner with background and bag ids on result click', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          itemName: 'Pump',
          workspaceName: 'Garage',
          boxName: 'Front Box',
          backgroundId: 'bg-1',
          bagId: 'bag-1',
        },
      ]),
    })
    global.fetch = fetchMock as any

    render(<GlobalItemSearch />)

    const input = screen.getByLabelText(/global item search/i)
    await user.type(input, 'pump')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320))
    })

    const button = await screen.findByRole('button', { name: /Pump/ })
    await user.click(button)

    expect(pushMock).toHaveBeenCalledWith('/planner/bg-1?bagId=bag-1')
  })
})
