-- Keep-alive target for .github/workflows/keepalive.yml.
-- Free-plan projects pause after 7 days without activity; this touches the database
-- without exposing any data (returns a constant).
create or replace function public.ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
