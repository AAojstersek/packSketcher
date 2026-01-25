import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LogoutButton } from './LogoutButton'
import { TemplateGrid } from './TemplateGrid'
import type { Background } from '@/types'
import Image from 'next/image'
import { headers } from 'next/headers'

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

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Dashboard
          </h1>
          <p className="text-gray-600">
            Logged in as: <span className="font-medium">{user.email}</span>
          </p>
        </div>

        {/* Background Templates Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Background Templates
          </h2>
          <TemplateGrid templates={LOCAL_TEMPLATES} />
        </div>

        {/* Recent Backgrounds Section */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              Recent Backgrounds
            </h2>
            <button
              disabled
              className="px-4 py-2 bg-gray-300 text-gray-600 rounded-md cursor-not-allowed text-sm"
            >
              Upload Custom Background
            </button>
          </div>
          {backgrounds && backgrounds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {backgrounds.map((bg: Background) => (
                <div
                  key={bg.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden"
                >
                  {bg.image_url && (
                    <div className="relative h-48 bg-gray-100">
                      <Image
                        src={bg.image_url}
                        alt={bg.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {bg.name}
                    </h3>
                    <p className="text-sm text-gray-500 capitalize mb-1">
                      {bg.type}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(bg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-500">
                No saved backgrounds yet. Use a template above to get started.
              </p>
            </div>
          )}
        </div>

        {/* User Stats Placeholder */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Your Stats
          </h2>
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-gray-500 text-center">
              Stats will be displayed here soon.
            </p>
          </div>
        </div>

        {/* Logout */}
        <div className="flex justify-end">
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}