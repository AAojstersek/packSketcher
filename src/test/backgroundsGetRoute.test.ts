import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/backgrounds/route'

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/backgroundUpload/processImage', () => {
  throw new Error('processImage module should not be imported for GET /api/backgrounds')
})

describe('GET /api/backgrounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user backgrounds without loading image processing module', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'bg-1',
          user_id: 'user-1',
          name: 'Garage',
          type: 'motorcycle',
          image_url: '/ozadja/motoOzadje.webp',
          width: 1000,
          height: 600,
          is_public: false,
          created_at: '2026-02-01T10:00:00.000Z',
        },
      ],
      error: null,
    })
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: orderMock,
        }),
      }),
    })

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromMock,
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toHaveLength(1)
    expect(fromMock).toHaveBeenCalledWith('backgrounds')
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})
