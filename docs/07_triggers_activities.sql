begin;

create or replace function public._activities_insert(p_event_type text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  insert into public.activities(user_id, event_type, message)
  values (v_user_id, p_event_type, p_message);
end;
$$;

create or replace function public.trg_backgrounds_log_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.name is distinct from old.name then
    perform public._activities_insert(
      'workspace_renamed',
      'Renamed workspace from ' || old.name || ' to ' || new.name
    );
  end if;

  return new;
end;
$$;

drop trigger if exists backgrounds_log_rename on public.backgrounds;
create trigger backgrounds_log_rename
after update of name on public.backgrounds
for each row
execute function public.trg_backgrounds_log_rename();

create or replace function public.trg_backgrounds_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  perform set_config('app.deleting_background', '1', true);

  perform public._activities_insert(
    'workspace_deleted',
    'Deleted workspace ' || old.name
  );

  return old;
end;
$$;

drop trigger if exists backgrounds_log_delete on public.backgrounds;
create trigger backgrounds_log_delete
before delete on public.backgrounds
for each row
execute function public.trg_backgrounds_log_delete();

create or replace function public.trg_bags_log_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_name text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select bg.name into v_workspace_name
  from public.packs p
  join public.backgrounds bg on bg.id = p.background_id
  where p.id = new.pack_id;

  perform public._activities_insert(
    'box_created',
    'Created box ' || new.name || ' in workspace ' || coalesce(v_workspace_name, '(unknown)')
  );

  return new;
end;
$$;

drop trigger if exists bags_log_create on public.bags;
create trigger bags_log_create
after insert on public.bags
for each row
execute function public.trg_bags_log_create();

create or replace function public.trg_bags_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_name text;
begin
  if auth.uid() is null then
    return old;
  end if;

  perform set_config('app.deleting_bag', '1', true);

  if coalesce(current_setting('app.deleting_background', true), '') = '1' then
    return old;
  end if;

  select bg.name into v_workspace_name
  from public.packs p
  join public.backgrounds bg on bg.id = p.background_id
  where p.id = old.pack_id;

  perform public._activities_insert(
    'box_deleted',
    'Deleted box ' || old.name || ' in workspace ' || coalesce(v_workspace_name, '(unknown)')
  );

  return old;
end;
$$;

drop trigger if exists bags_log_delete on public.bags;
create trigger bags_log_delete
before delete on public.bags
for each row
execute function public.trg_bags_log_delete();

create or replace function public.trg_items_log_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box_name text;
  v_workspace_name text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select b.name, bg.name
    into v_box_name, v_workspace_name
  from public.bags b
  join public.packs p on p.id = b.pack_id
  join public.backgrounds bg on bg.id = p.background_id
  where b.id = new.bag_id;

  perform public._activities_insert(
    'item_created',
    'Created item ' || new.name || ' in box ' || coalesce(v_box_name, '(unknown)') ||
    ' (' || coalesce(v_workspace_name, '(unknown)') || ')'
  );

  return new;
end;
$$;

drop trigger if exists items_log_create on public.items;
create trigger items_log_create
after insert on public.items
for each row
execute function public.trg_items_log_create();

create or replace function public.trg_items_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box_name text;
  v_workspace_name text;
begin
  if auth.uid() is null then
    return old;
  end if;

  if coalesce(current_setting('app.deleting_background', true), '') = '1' then
    return old;
  end if;

  if coalesce(current_setting('app.deleting_bag', true), '') = '1' then
    return old;
  end if;

  select b.name, bg.name
    into v_box_name, v_workspace_name
  from public.bags b
  join public.packs p on p.id = b.pack_id
  join public.backgrounds bg on bg.id = p.background_id
  where b.id = old.bag_id;

  perform public._activities_insert(
    'item_deleted',
    'Deleted item ' || old.name || ' from box ' || coalesce(v_box_name, '(unknown)') ||
    ' (' || coalesce(v_workspace_name, '(unknown)') || ')'
  );

  return old;
end;
$$;

drop trigger if exists items_log_delete on public.items;
create trigger items_log_delete
before delete on public.items
for each row
execute function public.trg_items_log_delete();

commit;

