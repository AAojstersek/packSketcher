import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  createCheckoutSession,
  createStripeCustomer,
  getStripePriceId,
} from '@/lib/stripe/server'

interface CheckoutRequestBody {
  interval?: 'monthly' | 'yearly'
}

function siteUrlFromRequest(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return configured.replace(/\/$/, '')
  }
  return new URL(request.url).origin
}

async function ensureStripeCustomerId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: { id: string; email?: string | null }
) {
  const { data: existing, error: readError } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (readError) {
    throw new Error(readError.message)
  }

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id
  }

  if (!user.email) {
    throw new Error('Authenticated user is missing an email.')
  }

  const customer = await createStripeCustomer({
    email: user.email,
    userId: user.id,
  })

  const { error: upsertError } = await supabase
    .from('billing_customers')
    .upsert(
      {
        user_id: user.id,
        stripe_customer_id: customer.id,
      },
      {
        onConflict: 'user_id',
      }
    )

  if (upsertError) {
    throw new Error(upsertError.message)
  }

  return customer.id
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as CheckoutRequestBody
    const interval = body.interval === 'yearly' ? 'yearly' : 'monthly'
    const priceId = getStripePriceId(interval)

    const stripeCustomerId = await ensureStripeCustomerId(supabase, user)
    const baseUrl = siteUrlFromRequest(request)
    const session = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: `${baseUrl}/billing?checkout=success`,
      cancelUrl: `${baseUrl}/subscribe?checkout=cancel`,
      userId: user.id,
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe checkout did not return a redirect URL.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session.' },
      { status: 500 }
    )
  }
}
