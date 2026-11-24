-- Credit tracking for the AI features: top-ups are entered in the app, every
-- photo recognition writes its estimated cost (edge function, service role).
-- Balance = sum of top-ups - sum of uses. Anthropic has no balance API, so this
-- is an estimate from the token counts of each response.
create table public.ai_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('topup', 'use')),
  usd numeric(10, 5) not null,
  note text
);
create index ai_ledger_user_idx on public.ai_ledger (user_id, created_at desc);
alter table public.ai_ledger enable row level security;

create policy "own ledger: read" on public.ai_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own ledger: add top-up" on public.ai_ledger
  for insert to authenticated
  with check ((select auth.uid()) = user_id and kind = 'topup' and usd > 0 and usd < 1000);
create policy "own ledger: remove top-up" on public.ai_ledger
  for delete to authenticated using ((select auth.uid()) = user_id and kind = 'topup');

grant select, insert, delete on public.ai_ledger to authenticated;
revoke all on public.ai_ledger from anon;
