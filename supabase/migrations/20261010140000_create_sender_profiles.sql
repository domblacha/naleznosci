-- Profil nadawcy wstawiany do ponagleń: jeden wiersz na użytkownika, zapisywany upsertem.
-- Wszystkie pola są opcjonalne; brak wiersza oznacza profil pusty (EMPTY_SENDER_PROFILE w src/lib/sender-profile.ts).
-- Ograniczenia muszą się zgadzać z walidacją w src/lib/sender-profile-schemas.ts.
-- Baza sprawdza tylko format (10 i 26 cyfr); sumy kontrolne NIP i konta sprawdza kod.

create table public.sender_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  company_name text null check (char_length(company_name) between 1 and 200),
  nip text null check (nip ~ '^[0-9]{10}$'),
  address text null check (char_length(address) between 1 and 300),
  bank_account text null check (bank_account ~ '^[0-9]{26}$'),
  updated_at timestamptz not null default now()
);

alter table public.sender_profiles enable row level security;

-- authenticated
create policy "sender_profiles_select_authenticated" on public.sender_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "sender_profiles_insert_authenticated" on public.sender_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sender_profiles_update_authenticated" on public.sender_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Usuwanie zablokowane: wyczyszczenie profilu to zapis pustych pól.
create policy "sender_profiles_delete_authenticated" on public.sender_profiles
  for delete to authenticated
  using (false);

-- anon: brak dostępu
create policy "sender_profiles_select_anon" on public.sender_profiles
  for select to anon
  using (false);

create policy "sender_profiles_insert_anon" on public.sender_profiles
  for insert to anon
  with check (false);

create policy "sender_profiles_update_anon" on public.sender_profiles
  for update to anon
  using (false)
  with check (false);

create policy "sender_profiles_delete_anon" on public.sender_profiles
  for delete to anon
  using (false);
