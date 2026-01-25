import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PlannerCanvas } from './PlannerCanvas'
import { redirect } from 'next/navigation'
import type { Item } from '@/types'

interface PlannerPageProps {
  params: Promise<{ backgroundId: string }>
}

export default async function PlannerPage({ params }: PlannerPageProps) {
  const { backgroundId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Load background directly from Supabase
  const { data: background, error } = await supabase
    .from('backgrounds')
    .select('*')
    .eq('id', backgroundId)
    .eq('user_id', user.id)
    .single()

  if (error || !background) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Not Found</h1>
          <p className="text-gray-600 mb-4">
            The background you're looking for doesn't exist or you don't have access to it.
          </p>
          <a
            href="/dashboard"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    )
  }

  // Load or create pack for this background
  let packId: string
  const { data: existingPack } = await supabase
    .from('packs')
    .select('id')
    .eq('background_id', backgroundId)
    .eq('user_id', user.id)
    .single()

  if (existingPack) {
    packId = existingPack.id
  } else {
    // Create new pack
    const { data: newPack, error: createError } = await supabase
      .from('packs')
      .insert({
        background_id: backgroundId,
        user_id: user.id,
        name: `${background.name} pack`,
      })
      .select('id')
      .single()

    if (createError || !newPack) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
            <p className="text-gray-600 mb-4">
              Failed to initialize pack. Please try again.
            </p>
            <a
              href="/dashboard"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Return to Dashboard
            </a>
          </div>
        </div>
      )
    }

    packId = newPack.id
  }

  // Load items for this pack
  let items: Item[] = []
  const { data: itemsData, error: itemsError } = await supabase
    .from('items')
    .select('*')
    .eq('pack_id', packId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (itemsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-4">
            Failed to load items. Please try again.
          </p>
          <a
            href="/dashboard"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    )
  }

  items = itemsData || []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {background.name}
          </h1>
          <p className="text-gray-600 capitalize">
            {background.type}
          </p>
        </div>

        {/* Canvas */}
        <PlannerCanvas
          imageUrl={background.image_url}
          name={background.name}
          packId={packId}
          items={items}
        />
      </div>
    </div>
  )
}
