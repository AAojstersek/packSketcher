-- 14-day trial staging smoke checks.
-- Replace placeholders before running.

-- 1) Latest subscription row for test user.
select
  status,
  stripe_subscription_id,
  current_period_start,
  current_period_end,
  updated_at
from public.billing_subscriptions
where user_id = '<USER_ID>'
order by updated_at desc
limit 1;

-- Expected for first-time subscriber checkout:
-- status = 'trialing'

-- 2) Recent webhook processing records.
select
  event_type,
  processed_at,
  created_at
from public.billing_events
order by created_at desc
limit 20;

-- Expected:
-- relevant billing events exist and processed_at is not null.

-- 3) Optional: verify user has no old subscription rows before first-time smoke.
select
  id,
  status,
  updated_at
from public.billing_subscriptions
where user_id = '<USER_ID>'
order by updated_at desc;
