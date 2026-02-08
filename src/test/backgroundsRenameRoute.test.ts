import { PATCH } from '@/app/api/backgrounds/[id]/route'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

type SupabaseQueryResult<T> = Promise<{ data: T | null; error: unknown }>

function createSupabaseMock(options: {
  existingResult: SupabaseQueryResult<{ id: string }>
  updateResult: SupabaseQueryResult<{ id: string; name: string }>
}) {
  const selectQuery = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => options.existingResult),
  }
  const updateQuery = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => options.updateResult),
  }
  const updateMock = vi.fn().mockReturnValue(updateQuery)
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectQuery),
    update: updateMock,
  })

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromMock,
    },
    fromMock,
    updateMock,
    updateQuery,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/backgrounds/[id]', () => {
  it('renames workspace and returns updated row', async () => {
    const { supabase, fromMock, updateMock, updateQuery } = createSupabaseMock({
      existingResult: Promise.resolve({ data: { id: 'bg-1' }, error: null }),
      updateResult: Promise.resolve({
        data: { id: 'bg-1', name: 'Garage 2' },
        error: null,
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const request = new Request('http://localhost/api/backgrounds/bg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Garage 2  ' }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: 'bg-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.name).toBe('Garage 2')
    expect(fromMock).toHaveBeenCalledWith('backgrounds')
    expect(updateMock).toHaveBeenCalledWith({ name: 'Garage 2' })
    expect(updateQuery.select).toHaveBeenCalled()
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'bg-1')
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('maps unique constraint failures to friendly rename error', async () => {
    const { supabase } = createSupabaseMock({
      existingResult: Promise.resolve({ data: { id: 'bg-1' }, error: null }),
      updateResult: Promise.resolve({
        data: null,
        error: {
          code: '23505',
          constraint: 'backgrounds_user_id_lower_name_unique',
          message: 'duplicate key value violates unique constraint',
        },
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const request = new Request('http://localhost/api/backgrounds/bg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Garage' }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: 'bg-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.code).toBe('unique_workspace_name')
    expect(payload.error).toBe('Workspace name is already in use')
  })
})
