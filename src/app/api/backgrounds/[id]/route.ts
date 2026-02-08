import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { mapSupabaseError } from '@/lib/supabase/errorMapping'
import { MAX_NAME_LENGTH, normalizeName } from '@/lib/validation'
import { parseStorageObjectPathFromPublicUrl } from '@/lib/backgroundUpload/storagePath'

const CUSTOM_BACKGROUND_BUCKET =
  process.env.SUPABASE_CUSTOM_BACKGROUNDS_BUCKET ??
  process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_BACKGROUNDS_BUCKET ??
  'backgrounds'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json(
          { error: 'Background not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const { data: existing, error: fetchError } = await supabase
      .from('backgrounds')
      .select('id,type,image_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Background not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('backgrounds')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.code === 'unknown' ? 500 : 400 }
      )
    }

    if (existing.type === 'custom' && typeof existing.image_url === 'string') {
      const objectPath = parseStorageObjectPathFromPublicUrl(
        existing.image_url,
        CUSTOM_BACKGROUND_BUCKET,
        { supabaseUrl: SUPABASE_URL }
      )
      if (objectPath) {
        // Best-effort cleanup: workspace delete should still succeed if storage remove fails.
        await supabase.storage.from(CUSTOM_BACKGROUND_BUCKET).remove([objectPath])
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const rawName = typeof body?.name === 'string' ? body.name : ''
    const normalizedName = normalizeName(rawName)

    if (!normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (rawName.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: 'Name must be 60 characters or fewer' },
        { status: 400 }
      )
    }

    const { data: existing, error: fetchError } = await supabase
      .from('backgrounds')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Background not found' },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('backgrounds')
      .update({ name: normalizedName })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        { status: mapped.code === 'unknown' ? 500 : 400 }
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
