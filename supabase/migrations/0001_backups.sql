-- Versioned full-snapshot backups of the VIS app, one row per upload.
create table public.backups (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  workouts integer not null default 0,
  data jsonb not null
);

create index backups_user_created_idx on public.backups (user_id, created_at desc);

alter table public.backups enable row level security;

create policy "own backups: read" on public.backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own backups: insert" on public.backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own backups: delete" on public.backups
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Keep only the latest 30 backups per user.
create or replace function public.prune_backups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.backups
  where user_id = new.user_id
    and id not in (
      select id from public.backups
      where user_id = new.user_id
      order by created_at desc
      limit 30
    );
  return null;
end;
$$;

revoke execute on function public.prune_backups() from public, anon, authenticated;

create trigger backups_prune
  after insert on public.backups
  for each row execute function public.prune_backups();
