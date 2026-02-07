begin;

create extension if not exists pgcrypto;

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(stripe_customer_id) <> '')
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid'
    )
  )
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id);

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (stripe_customer_id);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (btrim(stripe_event_id) <> '')
);

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  invited_by uuid references auth.users(id) on delete set null,
  token text not null unique,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email_normalized = lower(btrim(email_normalized))),
  check (position('@' in email_normalized) > 1),
  check (btrim(token) <> '')
);

create index if not exists beta_invites_email_idx
  on public.beta_invites (email_normalized);

create unique index if not exists beta_invites_email_unique_idx
  on public.beta_invites (email_normalized);

create table if not exists public.beta_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  source text not null default 'invite',
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists billing_customers_touch_updated_at on public.billing_customers;
create trigger billing_customers_touch_updated_at
before update on public.billing_customers
for each row execute function public._touch_updated_at();

drop trigger if exists billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_touch_updated_at
before update on public.billing_subscriptions
for each row execute function public._touch_updated_at();

drop trigger if exists beta_invites_touch_updated_at on public.beta_invites;
create trigger beta_invites_touch_updated_at
before update on public.beta_invites
for each row execute function public._touch_updated_at();

drop trigger if exists beta_memberships_touch_updated_at on public.beta_memberships;
create trigger beta_memberships_touch_updated_at
before update on public.beta_memberships
for each row execute function public._touch_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.beta_invites enable row level security;
alter table public.beta_memberships enable row level security;

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own
on public.billing_customers
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists billing_customers_insert_own on public.billing_customers;
create policy billing_customers_insert_own
on public.billing_customers
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists billing_customers_update_own on public.billing_customers;
create policy billing_customers_update_own
on public.billing_customers
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists beta_memberships_select_own on public.beta_memberships;
create policy beta_memberships_select_own
on public.beta_memberships
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists beta_invites_select_matching_email on public.beta_invites;
create policy beta_invites_select_matching_email
on public.beta_invites
for select to authenticated
using (
  email_normalized = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create or replace function public.get_access_state(
  p_user_id uuid,
  p_email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, auth.jwt() ->> 'email', '')));
  v_subscription_status text;
  v_subscription_period_end timestamptz;
begin
  if auth.uid() is null then
    return 'no_access';
  end if;

  if p_user_id is null or auth.uid() <> p_user_id then
    return 'no_access';
  end if;

  if exists (
    select 1
    from public.beta_memberships bm
    where bm.user_id = p_user_id
      and bm.is_active = true
      and (bm.expires_at is null or bm.expires_at > now())
  ) then
    return 'beta_access';
  end if;

  if v_email <> '' and exists (
    select 1
    from public.beta_invites bi
    where bi.email_normalized = v_email
      and (bi.expires_at is null or bi.expires_at > now())
  ) then
    return 'beta_access';
  end if;

  select bs.status, bs.current_period_end
    into v_subscription_status, v_subscription_period_end
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
  order by bs.current_period_end desc nulls last, bs.updated_at desc
  limit 1;

  if v_subscription_status is null then
    return 'no_access';
  end if;

  if v_subscription_status in ('active', 'trialing')
    and (v_subscription_period_end is null or v_subscription_period_end > now()) then
    return 'active_subscription';
  end if;

  if v_subscription_status in ('past_due', 'unpaid', 'incomplete', 'incomplete_expired') then
    return 'past_due';
  end if;

  if v_subscription_status = 'canceled' then
    return 'canceled';
  end if;

  return 'no_access';
end;
$$;

create or replace function public.has_app_access(
  p_user_id uuid,
  p_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  v_state := public.get_access_state(p_user_id, p_email);
  return v_state in ('beta_access', 'active_subscription');
end;
$$;

create or replace view public.app_access as
select
  auth.uid() as user_id,
  public.get_access_state(auth.uid(), auth.jwt() ->> 'email') as access_state;

grant select, insert, update on public.billing_customers to authenticated;
grant select on public.billing_subscriptions to authenticated;
grant select on public.beta_invites to authenticated;
grant select on public.beta_memberships to authenticated;
grant select on public.app_access to authenticated;
grant execute on function public.get_access_state(uuid, text) to authenticated;
grant execute on function public.has_app_access(uuid, text) to authenticated;

commit;
