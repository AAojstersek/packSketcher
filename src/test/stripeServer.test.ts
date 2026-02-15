import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCheckoutSession } from '@/lib/stripe/server'

const originalFetch = global.fetch

function mockStripeSuccessResponse() {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/session',
      customer: 'cus_123',
      subscription: 'sub_123',
      mode: 'subscription',
      client_reference_id: 'user-1',
    }),
  }
}

describe('createCheckoutSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('includes trial_period_days when trialDays is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStripeSuccessResponse())
    global.fetch = fetchMock as unknown as typeof fetch

    await createCheckoutSession({
      customerId: 'cus_123',
      priceId: 'price_123',
      successUrl: 'https://packsketcher.example/billing?checkout=success',
      cancelUrl: 'https://packsketcher.example/subscribe?checkout=cancel',
      userId: 'user-1',
      trialDays: 14,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const options = fetchMock.mock.calls[0]?.[1] as { body?: string }
    const body = options.body ?? ''
    expect(body).toContain('subscription_data%5Btrial_period_days%5D=14')
  })

  it('does not include trial_period_days when trialDays is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStripeSuccessResponse())
    global.fetch = fetchMock as unknown as typeof fetch

    await createCheckoutSession({
      customerId: 'cus_123',
      priceId: 'price_123',
      successUrl: 'https://packsketcher.example/billing?checkout=success',
      cancelUrl: 'https://packsketcher.example/subscribe?checkout=cancel',
      userId: 'user-1',
      trialDays: null,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const options = fetchMock.mock.calls[0]?.[1] as { body?: string }
    const body = options.body ?? ''
    expect(body).not.toContain('subscription_data%5Btrial_period_days%5D=')
  })
})
