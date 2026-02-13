import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const fromMock = vi.fn()
const createSupabaseServerClientMock = vi.fn(async () => ({
  auth: {
    getUser: getUserMock,
  },
  from: fromMock,
}))
const getAccessStateMock = vi.fn(async () => 'active')
const accessStateLabelMock = vi.fn(() => 'Active subscription')

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/access/entitlements', () => ({
  getAccessState: getAccessStateMock,
  accessStateLabel: accessStateLabelMock,
}))

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill, ...imageProps } = props
    void fill
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...imageProps} />
  },
}))

vi.mock('@/app/(dashboard)/dashboard/BackgroundCard', () => ({
  BackgroundCard: ({ bg }: { bg: { name: string } }) => <div>{bg.name}</div>,
}))

vi.mock('@/app/(dashboard)/dashboard/LogoutButton', () => ({
  LogoutButton: () => <button type="button">Logout</button>,
}))

vi.mock('@/app/(dashboard)/dashboard/TemplatesSection', () => ({
  TemplatesSection: () => <div>Templates</div>,
}))

vi.mock('@/app/(dashboard)/dashboard/GlobalItemSearch', () => ({
  GlobalItemSearch: () => <div>Search</div>,
}))

vi.mock('@/app/(dashboard)/dashboard/ActivityFeed', () => ({
  ActivityFeed: () => <div>Activity</div>,
}))

vi.mock('@/app/(dashboard)/dashboard/UploadCustomBackgroundButton', () => ({
  UploadCustomBackgroundButton: () => <button type="button">Upload Custom Background</button>,
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    const backgroundsBuilder = {
      select: vi.fn(function () { return this }),
      eq: vi.fn(function () { return this }),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'bg-1',
            user_id: 'user-1',
            name: 'Garage',
            type: 'motorcycle',
            image_url: '/moto.webp',
            width: 1000,
            height: 600,
            is_public: false,
            created_at: '2026-02-01T10:00:00.000Z',
          },
        ],
        error: null,
      }),
    }
    const activitiesBuilder = {
      select: vi.fn(function () { return this }),
      eq: vi.fn(function () { return this }),
      order: vi.fn(function () { return this }),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }

    fromMock.mockImplementation((table: string) => {
      if (table === 'backgrounds') return backgroundsBuilder
      if (table === 'activities') return activitiesBuilder
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('renders Help link that points to /dashboard/help', async () => {
    const mod = await import('@/app/(dashboard)/dashboard/page')
    const DashboardPage = mod.default

    render(await DashboardPage())

    const helpLink = screen.getByRole('link', { name: 'Help' })
    expect(helpLink).toHaveAttribute('href', '/dashboard/help')
  })

  it('loads dashboard data directly from supabase and does not call internal api fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const mod = await import('@/app/(dashboard)/dashboard/page')
    const DashboardPage = mod.default

    render(await DashboardPage())

    expect(fromMock).toHaveBeenCalledWith('backgrounds')
    expect(fromMock).toHaveBeenCalledWith('activities')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
