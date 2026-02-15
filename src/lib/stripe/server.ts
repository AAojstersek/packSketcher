import crypto from 'node:crypto'

export interface StripeCustomer {
  id: string
  email: string | null
}

export interface StripeCheckoutSession {
  id: string
  url: string | null
  customer: string | null
  subscription: string | null
  mode: string | null
  client_reference_id: string | null
}

export interface StripePortalSession {
  id: string
  url: string
}

export interface StripeSubscription {
  id: string
  customer: string | null
  status: string
  cancel_at_period_end: boolean
  current_period_start: number | null
  current_period_end: number | null
  canceled_at: number | null
  items?: {
    data?: Array<{
      price?: {
        id?: string | null
      }
    }>
  }
}

export interface StripeEvent<T = unknown> {
  id: string
  type: string
  data: {
    object: T
  }
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const WEBHOOK_TOLERANCE_SECONDS = 300

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.')
  }
  return key
}

export function getStripePriceId(interval: 'monthly' | 'yearly'): string {
  const key = interval === 'monthly'
    ? process.env.STRIPE_PRICE_MONTHLY
    : process.env.STRIPE_PRICE_YEARLY

  if (!key) {
    throw new Error(`Missing Stripe price ID for interval: ${interval}`)
  }

  return key
}

async function stripeRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST'
    formBody?: URLSearchParams
  } = {}
): Promise<T> {
  const secretKey = getStripeSecretKey()
  const { method = 'POST', formBody } = options

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(formBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: formBody?.toString(),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: { message?: string } }).error?.message ?? 'Stripe request failed')
      : 'Stripe request failed'
    throw new Error(message)
  }

  return payload as T
}

export async function createStripeCustomer(params: {
  email: string
  userId: string
}): Promise<StripeCustomer> {
  const form = new URLSearchParams()
  form.set('email', params.email)
  form.set('metadata[supabase_user_id]', params.userId)
  return stripeRequest<StripeCustomer>('/customers', { method: 'POST', formBody: form })
}

export async function createCheckoutSession(params: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  userId: string
  trialDays?: number | null
}): Promise<StripeCheckoutSession> {
  const form = new URLSearchParams()
  form.set('mode', 'subscription')
  form.set('customer', params.customerId)
  form.set('line_items[0][price]', params.priceId)
  form.set('line_items[0][quantity]', '1')
  form.set('success_url', params.successUrl)
  form.set('cancel_url', params.cancelUrl)
  form.set('allow_promotion_codes', 'true')
  form.set('client_reference_id', params.userId)
  form.set('subscription_data[metadata][supabase_user_id]', params.userId)
  if (
    typeof params.trialDays === 'number' &&
    Number.isInteger(params.trialDays) &&
    params.trialDays > 0
  ) {
    form.set('subscription_data[trial_period_days]', String(params.trialDays))
  }
  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', { method: 'POST', formBody: form })
}

export async function createPortalSession(params: {
  customerId: string
  returnUrl: string
}): Promise<StripePortalSession> {
  const form = new URLSearchParams()
  form.set('customer', params.customerId)
  form.set('return_url', params.returnUrl)
  return stripeRequest<StripePortalSession>('/billing_portal/sessions', { method: 'POST', formBody: form })
}

export async function fetchStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(`/subscriptions/${subscriptionId}`, { method: 'GET' })
}

export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signatureHeader) {
    return false
  }

  const parts = signatureHeader.split(',').map((segment) => segment.trim())
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))

  if (!timestampPart || signatures.length === 0) {
    return false
  }

  const timestamp = Number(timestampPart.slice(2))
  if (!Number.isFinite(timestamp)) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  return signatures.some((candidate) => {
    try {
      const candidateBuffer = Buffer.from(candidate, 'hex')
      return candidateBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    } catch {
      return false
    }
  })
}
