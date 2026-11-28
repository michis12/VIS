-- VIS-Officium: the owner's own overview app (officium.html). Everything it reads
-- goes through security-definer functions that only answer for the developer
-- account (public.ai_is_dev(), migration 0011); nobody else gets any rows.
--
-- New here:
--   * feedback.done            the owner ticks off feedback in the Officium
--   * food_corrections         a user changed the values of a database product;
--                              the change applies for them at once and lands
--                              here as a request
--   * food_overrides           accepted corrections, read by every app so the
--                              product shows the corrected values for everyone

alter table public.feedback add column if not exists done boolean not null default false;

-- ---------------------------------------------------------------- corrections
create table public.food_corrections (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  food_id text not null check (length(food_id) between 1 and 80),
  barcode text check (barcode is null or length(barcode) <= 40),
  name text not null check (length(name) between 1 and 120),
  brand text check (brand is null or length(brand) <= 80),
  old_values jsonb not null,
  new_values jsonb not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  decided_at timestamptz
);
create index food_corrections_open_idx on public.food_corrections (status, created_at desc);
create index food_corrections_user_idx on public.food_corrections (user_id, created_at desc);
alter table public.food_corrections enable row level security;
create policy "own corrections: read" on public.food_corrections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own corrections: send" on public.food_corrections
  for insert to authenticated with check ((select auth.uid()) = user_id and status = 'open' and decided_at is null);
grant select, insert on public.food_corrections to authenticated;
revoke all on public.food_corrections from anon;

-- spam guard: at most 30 requests per user and day
create or replace function public.food_corrections_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.food_corrections
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many corrections today';
  end if;
  return new;
end;
$$;
create trigger food_corrections_guard before insert on public.food_corrections
  for each row execute function public.food_corrections_guard();

-- accepted values, readable by everyone (also without an account)
create table public.food_overrides (
  food_id text primary key,
  barcode text,
  "values" jsonb not null,
  updated_at timestamptz not null default now(),
  correction_id bigint references public.food_corrections (id) on delete set null
);
alter table public.food_overrides enable row level security;
create policy "overrides: read" on public.food_overrides for select to anon, authenticated using (true);
grant select on public.food_overrides to anon, authenticated;

-- ---------------------------------------------------------------- officium
create or replace function public.officium_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb;
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'now', now(),
    'users', (select count(*) from auth.users),
    'newUsers7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active7', (select count(distinct user_id) from public.backups where created_at > now() - interval '7 days'),
    'active30', (select count(distinct user_id) from public.backups where created_at > now() - interval '30 days'),
    'backups', (select count(*) from public.backups),
    'dbBytes', pg_database_size(current_database()),
    'aiMonthUsd', (select coalesce(sum(usd), 0) from public.ai_ledger where kind = 'use' and created_at >= public.ai_month_start()),
    'aiMonthUses', (select count(*) from public.ai_ledger where kind = 'use' and created_at >= public.ai_month_start()),
    'aiTotalUsd', (select coalesce(sum(usd), 0) from public.ai_ledger where kind = 'use'),
    'topups', (select coalesce(sum(usd), 0) from public.ai_ledger where kind = 'topup'),
    'feedbackOpen', (select count(*) from public.feedback where not done),
    'correctionsOpen', (select count(*) from public.food_corrections where status = 'open'),
    'overrides', (select count(*) from public.food_overrides),
    'plans', (select coalesce(jsonb_object_agg(plan, n), '{}') from (select plan, count(*) n from public.ai_access group by plan) p),
    -- AI cost per day, last 30 days
    'aiDays', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'usd', usd, 'uses', n) order by d), '[]') from (
      select date_trunc('day', created_at)::date d, sum(usd) usd, count(*) n from public.ai_ledger
      where kind = 'use' and created_at > now() - interval '30 days' group by 1) x),
    -- AI cost per feature this month (the ledger note starts with the feature)
    'aiModes', (select coalesce(jsonb_agg(jsonb_build_object('mode', m, 'usd', usd, 'uses', n) order by usd desc), '[]') from (
      select split_part(coalesce(note, '?'), ' · ', 1) m, sum(usd) usd, count(*) n from public.ai_ledger
      where kind = 'use' and created_at >= public.ai_month_start() group by 1) x),
    -- sign-ups per week, last 12 weeks
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w), '[]') from (
      select date_trunc('week', created_at)::date w, count(*) n from auth.users
      where created_at > now() - interval '84 days' group by 1) x),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid), 'rows', greatest(c.reltuples, 0)::bigint) order by pg_total_relation_size(c.oid) desc), '[]')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r')
  ) into out;
  return out;
