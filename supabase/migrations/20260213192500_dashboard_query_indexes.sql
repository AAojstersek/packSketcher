create index if not exists backgrounds_user_id_created_at_idx
  on public.backgrounds (user_id, created_at desc);

create index if not exists activities_user_id_created_at_idx
  on public.activities (user_id, created_at desc);
