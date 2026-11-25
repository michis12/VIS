-- Problems and ideas sent from the app (Settings > Feedback). Written only by the
-- `feedback` edge function (service role), which also mails them to the owner.
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('problem', 'idea')),
  message text not null check (length(message) between 1 and 4000),
  meta jsonb not null default '{}',
  mailed boolean not null default false
);
create index feedback_user_idx on public.feedback (user_id, created_at desc);
alter table public.feedback enable row level security;
create policy "own feedback: read" on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.feedback to authenticated;
grant select, insert, update on public.feedback to service_role;
revoke all on public.feedback from anon;
