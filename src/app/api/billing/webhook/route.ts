import { NextResponse } from 'next/server'
import type { SubscriptionStatus } from '@/types'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  fetchStripeSubscription,
  type StripeEvent,
  type StripeSubscription,
  verifyStripeWebhookSignature,
} from '@/lib/stripe/server'

export const runtime = 'nodejs'

type StripeCheckoutCompleted = {
  customer?: string | { id?: string } | null
  subscription?: string | { id?: string } | null
  client_reference_id?: string | null
  mode?: string | null
}

type StripeInvoicePaymentFailed = {
  customer?: string | { id?: string } | null
  subscription?: string | { id?: string } | null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function nestedId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.trim() !== '' ? id : null
  }
  return null
}

function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case 'incomplete':
    case 'incomplete_expired':
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
      return status
    default:
      return 'incomplete'
  }
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (!Number.isFinite(seconds)) {
    return null
  }
  return new Date(Number(seconds) * 1000).toISOString()
}

function extractPriceId(subscription: StripeSubscription): string | null {
  const firstItem = subscription.items?.data?.[0]
  const id = firstItem?.price?.id
  return typeof id === 'string' && id.trim() !== '' ? id : null
}

async function findUserIdByStripeCustomer(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  stripeCustomerId: string
) {
  const { data, error } = await supabaseAdmin
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return typeof data?.user_id === 'string' ? data.user_id : null
}

async function upsertCustomerMapping(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  stripeCustomerId: string
) {
  const { error } = await supabaseAdmin
    .from('billing_customers')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    throw new Error(error.message)
  }
}

async function upsertSubscriptionRecord(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  params: {
    userId: string
    stripeCustomerId: string
    subscription: StripeSubscription
    rawPayload: unknown
  }
) {
  const { userId, stripeCustomerId, subscription, rawPayload } = params
  const { error } = await supabaseAdmin
    .from('billing_subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: extractPriceId(subscription),
        status: mapStripeStatus(subscription.status),
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        current_period_start: unixToIso(subscription.current_period_start),
        current_period_end: unixToIso(subscription.current_period_end),
        canceled_at: unixToIso(subscription.canceled_at),
        raw: rawPayload ?? {},
      },
      { onConflict: 'stripe_subscription_id' }
    )

  if (error) {
    throw new Error(error.message)
  }
}

async function syncSubscriptionById(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  subscriptionId: string,
  fallbackUserId: string | null = null,
  fallbackCustomerId: string | null = null
) {
  const subscription = await fetchStripeSubscription(subscriptionId)
  const customerId = nestedId(subscription.customer)
  if (!customerId) {
    return
  }

  let userId = await findUserIdByStripeCustomer(supabaseAdmin, customerId)
  if (!userId && fallbackUserId) {
    await upsertCustomerMapping(supabaseAdmin, fallbackUserId, customerId)
    userId = fallbackUserId
  }
  if (!userId && fallbackCustomerId) {
    userId = await findUserIdByStripeCustomer(supabaseAdmin, fallbackCustomerId)
  }
  if (!userId) {
    return
  }

  await upsertSubscriptionRecord(supabaseAdmin, {
    userId,
    stripeCustomerId: customerId,
    subscription,
    rawPayload: subscription,
  })
}

async function handleWebhookEvent(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  event: StripeEvent
) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutCompleted
      if (session.mode !== 'subscription') {
        return
      }

      const userId = asString(session.client_reference_id)
      const customerId = nestedId(session.customer)
      if (userId && customerId) {
        await upsertCustomerMapping(supabaseAdmin, userId, customerId)
      }

      const subscriptionId = nestedId(session.subscription)
      if (subscriptionId) {
        await syncSubscriptionById(supabaseAdmin, subscriptionId, userId, customerId)
      }
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscription
      const customerId = nestedId(subscription.customer)
      if (!customerId) {
        return
      }
      const userId = await findUserIdByStripeCustomer(supabaseAdmin, customerId)
      if (!userId) {
        return
      }
      await upsertSubscriptionRecord(supabaseAdmin, {
        userId,
        stripeCustomerId: customerId,
        subscription,
        rawPayload: event.data.object,
      })
      return
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoicePaymentFailed
      const subscriptionId = nestedId(invoice.subscription)
      const customerId = nestedId(invoice.customer)
      if (!subscriptionId) {
        return
      }
      await syncSubscriptionById(supabaseAdmin, subscriptionId, null, customerId)
      return
    }

    default:
      return
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('stripe-signature')

  if (!verifyStripeWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })
  }

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody) as StripeEvent
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient()

    const { error: insertEventError } = await supabaseAdmin
      .from('billing_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      })

    if (insertEventError) {
      // Duplicate event replay; return success for idempotency.
      if (insertEventError.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true })
      }
      throw new Error(insertEventError.message)
    }

    await handleWebhookEvent(supabaseAdmin, event)

    const { error: updateError } = await supabaseAdmin
      .from('billing_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process webhook.' },
      { status: 500 }
    )
  }
}
