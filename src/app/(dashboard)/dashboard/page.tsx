import { createSupabaseServerClient } from '@/lib/supabase/server'
import { BackgroundCard } from './BackgroundCard'
import { LogoutButton } from './LogoutButton'
import { TemplateGrid } from './TemplateGrid'
import type { Background } from '@/types'
import { headers } from 'next/headers'
import Link from 'next/link'
import Image from 'next/image'

const LOCAL_TEMPLATES = [
  {
    name: 'Motorcycle',
    type: 'motorcycle' as const,
    imageUrl: '/ozadja/motoOzadje.png',
  },
  {
    name: 'Bicycle',
    type: 'bicycle' as const,
    imageUrl: '/ozadja/bikeOzadje.png',
  },
  {
    name: 'Backpack',
    type: 'backpack' as const,
    imageUrl: '/ozadja/backpackOzadje.png',
  },
]

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // This should be handled by middleware, but just in case
    return <div>Please log in</div>
  }

  // Fetch user's saved backgrounds via API
  let backgrounds: Background[] = []
  try {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const response = await fetch(`${protocol}://${host}/api/backgrounds`, {
      cache: 'no-store',
      headers: {
        Cookie: headersList.get('cookie') || '',
      },
    })
    if (response.ok) {
      backgrounds = await response.json()
    }
  } catch (error) {
    console.error('Failed to fetch backgrounds:', error)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-xl font-semibold text-slate-900 hover:text-slate-700"
            >
              <Image
                src="/logo/PSlogoBlack.svg"
                alt=""
                width={28}
                height={28}
                className="shrink-0"
              />
              <span>PackSketcher</span>
            </Link>
            <p className="mt-1 text-sm text-slate-600">
              Logged in as <span className="font-medium">{user.email}</span>
            </p>
          </div>
          <LogoutButton />
        </div>

        {/* Background Templates Section */}
        <div className="mb-12">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Background Templates
          </h2>
          <TemplateGrid templates={LOCAL_TEMPLATES} />
        </div>

        {/* Recent Backgrounds Section */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Backgrounds
            </h2>
            <button
              disabled
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400 cursor-not-allowed"
            >
              Upload Custom Background
            </button>
          </div>
          {backgrounds && backgrounds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {backgrounds.map((bg: Background) => (
                <BackgroundCard key={bg.id} bg={bg} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-slate-500">
                No saved backgrounds yet. Use a template above to get started.
              </p>
            </div>
          )}
        </div>

        {/* User Stats Placeholder */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Your Stats
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-slate-500 text-center">
              Stats will be displayed here soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}