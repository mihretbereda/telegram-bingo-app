-- Fast lookup for call_one_ball(): only scans active sessions with balls remaining.
create index if not exists game_sessions_active_idx
  on public.game_sessions (status, call_index)
  where status = 'active';

-- Fast lookup for check_and_start_games(): only scans waiting sessions past their timer.
create index if not exists game_sessions_waiting_idx
  on public.game_sessions (status, timer_ends_at)
  where status = 'waiting';
