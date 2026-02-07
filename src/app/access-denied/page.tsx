import Link from 'next/link'

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Access required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not currently have an active subscription or beta access.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/subscribe"
            className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
          >
            View subscription plans
          </Link>
          <Link
            href="/billing"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Open billing
          </Link>
        </div>
      </div>
    </div>
  )
}