end;
$$;

create or replace function public.officium_users()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  plan text, friend boolean, backups bigint, last_backup timestamptz, workouts integer, backup_bytes integer,
  ai_month_usd numeric, ai_total_usd numeric, ai_uses bigint, feedback bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
    a.plan, coalesce(a.friend, false),
    (select count(*) from public.backups b where b.user_id = u.id),
    (select max(b.created_at) from public.backups b where b.user_id = u.id),
    (select b.workouts from public.backups b where b.user_id = u.id order by b.id desc limit 1),
    (select pg_column_size(b.data) from public.backups b where b.user_id = u.id order by b.id desc limit 1),
    (select coalesce(sum(l.usd), 0) from public.ai_ledger l where l.user_id = u.id and l.kind = 'use' and l.created_at >= public.ai_month_start()),
    (select coalesce(sum(l.usd), 0) from public.ai_ledger l where l.user_id = u.id and l.kind = 'use'),
    (select count(*) from public.ai_ledger l where l.user_id = u.id and l.kind = 'use'),
    (select count(*) from public.feedback f where f.user_id = u.id)
  from auth.users u
  left join public.ai_access a on a.user_id = u.id
  order by coalesce((select max(b.created_at) from public.backups b where b.user_id = u.id), u.created_at) desc;
end;
$$;

create or replace function public.officium_feedback()
returns table (id bigint, created_at timestamptz, kind text, message text, meta jsonb, done boolean, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  return query
  select f.id, f.created_at, f.kind, f.message, f.meta, f.done, u.email::text
  from public.feedback f join auth.users u on u.id = f.user_id
  order by f.done, f.created_at desc
  limit 300;
end;
$$;

create or replace function public.officium_feedback_done(target bigint, is_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  update public.feedback set done = is_done where id = target;
end;
$$;

create or replace function public.officium_corrections()
returns table (
  id bigint, created_at timestamptz, food_id text, barcode text, name text, brand text,
  old_values jsonb, new_values jsonb, status text, decided_at timestamptz, email text, user_corrections bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  return query
  select c.id, c.created_at, c.food_id, c.barcode, c.name, c.brand, c.old_values, c.new_values, c.status, c.decided_at,
    u.email::text, (select count(*) from public.food_corrections x where x.user_id = c.user_id)
  from public.food_corrections c join auth.users u on u.id = c.user_id
  order by (c.status = 'open') desc, c.created_at desc
  limit 300;
end;
$$;

-- accept: the new values become the product's values for everyone
create or replace function public.officium_decide(target bigint, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.food_corrections;
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  select * into c from public.food_corrections where id = target;
  if not found then raise exception 'unknown correction'; end if;
  update public.food_corrections set status = case when accept then 'accepted' else 'rejected' end, decided_at = now() where id = target;
  if accept then
    insert into public.food_overrides (food_id, barcode, "values", updated_at, correction_id)
    values (c.food_id, c.barcode, c.new_values, now(), c.id)
    on conflict (food_id) do update set barcode = excluded.barcode, "values" = excluded."values", updated_at = now(), correction_id = excluded.correction_id;
    -- other open requests for the same product are settled by this decision
    update public.food_corrections set status = 'rejected', decided_at = now() where food_id = c.food_id and status = 'open' and id <> target;
  end if;
end;
$$;

-- an accepted override can be taken back
create or replace function public.officium_drop_override(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ai_is_dev() then raise exception 'not allowed'; end if;
  delete from public.food_overrides where food_id = target;
end;
$$;

revoke all on function public.officium_overview() from public, anon;
revoke all on function public.officium_users() from public, anon;
revoke all on function public.officium_feedback() from public, anon;
revoke all on function public.officium_feedback_done(bigint, boolean) from public, anon;
revoke all on function public.officium_corrections() from public, anon;
revoke all on function public.officium_decide(bigint, boolean) from public, anon;
revoke all on function public.officium_drop_override(text) from public, anon;
revoke all on function public.food_corrections_guard() from public, anon, authenticated;
grant execute on function public.officium_overview() to authenticated;
grant execute on function public.officium_users() to authenticated;
grant execute on function public.officium_feedback() to authenticated;
grant execute on function public.officium_feedback_done(bigint, boolean) to authenticated;
grant execute on function public.officium_corrections() to authenticated;
grant execute on function public.officium_decide(bigint, boolean) to authenticated;
grant execute on function public.officium_drop_override(text) to authenticated;
