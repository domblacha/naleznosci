-- Ustawienia reguły eskalacji: jeden wiersz na użytkownika, zapisywany upsertem.
-- Brak wiersza oznacza wartości domyślne z kodu (DEFAULT_ESCALATION_SETTINGS w src/lib/charges.ts).
-- Ograniczenia muszą się zgadzać z walidacją w src/lib/settings-schemas.ts.

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  threshold_1 integer not null,
  threshold_2 integer not null,
  threshold_3 integer not null,
  threshold_4 integer not null,
  annual_rate_bp integer not null check (annual_rate_bp between 0 and 10000),
  compensation_1_grosze bigint not null check (compensation_1_grosze between 0 and 10000000),
  compensation_2_grosze bigint not null check (compensation_2_grosze between 0 and 10000000),
  compensation_3_grosze bigint not null check (compensation_3_grosze between 0 and 10000000),
  updated_at timestamptz not null default now(),
  constraint user_settings_thresholds_check check (
    1 <= threshold_1
    and threshold_1 < threshold_2
    and threshold_2 < threshold_3
    and threshold_3 < threshold_4
    and threshold_4 <= 365
  )
);

alter table public.user_settings enable row level security;

-- authenticated
create policy "user_settings_select_authenticated" on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_settings_insert_authenticated" on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_settings_update_authenticated" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Usuwanie zablokowane: powrót do wartości domyślnych to zapis wartości domyślnych.
create policy "user_settings_delete_authenticated" on public.user_settings
  for delete to authenticated
  using (false);

-- anon: brak dostępu
create policy "user_settings_select_anon" on public.user_settings
  for select to anon
  using (false);

create policy "user_settings_insert_anon" on public.user_settings
  for insert to anon
  with check (false);

create policy "user_settings_update_anon" on public.user_settings
  for update to anon
  using (false)
  with check (false);

create policy "user_settings_delete_anon" on public.user_settings
  for delete to anon
  using (false);
