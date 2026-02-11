begin;

create or replace function public.get_access_state(
  p_user_id uuid,
  p_email text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_subscription_status text;
  v_subscription_period_end timestamptz;
begin
  -- Keep p_email for backward compatibility but never trust caller-provided email.
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
security invoker
set search_path = public
as $$
declare
  v_state text;
begin
  -- Keep p_email for backward compatibility but never trust caller-provided email.
  v_state := public.get_access_state(p_user_id, null);
  return v_state in ('beta_access', 'active_subscription');
end;
$$;

create or replace view public.app_access
with (security_invoker = true) as
select
  auth.uid() as user_id,
  public.get_access_state(auth.uid(), null) as access_state;

comment on function public.get_access_state(uuid, text)
  is 'Returns access state for auth.uid(); second parameter is deprecated and ignored.';
comment on function public.has_app_access(uuid, text)
  is 'Returns app entitlement decision; second parameter is deprecated and ignored.';

grant select on public.app_access to authenticated;
grant execute on function public.get_access_state(uuid, text) to authenticated;
grant execute on function public.has_app_access(uuid, text) to authenticated;

commit;
