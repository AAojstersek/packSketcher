import Link from 'next/link'
import { SubscribeActions } from './SubscribeActions'

export default function SubscribePage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Choose your plan</h1>
        <p className="mt-2 text-sm text-slate-600">
          Start with a 14-day free trial. Cancel anytime before trial ends.
        </p>

        <div className="mt-6">
          <SubscribeActions />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/billing" className="text-slate-700 underline-offset-2 hover:underline">
            Manage billing
          </Link>
          <Link href="/dashboard" className="text-slate-700 underline-offset-2 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
