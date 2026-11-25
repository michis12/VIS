-- Plans, round two.
--   fam    - what "friend" was: unlimited, own use in $ (renamed)
--   friend - now a status, not a plan: half price on Solo / Ultra with a lower
--            monthly limit, so the developer makes no loss (Solo 2 $, Ultra 4 $
--            instead of 2.5 / 5). A friend without a subscription has plan 'free'
--            (no AI) and only the friend flag.
-- Granting fam or friend leaves a welcome for the app (pop-up with confetti)
-- and sends a push right away.
alter table public.ai_access drop constraint ai_access_plan_check;
update public.ai_access set plan = 'fam' where plan = 'friend';
alter table public.ai_access
  add constraint ai_access_plan_check check (plan in ('dev', 'fam', 'free', 'solo', 'ultra')),
  add column friend boolean not null default false,
  add column welcome text check (welcome in ('fam', 'friend'));

drop function if exists public.ai_plan_limit(text);
create or replace function public.ai_plan_limit(p text, friend boolean default false)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'solo' then case when friend then 2.0 else 2.5 end
    when 'ultra' then case when friend then 4.0 else 5.0 end
  end
$$;

-- for the edge function: 'free' has no AI, so no row comes back (-> "access")
create or replace function public.ai_quota(target uuid)
returns table (plan text, active boolean, month_usd numeric, limit_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select a.plan,
    a.plan in ('dev', 'fam') or coalesce(a.paid_until > now(), false),
    coalesce((select sum(l.usd) from public.ai_ledger l
      where l.user_id = a.user_id and l.kind = 'use' and l.created_at >= public.ai_month_start()), 0),
    public.ai_plan_limit(a.plan, a.friend)
  from public.ai_access a
  where a.user_id = target and a.plan <> 'free'
$$;

drop function public.ai_my_plan();
create function public.ai_my_plan()
returns table (
  plan text, period text, paid_until timestamptz, active boolean,
  used_pct numeric, month_usd numeric, resets_at timestamptz, friend boolean, welcome text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select a.*, public.ai_plan_limit(a.plan, a.friend) as lim,
      coalesce((select sum(l.usd) from public.ai_ledger l
        where l.user_id = a.user_id and l.kind = 'use' and l.created_at >= public.ai_month_start()), 0) as used
    from public.ai_access a
    where a.user_id = (select auth.uid())
  )
  select me.plan, me.period, me.paid_until,
    me.plan in ('dev', 'fam') or coalesce(me.paid_until > now(), false),
    case when me.lim is not null then round(least(100, me.used / me.lim * 100), 1) end,
    case when me.plan in ('dev', 'fam') then me.used end,
    (date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month') at time zone 'Europe/Vienna',
    me.friend, me.welcome
  from me
$$;

-- the app shows the welcome once, then clears it
create or replace function public.ai_ack_welcome()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_access set welcome = null where user_id = (select auth.uid())
$$;

-- push to all of a user's devices right now (same route as the rest-timer pushes)
create or replace function app_private.push_now(target uuid, title text, body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'title', title, 'body', body))
  into msgs
  from public.push_subscriptions s
  where s.user_id = target;
  if msgs is null then
    return;
  end if;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_push_url'),
    body := jsonb_build_object(
      'vapidPrivate', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
      'messages', msgs),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke execute on function app_private.push_now(uuid, text, text) from public, anon, authenticated;

-- developer: hand out a plan or a status by e-mail.
--   fam / solo / ultra - the plan (a paid plan runs a month or a year, extended from its end)
--   friend             - the half-price status (keeps an existing paid plan, otherwise 'free')
--   none               - removes the access entirely
drop function public.ai_set_plan(text, text, text);
create function public.ai_set_plan(target_email text, new_plan text, new_period text default 'month')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  span interval := case when new_period = 'year' then interval '1 year' else interval '1 month' end;
  was_fam boolean;
  was_friend boolean;
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  select id into target from auth.users where lower(email) = lower(trim(target_email));
  if target is null then raise exception 'unknown user'; end if;
  if exists (select 1 from public.ai_access where user_id = target and plan = 'dev') then raise exception 'is dev'; end if;
  select plan = 'fam', friend into was_fam, was_friend from public.ai_access where user_id = target;

  if new_plan = 'none' then
    delete from public.ai_access where user_id = target;
    return;
  elsif new_plan = 'friend' then
    insert into public.ai_access (user_id, plan, friend) values (target, 'free', true)
    on conflict (user_id) do update set friend = true;
    if not coalesce(was_friend, false) then
      update public.ai_access set welcome = 'friend' where user_id = target;
      perform app_private.push_now(target, 'Du bist jetzt Friend ✦', 'Alle VIS-Pro-Abos für dich zum halben Preis. Öffne die App!');
    end if;
  elsif new_plan = 'fam' then
    insert into public.ai_access (user_id, plan, period, paid_until) values (target, 'fam', null, null)
    on conflict (user_id) do update set plan = 'fam', period = null, paid_until = null;
    if not coalesce(was_fam, false) then
      update public.ai_access set welcome = 'fam' where user_id = target;
      perform app_private.push_now(target, 'Willkommen in der Family ✦', 'Du hast jetzt alle KI-Funktionen von VIS. Öffne die App!');
    end if;
  elsif new_plan in ('solo', 'ultra') then
    insert into public.ai_access (user_id, plan, period, paid_until)
    values (target, new_plan, coalesce(new_period, 'month'), now() + span)
    on conflict (user_id) do update set
      plan = excluded.plan,
      period = excluded.period,
      paid_until = greatest(coalesce(public.ai_access.paid_until, now()), now()) + span;
  else
    raise exception 'bad plan';
  end if;
end
$$;

drop function public.ai_usage_overview();
create function public.ai_usage_overview()
returns table (
  user_id uuid, email text, month_usd numeric, open_usd numeric, total_usd numeric,
  uses integer, settled_at timestamptz, is_me boolean,
  plan text, period text, paid_until timestamptz, limit_usd numeric, friend boolean
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
    a.plan, a.period, a.paid_until, public.ai_plan_limit(a.plan, a.friend), a.friend
  from public.ai_access a
  join auth.users u on u.id = a.user_id
  left join public.ai_ledger l on l.user_id = a.user_id and l.kind = 'use'
  where public.ai_is_dev()
  group by a.user_id, u.email, a.settled_at, a.plan, a.period, a.paid_until, a.friend
  order by (a.user_id = (select auth.uid())) desc, u.email
$$;

-- ledger: dev and fam read their own $
drop policy "own ledger: read (dev, friend)" on public.ai_ledger;
create policy "own ledger: read (dev, fam)" on public.ai_ledger
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_access a where a.user_id = (select auth.uid()) and a.plan in ('dev', 'fam')));

revoke all on function public.ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota(uuid) to service_role;
revoke all on function public.ai_my_plan() from public, anon;
grant execute on function public.ai_my_plan() to authenticated;
revoke all on function public.ai_ack_welcome() from public, anon;
grant execute on function public.ai_ack_welcome() to authenticated;
revoke all on function public.ai_set_plan(text, text, text) from public, anon;
grant execute on function public.ai_set_plan(text, text, text) to authenticated;
revoke all on function public.ai_usage_overview() from public, anon;
grant execute on function public.ai_usage_overview() to authenticated;
