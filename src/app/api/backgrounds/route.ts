import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { mapSupabaseError } from '@/lib/supabase/errorMapping'
import { normalizeName } from '@/lib/validation'
import { smallestFreeWorkspaceName } from '@/lib/workspaces/naming'
import type { CreateBackgroundInput } from '@/types'

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
  } catch (error) {
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
        width: width ?? 1920,
        height: height ?? 1080,
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
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
