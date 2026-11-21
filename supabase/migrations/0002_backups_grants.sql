-- New projects do not expose tables to the Data API roles automatically.
-- Signed-in users may read, add and delete (their own, via RLS) backups; anonymous users get nothing.
grant select, insert, delete on table public.backups to authenticated;
revoke all on table public.backups from anon;
revoke truncate, references, trigger on table public.backups from authenticated;
