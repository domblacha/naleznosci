-- Data usunięcia klienta: znacznik stanu "klient usunięty" (null = klient aktywny).
-- Istniejące polityki RLS (update tylko dla właściciela, delete zablokowany, anon bez dostępu) obejmują nową kolumnę.
-- Zakres zgodny z walidacją aplikacji (lata 2000-2100), jak paid_on i cancelled_on.

alter table public.clients
  add column deactivated_on date null
  constraint clients_deactivated_on_range check (deactivated_on between date '2000-01-01' and date '2100-12-31');

-- Niezmiennik: usunięty klient nie ma otwartych faktur (otwarta = bez paid_on i bez cancelled_on, także wstrzymana).
-- Egzekwują go dwa triggery, po jednym z każdej strony.
-- UWAGA: treści wyjątków ('client_has_open_invoices', 'client_inactive', SQLSTATE P0001) są kontraktem
-- z src/lib/services/clients.ts i src/lib/services/invoices.ts, które rozpoznają je po error.message.
-- Funkcje są security invoker (domyślnie): RLS właściciela obejmuje oba odczyty.

-- Strona klienta: nie można usunąć klienta z otwartą fakturą.
create function public.clients_guard_deactivation() returns trigger
language plpgsql
as $$
begin
  if old.deactivated_on is null and new.deactivated_on is not null then
    if exists (
      select 1 from public.invoices
      where client_id = new.id and paid_on is null and cancelled_on is null
    ) then
      raise exception 'client_has_open_invoices';
    end if;
  end if;
  return new;
end;
$$;

create trigger clients_guard_deactivation
  before update of deactivated_on on public.clients
  for each row execute function public.clients_guard_deactivation();

-- Strona faktury: nie można otworzyć faktury (insert, zmiana klienta, cofnięcie wpłaty, przywrócenie anulowanej)
-- u usuniętego klienta. "for share" koliduje z update wiersza klienta, więc równoległa dezaktywacja
-- czeka na commit faktury (i jej exists widzi tę fakturę) albo faktura widzi już deactivated_on.
create function public.invoices_guard_client_active() returns trigger
language plpgsql
as $$
declare
  client_deactivated_on date;
begin
  if new.paid_on is null and new.cancelled_on is null then
    select deactivated_on into client_deactivated_on
    from public.clients
    where id = new.client_id
    for share;

    if client_deactivated_on is not null then
      raise exception 'client_inactive';
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_guard_client_active
  before insert or update of client_id, paid_on, cancelled_on on public.invoices
  for each row execute function public.invoices_guard_client_active();
