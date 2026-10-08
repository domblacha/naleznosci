-- Data wstrzymania eskalacji: znacznik stanu "eskalacja wstrzymana" (null = eskalacja niewstrzymana).
-- Istniejące polityki RLS (update tylko dla właściciela, anon bez dostępu) obejmują nową kolumnę.
-- Zakres zgodny z walidacją aplikacji (lata 2000-2100), jak paid_on i cancelled_on.

alter table public.invoices
  add column paused_on date null
  constraint invoices_paused_on_range check (paused_on between date '2000-01-01' and date '2100-12-31');

-- Wstrzymać można tylko fakturę otwartą: zapłata i anulowanie muszą zdjąć wstrzymanie.
alter table public.invoices
  add constraint invoices_paused_only_open check (paused_on is null or (paid_on is null and cancelled_on is null));
