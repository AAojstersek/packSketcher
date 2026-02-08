import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/backgrounds/route'
import { DELETE } from '@/app/api/backgrounds/[id]/route'

const { createSupabaseServerClientMock, processCustomBackgroundImageMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  processCustomBackgroundImageMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/backgroundUpload/processImage', () => ({
  processCustomBackgroundImage: processCustomBackgroundImageMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function createMultipartRequest(formData: FormData): Request {
  return {
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=test-boundary' }),
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request
}

describe('POST /api/backgrounds (custom upload)', () => {
  it('uploads canonical processed webp and stores processed dimensions', async () => {
    processCustomBackgroundImageMock.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3, 4]),
      width: 1280,
      height: 720,
      mimeType: 'image/webp',
      extension: 'webp',
    })

    const uploadMock = vi.fn().mockResolvedValue({ error: null })
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const getPublicUrlMock = vi.fn().mockReturnValue({
      data: {
        publicUrl:
          'https://demo.supabase.co/storage/v1/object/public/backgrounds/user-1/processed.webp',
      },
    })
    const storageFromMock = vi.fn().mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
      getPublicUrl: getPublicUrlMock,
    })

    const selectExistingMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [{ name: 'Existing' }], error: null }),
    })
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: { id: 'bg-1', name: 'Garage' },
      error: null,
    })
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: insertSingleMock }),
    })
    const fromMock = vi.fn().mockReturnValue({
      select: selectExistingMock,
      insert: insertMock,
    })

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromMock,
      storage: {
        from: storageFromMock,
      },
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'garage.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('name', 'Garage')
    formData.append('width', '4000')
    formData.append('height', '3000')
    formData.append('file', file)

    const request = createMultipartRequest(formData)

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.id).toBe('bg-1')
    expect(processCustomBackgroundImageMock).toHaveBeenCalledWith(file)
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0][0]).toMatch(/\.webp$/)
    expect(uploadMock.mock.calls[0][1]).toBeInstanceOf(Buffer)
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: 'image/webp', upsert: false })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        height: 720,
        type: 'custom',
      })
    )
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('cleans up uploaded object when db insert fails', async () => {
    processCustomBackgroundImageMock.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3, 4]),
      width: 800,
      height: 600,
      mimeType: 'image/webp',
      extension: 'webp',
    })

    const uploadMock = vi.fn().mockResolvedValue({ error: null })
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const storageFromMock = vi.fn().mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
      getPublicUrl: vi.fn().mockReturnValue({
        data: {
          publicUrl:
            'https://demo.supabase.co/storage/v1/object/public/backgrounds/user-1/processed.webp',
        },
      }),
    })

    const selectExistingMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            constraint: 'backgrounds_user_id_lower_name_unique',
            message: 'duplicate key value violates unique constraint',
          },
        }),
      }),
    })
    const fromMock = vi.fn().mockReturnValue({
      select: selectExistingMock,
      insert: insertMock,
    })

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromMock,
      storage: {
        from: storageFromMock,
      },
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'garage.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('name', 'Garage')
    formData.append('file', file)

    const request = createMultipartRequest(formData)

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.code).toBe('unique_workspace_name')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const uploadedPath = uploadMock.mock.calls[0][0] as string
    expect(removeMock).toHaveBeenCalledWith([uploadedPath])
  })
})

describe('DELETE /api/backgrounds/[id]', () => {
  it('removes storage object for custom backgrounds after delete', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://demo.supabase.co'
    const host = new URL(supabaseUrl).host
    const imageUrl = `https://${host}/storage/v1/object/public/backgrounds/user-1/custom.webp`

    const selectSingleMock = vi.fn().mockResolvedValue({
      data: { id: 'bg-1', type: 'custom', image_url: imageUrl },
      error: null,
    })
    const selectEqUserMock = vi.fn().mockReturnValue({ single: selectSingleMock })
    const selectEqIdMock = vi.fn().mockReturnValue({ eq: selectEqUserMock })
    const selectMock = vi.fn().mockReturnValue({ eq: selectEqIdMock })

    const deleteEqUserMock = vi.fn().mockResolvedValue({ error: null })
    const deleteEqIdMock = vi.fn().mockReturnValue({ eq: deleteEqUserMock })
    const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqIdMock })

    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const storageFromMock = vi.fn().mockReturnValue({ remove: removeMock })
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
      delete: deleteMock,
    })

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: fromMock,
      storage: {
        from: storageFromMock,
      },
    })

    const request = new Request('http://localhost/api/backgrounds/bg-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: Promise.resolve({ id: 'bg-1' }) })

    expect(response.status).toBe(204)
    expect(removeMock).toHaveBeenCalledWith(['user-1/custom.webp'])
  })
})
