-- Data anulowania faktury: znacznik stanu "anulowana" (null = nieanulowana).
-- Istniejące polityki RLS (update tylko dla właściciela, anon bez dostępu) obejmują nową kolumnę;
-- twarde usuwanie pozostaje zablokowane polityką delete using (false).
-- Zakres zgodny z walidacją aplikacji (lata 2000-2100), jak paid_on.

alter table public.invoices
  add column cancelled_on date null
  constraint invoices_cancelled_on_range check (cancelled_on between date '2000-01-01' and date '2100-12-31');

-- Faktura nie może być jednocześnie zapłacona i anulowana.
alter table public.invoices
  add constraint invoices_single_closed_state check (paid_on is null or cancelled_on is null);

-- Numer anulowanej faktury jest wolny: unikalność dotyczy tylko faktur nieanulowanych.
-- Ta sama nazwa indeksu, bo serwis rozpoznaje duplikat numeru po nazwie.
drop index public.invoices_user_number_key;
create unique index invoices_user_number_key on public.invoices (user_id, lower(number)) where cancelled_on is null;
