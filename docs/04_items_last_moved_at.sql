begin;

alter table public.items
  add column if not exists last_moved_at timestamptz;

update public.items
set last_moved_at = coalesce(last_moved_at, created_at)
where last_moved_at is null;

alter table public.items
  alter column last_moved_at set not null;

create index if not exists items_user_id_last_moved_at_idx
  on public.items (user_id, last_moved_at desc);

create or replace function public.set_items_last_moved_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.last_moved_at := coalesce(new.last_moved_at, new.created_at, now());
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.bag_id is distinct from old.bag_id then
      new.last_moved_at := now();
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists items_set_last_moved_at on public.items;

create trigger items_set_last_moved_at
before insert or update of bag_id
on public.items
for each row
execute function public.set_items_last_moved_at();

commit;

