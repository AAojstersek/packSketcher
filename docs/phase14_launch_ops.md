# Phase 14 Launch Ops Checklist

Last updated: 2026-02-07

## 1) Environments
- Create separate Supabase projects: `packsketcher-staging`, `packsketcher-production`.
- Create separate Vercel projects/environments: Preview (staging) and Production.
- Apply DB migrations to staging first, then production.

## 2) Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_YEARLY`
- `STRIPE_TRIAL_DAYS` (optional, default `14`; trial only for users without prior subscription record)
- `ADMIN_INVITE_TOKEN`
- Optional rollout toggles:
  - `ACCESS_CONTROL_ENABLED=true`
  - `NEXT_PUBLIC_ACCESS_CONTROL_ENABLED=true`
  - `NEXT_PUBLIC_SIGNUP_DISABLED=true`

## 3) Stripe Setup
- Create one product with two recurring prices (`monthly`, `yearly`).
- Configure webhook endpoint: `POST /api/billing/webhook`.
- Subscribe webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

## 4) Supabase Auth Setup
- Set Site URL to production domain.
- Set redirect URLs:
  - `/login`
  - `/signup`
  - `/forgot-password`
  - `/reset-password`

## 5) Beta Invite Workflow
- Call `POST /api/admin/invites` with header `x-admin-invite-token`.
- Body example:
```json
{
  "email": "friend@example.com",
  "expiresInDays": 30
}
```

## 6) Smoke Checks (Pre-Launch)
- Uninvited user cannot open `/dashboard`.
- Invited beta user can open `/dashboard`.
- Checkout creates Stripe session and redirects.
- Billing portal opens for subscribed user.
- Stripe webhook writes `billing_events` and updates subscription state.

## 7) Operations
- Enable Supabase backups and verify restore path.
- Monitor:
  - webhook 4xx/5xx rates
  - failed payment transitions (`past_due`)
  - auth/login error spikes
- Add legal pages before paid launch:
  - Terms
  - Privacy
  - Refund policy

## 8) 14-Day Trial Staging Smoke Flow
Goal: confirm first-time subscribers get `billing_subscriptions.status = trialing`.

### 8.1 Staging env
- In Vercel staging environment, set `STRIPE_TRIAL_DAYS=14`.
- Verify these are also set and correct for staging:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_MONTHLY`
  - `STRIPE_PRICE_YEARLY`
  - `NEXT_PUBLIC_SITE_URL`
- Redeploy staging after env changes.

### 8.2 Stripe test mode
- Verify `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` point to test-mode recurring prices.
- Verify webhook endpoint is `https://<staging-domain>/api/billing/webhook`.
- Verify webhook event list includes:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Verify webhook signing secret matches `STRIPE_WEBHOOK_SECRET` in staging env.

### 8.3 Checkout smoke
- Use a new test user with no prior `billing_subscriptions` row.
- Login to staging app, open `/subscribe`, choose monthly or yearly, and complete checkout.
- Wait a few seconds for webhook processing.

### 8.4 Supabase verification
- Run queries from `docs/08_trial_smoke_checks.sql`.
- Expected:
  - latest subscription row for test user has `status = 'trialing'`
  - recent webhook rows in `billing_events` have non-null `processed_at`

### 8.5 Troubleshooting
- `status = active` instead of `trialing`:
  - test user likely had prior `billing_subscriptions` row, or trial was not applied.
- no `billing_subscriptions` row:
  - webhook endpoint/signing secret mismatch, or webhook delivery failure.
- cannot access `/dashboard` after checkout:
  - verify latest `billing_subscriptions.status`, `current_period_end`, and access-control flags.
