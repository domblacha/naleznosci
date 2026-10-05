-- Faktury: izolacja właściciela przez RLS i złożony FK do klienta, unikalny numer w obrębie konta.

-- Cel złożonego FK: klient faktury musi należeć do tego samego właściciela.
alter table public.clients add constraint clients_id_user_key unique (id, user_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  number text not null check (char_length(btrim(number)) between 1 and 50),
  amount_grosze bigint not null check (amount_grosze between 1 and 99999999999),
  due_date date not null,
  created_at timestamptz not null default now(),
  constraint invoices_client_owner_fkey foreign key (client_id, user_id) references public.clients (id, user_id)
);

-- Duplikat: ten sam numer u jednego właściciela bez rozróżniania wielkości liter.
create unique index invoices_user_number_key on public.invoices (user_id, lower(number));
create index invoices_client_owner_idx on public.invoices (client_id, user_id);

alter table public.invoices enable row level security;

-- authenticated
create policy "invoices_select_authenticated" on public.invoices
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "invoices_insert_authenticated" on public.invoices
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "invoices_update_authenticated" on public.invoices
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Twarde usuwanie zablokowane (anulowanie w S-07).
create policy "invoices_delete_authenticated" on public.invoices
  for delete to authenticated
  using (false);

-- anon: brak dostępu
create policy "invoices_select_anon" on public.invoices
  for select to anon
  using (false);

create policy "invoices_insert_anon" on public.invoices
  for insert to anon
  with check (false);

create policy "invoices_update_anon" on public.invoices
  for update to anon
  using (false)
  with check (false);

create policy "invoices_delete_anon" on public.invoices
  for delete to anon
  using (false);
