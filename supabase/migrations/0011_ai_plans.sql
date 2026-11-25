-- Subscriptions for the AI features.
--   dev    - the developer: sees the estimated API balance, enters top-ups,
--            sees everyone's use and hands out plans (replaces is_owner)
--   friend - unlimited, own use shown in $ so the developer can bill it
--   solo   - paid plan, 2.5 $ of API use per calendar month (Vienna time)
--   ultra  - paid plan, twice the solo limit
-- Paid plans only ever see a percentage of their monthly quota, never $:
-- their ledger rows are not readable, the status comes from ai_my_plan().
alter table public.ai_access
  add column plan text not null default 'friend' check (plan in ('dev', 'friend', 'solo', 'ultra')),
  add column period text check (period in ('month', 'year')),
  add column paid_until timestamptz;
update public.ai_access set plan = 'dev' where is_owner;

-- monthly API budget of a plan in $ (null = no limit)
create or replace function public.ai_plan_limit(p text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p when 'solo' then 2.5 when 'ultra' then 5.0 end
$$;

-- start of the current calendar month in Vienna
create or replace function public.ai_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Europe/Vienna') at time zone 'Europe/Vienna'
$$;

create or replace function public.ai_is_dev()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ai_access where user_id = (select auth.uid()) and plan = 'dev')
$$;

-- for the edge function (service role): may this account make a request?
create or replace function public.ai_quota(target uuid)
returns table (plan text, active boolean, month_usd numeric, limit_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select a.plan,
    a.plan in ('dev', 'friend') or coalesce(a.paid_until > now(), false),
    coalesce((select sum(l.usd) from public.ai_ledger l
      where l.user_id = a.user_id and l.kind = 'use' and l.created_at >= public.ai_month_start()), 0),
    public.ai_plan_limit(a.plan)
  from public.ai_access a
  where a.user_id = target
$$;

-- the caller's own plan; $ only for dev and friend, paid plans get a percentage
create or replace function public.ai_my_plan()
returns table (
  plan text, period text, paid_until timestamptz, active boolean,
  used_pct numeric, month_usd numeric, resets_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.plan, a.period, a.paid_until, q.active,
    case when q.limit_usd is not null then round(least(100, q.month_usd / q.limit_usd * 100), 1) end,
    case when q.plan in ('dev', 'friend') then q.month_usd end,
    (date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month') at time zone 'Europe/Vienna'
  from public.ai_quota((select auth.uid())) q
  join public.ai_access a on a.user_id = (select auth.uid())
$$;

-- developer: give someone a plan by e-mail ('none' removes the access).
-- A paid plan runs one month or one year, extended from the current end if still active.
create or replace function public.ai_set_plan(target_email text, new_plan text, new_period text default 'month')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  span interval := case when new_period = 'year' then interval '1 year' else interval '1 month' end;
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  select id into target from auth.users where lower(email) = lower(trim(target_email));
  if target is null then raise exception 'unknown user'; end if;
  if new_plan = 'none' then
    delete from public.ai_access where user_id = target and plan <> 'dev';
    return;
  end if;
  if new_plan not in ('friend', 'solo', 'ultra') then raise exception 'bad plan'; end if;
  insert into public.ai_access (user_id, plan, period, paid_until)
  values (target, new_plan,
    case when new_plan = 'friend' then null else coalesce(new_period, 'month') end,
    case when new_plan = 'friend' then null else now() + span end)
  on conflict (user_id) do update set
    plan = excluded.plan,
    period = excluded.period,
    paid_until = case when excluded.plan = 'friend' then null
      else greatest(coalesce(public.ai_access.paid_until, now()), now()) + span end
  where public.ai_access.plan <> 'dev';
end
$$;

-- overview for the developer, now with plan and quota
drop function public.ai_usage_overview();
create function public.ai_usage_overview()
returns table (
  user_id uuid, email text, month_usd numeric, open_usd numeric, total_usd numeric,
  uses integer, settled_at timestamptz, is_me boolean,
  plan text, period text, paid_until timestamptz, limit_usd numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, u.email::text,
    coalesce(sum(l.usd) filter (where l.created_at >= public.ai_month_start()), 0),
    coalesce(sum(l.usd) filter (where l.created_at >= coalesce(a.settled_at, '-infinity'::timestamptz)), 0),
    coalesce(sum(l.usd), 0),
    count(l.id)::integer,
    a.settled_at,
    a.user_id = (select auth.uid()),
    a.plan, a.period, a.paid_until, public.ai_plan_limit(a.plan)
  from public.ai_access a
  join auth.users u on u.id = a.user_id
  left join public.ai_ledger l on l.user_id = a.user_id and l.kind = 'use'
  where public.ai_is_dev()
  group by a.user_id, u.email, a.settled_at, a.plan, a.period, a.paid_until
  order by (a.user_id = (select auth.uid())) desc, u.email
$$;

create or replace function public.ai_mark_settled(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_access set settled_at = now()
  where user_id = target and public.ai_is_dev()
$$;

alter table public.ai_access drop column is_owner;

-- ledger: only dev and friends read their own $; only the developer enters top-ups
drop policy "own ledger: read" on public.ai_ledger;
drop policy "own ledger: add top-up" on public.ai_ledger;
drop policy "own ledger: remove top-up" on public.ai_ledger;
create policy "own ledger: read (dev, friend)" on public.ai_ledger
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_access a where a.user_id = (select auth.uid()) and a.plan in ('dev', 'friend')));
create policy "dev: add top-up" on public.ai_ledger
  for insert to authenticated
  with check ((select auth.uid()) = user_id and kind = 'topup' and usd > 0 and usd < 1000 and (select public.ai_is_dev()));
create policy "dev: remove top-up" on public.ai_ledger
  for delete to authenticated using ((select auth.uid()) = user_id and kind = 'topup' and (select public.ai_is_dev()));

revoke all on function public.ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota(uuid) to service_role;
revoke all on function public.ai_my_plan() from public, anon;
grant execute on function public.ai_my_plan() to authenticated;
revoke all on function public.ai_set_plan(text, text, text) from public, anon;
grant execute on function public.ai_set_plan(text, text, text) to authenticated;
revoke all on function public.ai_usage_overview() from public, anon;
grant execute on function public.ai_usage_overview() to authenticated;
revoke all on function public.ai_mark_settled(uuid) from public, anon;
grant execute on function public.ai_mark_settled(uuid) to authenticated;
revoke all on function public.ai_is_dev() from public, anon;
grant execute on function public.ai_is_dev() to authenticated, service_role;
