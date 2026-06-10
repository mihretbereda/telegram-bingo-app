-- Returns total registered user count bypassing RLS (profiles has per-user select policy).
-- Only exposes a number, no profile data.
create or replace function public.get_total_users()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.profiles;
$$;

grant execute on function public.get_total_users() to anon, authenticated;
