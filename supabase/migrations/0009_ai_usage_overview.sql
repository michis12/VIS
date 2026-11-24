-- Usage per person for the owner of the API key: friends on the allow-list use
-- the same key, the owner sees what each one used and marks it as paid.
alter table public.ai_access
  add column is_owner boolean not null default false,
  add column settled_at timestamptz;

-- one row per allowed account (only for the owner; empty for everyone else)
create or replace function public.ai_usage_overview()
returns table (
  user_id uuid, email text, month_usd numeric, open_usd numeric, total_usd numeric,
  uses integer, settled_at timestamptz, is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, u.email::text,
    coalesce(sum(l.usd) filter (where l.created_at >= date_trunc('month', now())), 0),
    coalesce(sum(l.usd) filter (where l.created_at >= coalesce(a.settled_at, '-infinity'::timestamptz)), 0),
    coalesce(sum(l.usd), 0),
    count(l.id)::integer,
    a.settled_at,
    a.user_id = (select auth.uid())
  from public.ai_access a
  join auth.users u on u.id = a.user_id
  left join public.ai_ledger l on l.user_id = a.user_id and l.kind = 'use'
  where exists (select 1 from public.ai_access o where o.user_id = (select auth.uid()) and o.is_owner)
  group by a.user_id, u.email, a.settled_at
  order by (a.user_id = (select auth.uid())) desc, u.email
$$;

-- owner marks someone's open amount as paid
create or replace function public.ai_mark_settled(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_access set settled_at = now()
  where user_id = target
    and exists (select 1 from public.ai_access o where o.user_id = (select auth.uid()) and o.is_owner)
$$;

revoke all on function public.ai_usage_overview() from public, anon;
revoke all on function public.ai_mark_settled(uuid) from public, anon;
grant execute on function public.ai_usage_overview() to authenticated;
grant execute on function public.ai_mark_settled(uuid) to authenticated;
