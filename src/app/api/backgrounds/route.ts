import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { friendlySupabaseMessage, mapSupabaseError } from '@/lib/supabase/errorMapping'
import { normalizeName } from '@/lib/validation'
import { smallestFreeWorkspaceName } from '@/lib/workspaces/naming'
import {
  extensionForBackgroundUploadMimeType,
  validateBackgroundUploadInput,
} from '@/lib/backgroundUpload/validation'
import type { CreateBackgroundInput } from '@/types'

const DEFAULT_BACKGROUND_WIDTH = 1920
const DEFAULT_BACKGROUND_HEIGHT = 1080
const CUSTOM_BACKGROUND_BUCKET =
  process.env.SUPABASE_CUSTOM_BACKGROUNDS_BUCKET ??
  process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_BACKGROUNDS_BUCKET ??
  'backgrounds'

function parsePositiveNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return value instanceof File
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data, error } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const rawName = typeof formData.get('name') === 'string' ? String(formData.get('name')) : ''
      const file = formData.get('file')
      const width = parsePositiveNumber(formData.get('width'))
      const height = parsePositiveNumber(formData.get('height'))

      if (!isFileLike(file) || width == null || height == null) {
        return NextResponse.json(
          { error: 'Invalid custom background upload payload.' },
          { status: 400 }
        )
      }

      const validation = validateBackgroundUploadInput({
        name: rawName,
        mimeType: file.type,
        sizeBytes: file.size,
        width,
        height,
      })
      if (validation.error) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        )
      }

      const extension = extensionForBackgroundUploadMimeType(file.type)
      if (!extension) {
        return NextResponse.json(
          { error: 'Unsupported file type.' },
          { status: 400 }
        )
      }

      // Fetch existing names to enforce smallest free suffix.
      const { data: existingNames, error: fetchError } = await supabase
        .from('backgrounds')
        .select('name')
        .eq('user_id', user.id)

      if (fetchError) {
        const mapped = mapSupabaseError(fetchError)
        return NextResponse.json(
          { error: mapped.message, code: mapped.code },
          { status: mapped.code === 'unknown' ? 500 : 400 }
        )
      }

      const finalName = smallestFreeWorkspaceName(
        validation.normalizedName,
        existingNames?.map((row) => row.name) ?? []
      )

      const objectPath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase
        .storage
        .from(CUSTOM_BACKGROUND_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: friendlySupabaseMessage(uploadError, 'Failed to upload custom background image.') },
          { status: 500 }
        )
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(CUSTOM_BACKGROUND_BUCKET).getPublicUrl(objectPath)

      const { data, error } = await supabase
        .from('backgrounds')
        .insert({
          user_id: user.id,
          name: finalName,
          type: 'custom',
          image_url: publicUrl,
          width,
          height,
          is_public: false,
        })
        .select()
        .single()

      if (error) {
        const mapped = mapSupabaseError(error)
        return NextResponse.json(
          { error: mapped.message, code: mapped.code },
          { status: mapped.code === 'unknown' ? 500 : 400 }
        )
      }

      return NextResponse.json(data, { status: 201 })
    }

    const body: CreateBackgroundInput = await request.json()
    const { name, type, image_url, width, height } = body

    const normalizedName = normalizeName(name ?? '')

    if (!normalizedName || !type || !image_url) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, image_url' },
        { status: 400 }
      )
    }

    // Fetch existing names to enforce smallest free suffix.
    const { data: existingNames, error: fetchError } = await supabase
      .from('backgrounds')
      .select('name')
      .eq('user_id', user.id)

    if (fetchError) {
      const mapped = mapSupabaseError(fetchError)
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.code === 'unknown' ? 500 : 400 }
      )
    }

    const finalName = smallestFreeWorkspaceName(
      normalizedName,
      existingNames?.map((row) => row.name) ?? []
    )

    const { data, error } = await supabase
      .from('backgrounds')
      .insert({
        user_id: user.id,
        name: finalName,
        type,
        image_url,
        width: width ?? DEFAULT_BACKGROUND_WIDTH,
        height: height ?? DEFAULT_BACKGROUND_HEIGHT,
        is_public: false,
      })
      .select()
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.code === 'unknown' ? 500 : 400 }
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
