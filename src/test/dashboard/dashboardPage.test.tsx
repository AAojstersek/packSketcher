import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const createSupabaseServerClientMock = vi.fn(async () => ({
  auth: {
    getUser: getUserMock,
  },
}))
const getAccessStateMock = vi.fn(async () => 'active')
const accessStateLabelMock = vi.fn(() => 'Active subscription')
const headersMock = vi.fn(async () => new Headers([
  ['host', 'example.com'],
  ['cookie', 'sb=1'],
]))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/access/entitlements', () => ({
  getAccessState: getAccessStateMock,
  accessStateLabel: accessStateLabelMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
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
    headersMock.mockResolvedValue(new Headers([
      ['host', 'example.com'],
      ['cookie', 'sb=1'],
    ]))

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/backgrounds')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'bg-1',
              user_id: 'user-1',
              name: 'Garage',
              type: 'motorcycle',
              image_url: '/moto.png',
              width: 1000,
              height: 600,
              is_public: false,
              created_at: '2026-02-01T10:00:00.000Z',
            },
          ],
        } as Response
      }
      return {
        ok: true,
        json: async () => [],
      } as Response
    }) as unknown as typeof fetch
  })

  it('renders Help link that points to /dashboard/help', async () => {
    const mod = await import('@/app/(dashboard)/dashboard/page')
    const DashboardPage = mod.default

    render(await DashboardPage())

    const helpLink = screen.getByRole('link', { name: 'Help' })
    expect(helpLink).toHaveAttribute('href', '/dashboard/help')
  })
})
