import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LogoutButton } from './LogoutButton'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // This should be handled by middleware, but just in case
    return <div>Please log in</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Dashboard
          </h1>
          <p className="text-gray-600 mb-6">
            Logged in as: <span className="font-medium">{user.email}</span>
          </p>
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}