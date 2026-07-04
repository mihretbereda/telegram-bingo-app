-- When ghost mode is on, check_and_start_games should not start a session
-- unless someone is actively watching (last_watcher_at within 10 seconds).
-- Ghost-join updates last_watcher_at on every Play-page poll (every ~2s),
-- so a 10s threshold safely means "nobody is watching right now."
-- Ghost mode off: existing behaviour is unchanged.

create or replace function public.check_and_start_games()
returns void language plpgsql security definer set search_path = public as $$
declare
  session_rec record;
  ghost_on    boolean;
begin
  select coalesce(ghost_enabled, false) into ghost_on
  from public.admin_config where id = 1;

  for session_rec in
    select id from public.game_sessions
    where status = 'waiting'
      and timer_ends_at <= now()
      and (
        not ghost_on
        or last_watcher_at >= now() - interval '10 seconds'
      )
  loop
    perform public.start_game_session(session_rec.id);
  end loop;
end;
$$;
