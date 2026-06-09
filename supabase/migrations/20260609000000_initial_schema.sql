-- ─── Profiles ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  telegram_id bigint      unique not null,
  username    text,
  first_name  text        not null,
  last_name   text,
  photo_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_telegram_id_idx on public.profiles (telegram_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ─── Auto-create profile when auth user is created ────────────────────────────
-- The Edge Function sets telegram_id / first_name in raw_user_meta_data.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, telegram_id, first_name, last_name, username, photo_url)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'telegram_id')::bigint,
    coalesce(new.raw_user_meta_data ->> 'first_name', 'User'),
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'photo_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
