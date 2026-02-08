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
import Image from 'next/image'
import Link from 'next/link'

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
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-6 lg:px-8">
        <div className="space-y-3 sm:space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-300 bg-slate-200 p-3 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3 text-slate-900">
                  <Image
                    src="/logo/PSlogoBlack.svg"
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0 sm:h-9 sm:w-9"
                  />
                  <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">PackSketcher</h1>
                </div>
              </div>
              <LogoutButton />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 sm:mt-4">
              <span className="rounded-full border border-slate-300 bg-white/80 px-3 py-1 font-medium text-slate-700">
                {accessStateLabel(accessState)}
              </span>
              <Link
                href="/billing"
                className="rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white"
              >
                Billing
              </Link>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-12">
            {/* Global Item Search */}
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 lg:col-span-5">
              <GlobalItemSearch />
            </section>

            {/* Background Templates Section */}
            <TemplatesSection templates={LOCAL_TEMPLATES} className="lg:col-span-7" />
          </div>

          {/* Recent Backgrounds Section */}
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 sm:text-base">My Background</h2>
                <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">Continue where you left off.</p>
              </div>
              <UploadCustomBackgroundButton className="w-full justify-center text-xs sm:w-auto sm:text-sm" />
            </div>
            {backgrounds && backgrounds.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                {backgrounds.map((bg: Background) => (
                  <BackgroundCard key={bg.id} bg={bg} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-slate-500">
                  No saved backgrounds yet. Use a template above to get started.
                </p>
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  )
}
