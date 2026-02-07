import { createSupabaseServerClient } from '@/lib/supabase/server'
import { BackgroundCard } from './BackgroundCard'
import { LogoutButton } from './LogoutButton'
import { TemplatesSection } from './TemplatesSection'
import { GlobalItemSearch } from './GlobalItemSearch'
import { ActivityFeed } from './ActivityFeed'
import { UploadCustomBackgroundButton } from './UploadCustomBackgroundButton'
import type { Background } from '@/types'
import type { ActivityResponse } from '@/lib/activities'
import { accessStateLabel, getAccessState } from '@/lib/access/entitlements'
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

  const accessState = await getAccessState(supabase, user)

  // Fetch dashboard sections via API routes
  let backgrounds: Background[] = []
  let activities: ActivityResponse[] = []
  try {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const requestHeaders = { Cookie: headersList.get('cookie') || '' }

    const [backgroundsResponse, activitiesResponse] = await Promise.all([
      fetch(`${protocol}://${host}/api/backgrounds`, {
        cache: 'no-store',
        headers: requestHeaders,
      }),
      fetch(`${protocol}://${host}/api/activities`, {
        cache: 'no-store',
        headers: requestHeaders,
      }),
    ])

    if (backgroundsResponse.ok) {
      backgrounds = await backgroundsResponse.json()
    }

    if (activitiesResponse.ok) {
      activities = await activitiesResponse.json()
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
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
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                {accessStateLabel(accessState)}
              </span>
              <Link href="/billing" className="underline-offset-2 hover:underline">
                Billing
              </Link>
            </div>
          </div>
          <LogoutButton />
        </div>

        {/* Global Item Search */}
        <div className="mb-10">
          <GlobalItemSearch />
        </div>

        {/* Background Templates Section */}
        <TemplatesSection templates={LOCAL_TEMPLATES} />

        {/* Recent Backgrounds Section */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Backgrounds
            </h2>
            <UploadCustomBackgroundButton />
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

        {/* Activity Feed */}
        <div className="mb-8">
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  )
}
