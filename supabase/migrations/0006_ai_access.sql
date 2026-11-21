-- Allow-list for the KI-Coach edge function: sign-ups are open, so only listed
-- accounts may spend the Anthropic API key. Rows are added by the owner via SQL.
create table public.ai_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ai_access enable row level security;
create policy "see own access" on public.ai_access
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.ai_access to authenticated;
revoke all on public.ai_access from anon;
