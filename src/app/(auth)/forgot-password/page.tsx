'use client'

import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabase/browser'

const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Email is required')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for the reset link.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full space-y-8 p-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div>
          <h2 className="text-center text-xl font-semibold text-slate-900">
            Forgot your password?
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Enter your email to receive a reset link.
          </p>
        </div>
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-900">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 focus:outline-none"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-center text-red-600" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-center text-green-700" role="status">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center rounded-lg border border-transparent bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="text-center">
          <a href="/login" className="text-sm text-slate-600 hover:text-slate-900">
            Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
