import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPortalSession } from '@/lib/stripe/server'

function siteUrlFromRequest(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return configured.replace(/\/$/, '')
  }
  return new URL(request.url).origin
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: customer, error: customerError } = await supabase
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 })
    }

    if (!customer?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Start a subscription first.' },
        { status: 400 }
      )
    }

    const baseUrl = siteUrlFromRequest(request)
    const portal = await createPortalSession({
      customerId: customer.stripe_customer_id,
      returnUrl: `${baseUrl}/billing`,
    })

    return NextResponse.json({ url: portal.url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to open billing portal.' },
      { status: 500 }
    )
  }
}
