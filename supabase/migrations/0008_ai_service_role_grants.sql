-- The food-photo edge function runs as service_role: it must read the allow-list
-- and book the cost of each photo. This project does not grant table privileges
-- to service_role by default.
grant select on public.ai_access to service_role;
grant select, insert on public.ai_ledger to service_role;
