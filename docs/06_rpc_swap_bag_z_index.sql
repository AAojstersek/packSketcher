begin;

create or replace function public.swap_bag_z_index(
  p_bag_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pack_id uuid;
  v_curr_z int;
  v_neighbor_id uuid;
  v_neighbor_z int;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select pack_id, z_index
    into v_pack_id, v_curr_z
  from public.bags
  where id = p_bag_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Box not found';
  end if;

  if p_direction = 'forward' then
    select id, z_index into v_neighbor_id, v_neighbor_z
    from public.bags
    where pack_id = v_pack_id
      and z_index = v_curr_z + 1
    for update;
  elsif p_direction = 'backward' then
    select id, z_index into v_neighbor_id, v_neighbor_z
    from public.bags
    where pack_id = v_pack_id
      and z_index = v_curr_z - 1
    for update;
  else
    raise exception 'Invalid direction';
  end if;

  if v_neighbor_id is null then
    return false;
  end if;

  update public.bags
  set z_index = case
    when id = p_bag_id then v_neighbor_z
    when id = v_neighbor_id then v_curr_z
    else z_index
  end
  where id in (p_bag_id, v_neighbor_id);

  return true;
end;
$$;

revoke all on function public.swap_bag_z_index(uuid, text) from public;
grant execute on function public.swap_bag_z_index(uuid, text) to authenticated;

commit;

