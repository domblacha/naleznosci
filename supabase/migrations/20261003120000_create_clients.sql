-- Klienci: pierwsza tabela domenowa. Izolacja właściciela przez RLS, reguła duplikatu w indeksach.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  nip text null check (nip ~ '^[0-9]{10}$'),
  charge_compensation boolean not null default true,
  created_at timestamptz not null default now()
);

-- Duplikat: ten sam NIP u jednego właściciela albo ta sama nazwa (bez NIP) bez rozróżniania wielkości liter.
create unique index clients_user_nip_key on public.clients (user_id, nip) where nip is not null;
create unique index clients_user_name_key on public.clients (user_id, lower(name)) where nip is null;

alter table public.clients enable row level security;

-- authenticated
create policy "clients_select_authenticated" on public.clients
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "clients_insert_authenticated" on public.clients
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "clients_update_authenticated" on public.clients
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Twarde usuwanie zablokowane (dezaktywacja w osobnym wycinku).
create policy "clients_delete_authenticated" on public.clients
  for delete to authenticated
  using (false);

-- anon: brak dostępu
create policy "clients_select_anon" on public.clients
  for select to anon
  using (false);

create policy "clients_insert_anon" on public.clients
  for insert to anon
  with check (false);

create policy "clients_update_anon" on public.clients
  for update to anon
  using (false)
  with check (false);

create policy "clients_delete_anon" on public.clients
  for delete to anon
  using (false);
