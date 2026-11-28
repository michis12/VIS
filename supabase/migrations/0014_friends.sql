-- Friends: send a request with a friend code, accept or decline, then compare.
-- Nobody sees an e-mail address: a profile is just a chosen name and a code.
--
--   friend_profiles  name + friend code per account
--   friendships      requester -> addressee, 'pending' or 'accepted'
--   friend_stats     a small summary each app publishes (week score, workouts,
--                    rank, best lifts …), readable only by accepted friends
-- Requests, answers and removals go through security-definer functions.

create table public.friend_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee_idx on public.friendships (addressee, status);

create table public.friend_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  stats jsonb not null check (pg_column_size(stats) < 8000)
);

-- is `other` connected to the caller (accepted, or pending for showing names)?
create or replace function public.friend_link(other uuid, accepted_only boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where ((f.requester = (select auth.uid()) and f.addressee = other) or (f.addressee = (select auth.uid()) and f.requester = other))
      and (not accepted_only or f.status = 'accepted')
  )
$$;

alter table public.friend_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_stats enable row level security;

create policy "profiles: own or linked" on public.friend_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.friend_link(user_id, false));
create policy "friendships: own" on public.friendships for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy "stats: own or friends" on public.friend_stats for select to authenticated
  using (user_id = (select auth.uid()) or public.friend_link(user_id, true));
create policy "stats: write own" on public.friend_stats for insert to authenticated with check (user_id = (select auth.uid()));
create policy "stats: update own" on public.friend_stats for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "stats: delete own" on public.friend_stats for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.friend_profiles, public.friendships to authenticated;
grant select, insert, update, delete on public.friend_stats to authenticated;
revoke all on public.friend_profiles, public.friendships, public.friend_stats from anon;

-- create / rename the own profile; the code is made once and kept
create or replace function public.friend_profile(new_name text)
returns table (name text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'not signed in'; end if;
  new_name := btrim(coalesce(new_name, ''));
  if length(new_name) < 1 or length(new_name) > 40 then raise exception 'name'; end if;
  if exists (select 1 from public.friend_profiles p where p.user_id = me) then
    update public.friend_profiles p set name = new_name where p.user_id = me;
  else
    loop
      c := '';
      for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
      exit when not exists (select 1 from public.friend_profiles p where p.code = c);
    end loop;
    insert into public.friend_profiles (user_id, name, code) values (me, new_name, c);
  end if;
  return query select p.name, p.code from public.friend_profiles p where p.user_id = me;
end;
$$;

-- request by code; if the other side already asked, this accepts instead
create or replace function public.friend_request(friend_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  other uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.friend_profiles p where p.user_id = me) then return 'no_profile'; end if;
  select p.user_id into other from public.friend_profiles p where p.code = upper(btrim(friend_code));
  if other is null then return 'unknown'; end if;
  if other = me then return 'self'; end if;
  if exists (select 1 from public.friendships f where f.requester = other and f.addressee = me) then
    update public.friendships f set status = 'accepted' where f.requester = other and f.addressee = me;
    return 'accepted';
  end if;
  if exists (select 1 from public.friendships f where f.requester = me and f.addressee = other) then return 'exists'; end if;
  if (select count(*) from public.friendships f where f.requester = me and f.created_at > now() - interval '1 day') >= 30 then return 'limit'; end if;
  insert into public.friendships (requester, addressee) values (me, other);
  return 'sent';
end;
$$;

create or replace function public.friend_respond(request_id bigint, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if accept then
    update public.friendships set status = 'accepted' where id = request_id and addressee = (select auth.uid()) and status = 'pending';
  else
    delete from public.friendships where id = request_id and addressee = (select auth.uid()) and status = 'pending';
  end if;
end;
$$;

-- unfriend, withdraw a request
create or replace function public.friend_remove(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where (requester = (select auth.uid()) and addressee = other) or (addressee = (select auth.uid()) and requester = other);
end;
$$;

revoke all on function public.friend_link(uuid, boolean) from public, anon;
revoke all on function public.friend_profile(text) from public, anon;
revoke all on function public.friend_request(text) from public, anon;
revoke all on function public.friend_respond(bigint, boolean) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
grant execute on function public.friend_link(uuid, boolean) to authenticated;
grant execute on function public.friend_profile(text) to authenticated;
grant execute on function public.friend_request(text) to authenticated;
grant execute on function public.friend_respond(bigint, boolean) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
