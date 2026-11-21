-- Only one planned rest push per user. Confirming several sets quickly started
-- several rests; racing client requests left older rows behind, which all fired.
-- A new row now replaces every pending row of the same user.
create or replace function public.rest_pushes_replace_pending()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.rest_pushes where user_id = new.user_id and id <> new.id;
  return new;
end;
$$;

create trigger rest_pushes_single_pending
  after insert on public.rest_pushes
  for each row execute function public.rest_pushes_replace_pending();

revoke execute on function public.rest_pushes_replace_pending() from public, anon;
