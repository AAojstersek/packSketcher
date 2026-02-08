'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/browser'

export function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      router.replace('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-sm"
    >
      {loading ? 'Signing out…' : 'Logout'}
    </button>
  )
}
