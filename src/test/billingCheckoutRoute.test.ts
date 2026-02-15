import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/billing/checkout/route'

const {
  createSupabaseServerClientMock,
  createCheckoutSessionMock,
  createStripeCustomerMock,
  getStripePriceIdMock,
} = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
  createStripeCustomerMock: vi.fn(),
  getStripePriceIdMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/stripe/server', () => ({
  createCheckoutSession: createCheckoutSessionMock,
  createStripeCustomer: createStripeCustomerMock,
  getStripePriceId: getStripePriceIdMock,
}))

interface SupabaseMockOptions {
  existingStripeCustomerId?: string | null
  existingSubscriptionId?: string | null
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const existingStripeCustomerId = options.existingStripeCustomerId ?? 'cus_existing'
  const existingSubscriptionId = options.existingSubscriptionId ?? null

  const customersMaybeSingleMock = vi.fn().mockResolvedValue({
    data: existingStripeCustomerId ? { stripe_customer_id: existingStripeCustomerId } : null,
    error: null,
  })
  const customersUpsertMock = vi.fn().mockResolvedValue({ error: null })
  const subscriptionsMaybeSingleMock = vi.fn().mockResolvedValue({
    data: existingSubscriptionId ? { id: existingSubscriptionId } : null,
    error: null,
  })

  const fromMock = vi.fn((table: string) => {
    if (table === 'billing_customers') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: customersMaybeSingleMock,
          })),
        })),
        upsert: customersUpsertMock,
      }
    }

    if (table === 'billing_subscriptions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: subscriptionsMaybeSingleMock,
            })),
          })),
        })),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
          error: null,
        }),
      },
      from: fromMock,
    },
    fromMock,
    customersMaybeSingleMock,
    customersUpsertMock,
    subscriptionsMaybeSingleMock,
  }
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://packsketcher.example'
    delete process.env.STRIPE_TRIAL_DAYS
    getStripePriceIdMock.mockReturnValue('price_monthly')
    createStripeCustomerMock.mockResolvedValue({ id: 'cus_new', email: 'user@example.com' })
    createCheckoutSessionMock.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/c/session',
      customer: 'cus_existing',
      subscription: 'sub_123',
      mode: 'subscription',
      client_reference_id: 'user-1',
    })
  })

  it('applies default 14-day trial for users without previous subscriptions', async () => {
    const { supabase } = createSupabaseMock({ existingSubscriptionId: null })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const request = new Request('https://packsketcher.example/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: 'monthly' }),
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ url: 'https://checkout.stripe.com/c/session' })
    expect(createCheckoutSessionMock).toHaveBeenCalledWith({
      customerId: 'cus_existing',
      priceId: 'price_monthly',
      successUrl: 'https://packsketcher.example/billing?checkout=success',
      cancelUrl: 'https://packsketcher.example/subscribe?checkout=cancel',
      userId: 'user-1',
      trialDays: 14,
    })
  })

  it('disables trial when user already has a subscription record', async () => {
    const { supabase } = createSupabaseMock({ existingSubscriptionId: 'row_sub_1' })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const request = new Request('https://packsketcher.example/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval: 'yearly' }),
    })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trialDays: null,
      })
    )
  })

  it.each(['0', '-1', 'abc'])(
    'disables trial when STRIPE_TRIAL_DAYS is %s',
    async (value) => {
      process.env.STRIPE_TRIAL_DAYS = value
      const { supabase, fromMock } = createSupabaseMock({ existingSubscriptionId: null })
      createSupabaseServerClientMock.mockResolvedValue(supabase)

      const request = new Request('https://packsketcher.example/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: 'monthly' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(createCheckoutSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          trialDays: null,
        })
      )
      // Trial disabled in config should skip subscription-history check.
      expect(fromMock).not.toHaveBeenCalledWith('billing_subscriptions')
    }
  )
})
