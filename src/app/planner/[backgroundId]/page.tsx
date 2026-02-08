import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PlannerShell } from './PlannerShell'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Bag } from '@/types'

interface PlannerPageProps {
  params: Promise<{ backgroundId: string }>
  searchParams?: Promise<{ bagId?: string | string[] }>
}

export default async function PlannerPage({ params, searchParams }: PlannerPageProps) {
  const { backgroundId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const bagIdParam = resolvedSearchParams?.bagId
  const initialHighlightBagId = Array.isArray(bagIdParam) ? (bagIdParam[0] ?? null) : (bagIdParam ?? null)
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Not Found</h1>
          <p className="text-slate-600 mb-4">
            The background you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Return to Dashboard
          </Link>
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Error</h1>
            <p className="text-slate-600 mb-4">
              Failed to initialize pack. Please try again.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      )
    }

    packId = newPack.id
  }

  // Load bags for this pack
  let bags: Bag[] = []
  const { data: bagsData, error: bagsError } = await supabase
    .from('bags')
    .select('*')
    .eq('pack_id', packId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (bagsError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Error</h1>
          <p className="text-slate-600 mb-4">
            Failed to load bags. Please try again.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  bags = bagsData || []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <PlannerShell
          backgroundName={background.name}
          imageUrl={background.image_url}
          packId={packId}
          bags={bags}
          initialHighlightBagId={initialHighlightBagId}
        />
      </div>
    </div>
  )
}
