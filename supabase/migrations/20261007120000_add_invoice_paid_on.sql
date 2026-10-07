-- Data wpłaty faktury: jedyny znacznik stanu "zapłacona" (null = otwarta).
-- Istniejące polityki RLS (update tylko dla właściciela, anon bez dostępu) obejmują nową kolumnę.
-- Zakres zgodny z walidacją aplikacji (lata 2000-2100); regułę "nie w przyszłości" wymusza aplikacja.

alter table public.invoices
  add column paid_on date null
  constraint invoices_paid_on_range check (paid_on between date '2000-01-01' and date '2100-12-31');
