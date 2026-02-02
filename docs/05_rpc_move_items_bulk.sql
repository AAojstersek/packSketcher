begin;

create or replace function public.move_items_bulk(
  p_item_ids uuid[],
  p_target_bag_id uuid,
  p_name_overrides jsonb default '{}'::jsonb
)
returns table (
  moved_count integer,
  conflicts jsonb,
  undo jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_target_box_name text;
  v_target_workspace_name text;
  v_source_box_name text;
  v_source_workspace_name text;
  v_source_count int;
  v_item_count int;
  v_names text[];
  v_list text;
  v_more int;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null or array_length(p_item_ids, 1) = 0 then
    moved_count := 0;
    conflicts := '[]'::jsonb;
    undo := '[]'::jsonb;
    return;
  end if;

  select b.name, bg.name
    into v_target_box_name, v_target_workspace_name
  from public.bags b
  join public.packs p on p.id = b.pack_id
  join public.backgrounds bg on bg.id = p.background_id
  where b.id = p_target_bag_id
    and b.user_id = v_user_id;

  if not found then
    raise exception 'Target box not found';
  end if;

  create temporary table tmp_move on commit drop as
  select
    i.id,
    i.bag_id as from_bag_id,
    i.name as from_name,
    btrim(coalesce(p_name_overrides ->> i.id::text, i.name)) as final_name,
    lower(btrim(coalesce(p_name_overrides ->> i.id::text, i.name))) as norm_name
  from public.items i
  where i.id = any(p_item_ids)
    and i.user_id = v_user_id;

  select count(*) into v_item_count from tmp_move;
  if v_item_count <> array_length(p_item_ids, 1) then
    raise exception 'One or more items not found';
  end if;

  if exists (select 1 from tmp_move where final_name = '' or length(final_name) > 60) then
    raise exception 'Invalid item name';
  end if;

  if exists (
    select 1 from (select norm_name from tmp_move group by norm_name having count(*) > 1) s
  ) then
    moved_count := 0;
    conflicts := (
      select jsonb_agg(
        jsonb_build_object('item_id', t.id, 'name', t.final_name, 'reason', 'duplicate_in_selection')
        order by t.final_name
      )
      from tmp_move t
      where t.norm_name in (select norm_name from tmp_move group by norm_name having count(*) > 1)
    );
    undo := '[]'::jsonb;
    return;
  end if;

  if exists (
    select 1
    from tmp_move m
    join public.items existing
      on existing.bag_id = p_target_bag_id
     and lower(existing.name) = m.norm_name
     and existing.id <> m.id
  ) then
    moved_count := 0;
    conflicts := (
      select jsonb_agg(
        jsonb_build_object('item_id', m.id, 'name', m.final_name, 'reason', 'name_conflict')
        order by m.final_name
      )
      from tmp_move m
      where exists (
        select 1
        from public.items existing
        where existing.bag_id = p_target_bag_id
          and lower(existing.name) = m.norm_name
          and existing.id <> m.id
      )
    );
    undo := '[]'::jsonb;
    return;
  end if;

  undo := (
    select jsonb_agg(
      jsonb_build_object('id', id, 'from_bag_id', from_bag_id, 'from_name', from_name)
      order by from_name
    )
    from tmp_move
  );

  select count(distinct from_bag_id) into v_source_count from tmp_move;

  if v_source_count = 1 then
    select b.name, bg.name
      into v_source_box_name, v_source_workspace_name
    from public.bags b
    join public.packs p on p.id = b.pack_id
    join public.backgrounds bg on bg.id = p.background_id
    where b.id = (select from_bag_id from tmp_move limit 1);
  else
    v_source_box_name := 'multiple boxes';
    v_source_workspace_name := 'multiple workspaces';
  end if;

  update public.items i
  set
    bag_id = p_target_bag_id,
    name = m.final_name,
    updated_at = v_now,
    last_moved_at = v_now
  from tmp_move m
  where i.id = m.id
    and i.user_id = v_user_id;

  get diagnostics moved_count = row_count;
  conflicts := null;

  select array_agg(final_name order by final_name) into v_names from tmp_move;

  if array_length(v_names, 1) <= 3 then
    v_list := array_to_string(v_names, ', ');
  else
    v_more := array_length(v_names, 1) - 3;
    v_list := array_to_string(v_names[1:3], ', ') || ' +' || v_more::text || ' more';
  end if;

  v_message :=
    'Moved items: ' || v_list ||
    ' from box ' || v_source_box_name || ' (' || v_source_workspace_name || ')' ||
    ' to box ' || v_target_box_name || ' (' || v_target_workspace_name || ')';

  insert into public.activities(user_id, event_type, message)
  values (v_user_id, 'item_moved', v_message);

  return;
end;
$$;

revoke all on function public.move_items_bulk(uuid[], uuid, jsonb) from public;
grant execute on function public.move_items_bulk(uuid[], uuid, jsonb) to authenticated;

create or replace function public.undo_move_items_bulk(
  p_undo jsonb
)
returns table (
  moved_count integer,
  conflicts jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_cnt int;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_undo is null or jsonb_typeof(p_undo) <> 'array' then
    moved_count := 0;
    conflicts := '[]'::jsonb;
    return;
  end if;

  create temporary table tmp_undo on commit drop as
  select
    (x->>'id')::uuid as id,
    (x->>'from_bag_id')::uuid as from_bag_id,
    btrim(x->>'from_name') as from_name,
    lower(btrim(x->>'from_name')) as norm_name
  from jsonb_array_elements(p_undo) x;

  select count(*) into v_cnt from tmp_undo;
  if v_cnt = 0 then
    moved_count := 0;
    conflicts := '[]'::jsonb;
    return;
  end if;

  if exists (select 1 from tmp_undo where from_name = '' or length(from_name) > 60) then
    raise exception 'Invalid item name';
  end if;

  if exists (
    select 1
    from tmp_undo u
    left join public.items i on i.id = u.id and i.user_id = v_user_id
    where i.id is null
  ) then
    raise exception 'One or more items not found';
  end if;

  if exists (
    select 1
    from tmp_undo u
    left join public.bags b on b.id = u.from_bag_id and b.user_id = v_user_id
    where b.id is null
  ) then
    raise exception 'One or more target boxes not found';
  end if;

  if exists (
    select 1
    from tmp_undo u
    join public.items existing
      on existing.bag_id = u.from_bag_id
     and lower(existing.name) = u.norm_name
     and existing.id <> u.id
  ) then
    moved_count := 0;
    conflicts := (
      select jsonb_agg(
        jsonb_build_object('item_id', u.id, 'name', u.from_name, 'reason', 'name_conflict')
        order by u.from_name
      )
      from tmp_undo u
      where exists (
        select 1
        from public.items existing
        where existing.bag_id = u.from_bag_id
          and lower(existing.name) = u.norm_name
          and existing.id <> u.id
      )
    );
    return;
  end if;

  update public.items i
  set
    bag_id = u.from_bag_id,
    name = u.from_name,
    updated_at = v_now,
    last_moved_at = v_now
  from tmp_undo u
  where i.id = u.id
    and i.user_id = v_user_id;

  get diagnostics moved_count = row_count;
  conflicts := null;
  return;
end;
$$;

revoke all on function public.undo_move_items_bulk(jsonb) from public;
grant execute on function public.undo_move_items_bulk(jsonb) to authenticated;

commit;

