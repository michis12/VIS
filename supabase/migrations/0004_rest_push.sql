-- Rest-timer push notifications.
-- The app stores its Web Push subscription and, when a rest starts, a row with the
-- end time. Every 5 s pg_cron runs app_private.dispatch_rest_pushes(), which takes
-- the due rows and posts them to the send-push edge function.
-- Vault secrets (created separately, not in git): 'vapid_private', 'send_push_url'.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

create table public.rest_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  send_at timestamptz not null,
  title text not null default 'Pause vorbei',
  body text not null default 'Zeit für den nächsten Satz',
  created_at timestamptz not null default now()
);
create index rest_pushes_send_at_idx on public.rest_pushes (send_at);
alter table public.rest_pushes enable row level security;
create policy "own rest pushes" on public.rest_pushes
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.rest_pushes to authenticated;
revoke all on public.rest_pushes from anon;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.dispatch_rest_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msgs jsonb;
begin
  with due as (
    delete from public.rest_pushes where send_at <= now() returning user_id, title, body, send_at
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'title', d.title, 'body', d.body))
  into msgs
  from due d
  join public.push_subscriptions s on s.user_id = d.user_id
  where d.send_at > now() - interval '5 minutes'; -- drop pushes that are long overdue

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
revoke execute on function app_private.dispatch_rest_pushes() from public, anon, authenticated;

select cron.schedule('dispatch-rest-pushes', '5 seconds', 'select app_private.dispatch_rest_pushes()');

-- keep the cron history small
select cron.schedule('purge-cron-history', '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$);
