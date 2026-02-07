import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessStateLabel, getAccessState } from '@/lib/access/entitlements'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ManageBillingButton } from './ManageBillingButton'

interface BillingSubscriptionSummary {
  status: string
  cancel_at_period_end: boolean
  current_period_end: string | null
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not set'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const accessState = await getAccessState(supabase, user)
  const { data: latestSubscription } = await supabase
    .from('billing_subscriptions')
    .select('status, cancel_at_period_end, current_period_end')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const subscription = (latestSubscription ?? null) as BillingSubscriptionSummary | null

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Access status: <span className="font-medium text-slate-900">{accessStateLabel(accessState)}</span>
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            Subscription status:{' '}
            <span className="font-medium text-slate-900">
              {subscription?.status ?? 'No subscription yet'}
            </span>
          </p>
          <p className="mt-1">
            Current period end:{' '}
            <span className="font-medium text-slate-900">
              {formatDate(subscription?.current_period_end ?? null)}
            </span>
          </p>
          <p className="mt-1">
            Cancel at period end:{' '}
            <span className="font-medium text-slate-900">
              {subscription?.cancel_at_period_end ? 'Yes' : 'No'}
            </span>
          </p>
        </div>

        <div className="mt-6">
          <ManageBillingButton />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/subscribe" className="text-slate-700 underline-offset-2 hover:underline">
            View plans
          </Link>
          <Link href="/dashboard" className="text-slate-700 underline-offset-2 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
