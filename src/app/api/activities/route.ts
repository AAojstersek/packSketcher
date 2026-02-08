import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { shapeActivitiesResponse } from '@/lib/activities'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('activities')
      .select('id, event_type, message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = shapeActivitiesResponse(data ?? [])
    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
