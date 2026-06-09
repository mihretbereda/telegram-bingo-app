-- Allow authenticated users to insert their own profile row.
-- Needed when a profile is deleted but the auth session is still valid.
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
