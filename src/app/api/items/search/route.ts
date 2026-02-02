import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseItemsSearchQuery, shapeItemsSearchResults } from '@/lib/items/search'

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const { term, shouldQuery } = parseItemsSearchQuery(searchParams.get('q'))

    if (!shouldQuery) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('items')
      .select(`
        name,
        bag_id,
        last_moved_at,
        description,
        bags!inner(
          id,
          name,
          pack_id,
          packs!inner(
            background_id,
            backgrounds!inner(
              id,
              name
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
      .order('last_moved_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = shapeItemsSearchResults(data ?? [])
    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
