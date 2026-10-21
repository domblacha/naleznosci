-- Reguły edycji faktur egzekwowane w bazie, żeby nie dało się ich obejść zapisem wprost przez PostgREST.
-- Do tej pory pilnował ich tylko serwis (src/lib/services/invoices.ts, updateInvoice; src/lib/invoice-lock.ts).
--
-- Niezmienniki (pola zablokowane = client_id, amount_grosze, due_date; numer nie jest zablokowany):
-- 1. Faktura zamknięta (zapłacona albo anulowana) nie zmienia pól zablokowanych.
-- 2. Faktura otwarta, niewstrzymana i przeterminowana (due_date < dziś) nie zmienia pól zablokowanych.
-- 3. paid_on nie jest w przyszłości (przy insert i przy update, który zmienia paid_on).
-- Reguła "paid_on nie w przyszłości" z komentarza w 20261007120000_add_invoice_paid_on.sql jest od teraz
-- egzekwowana także w bazie.
--
-- Reguły 1-2 liczą się na stanie sprzed zmiany (old), jak serwis, który czyta wiersz przed update.
-- Pole uznaje się za zmienione tylko, gdy nowa wartość jest różna od starej (is distinct from): serwis
-- wysyła w update wszystkie pola formularza, także niezmienione.
-- Reguły 1-2 dotyczą tylko update: insert przeterminowanej lub zamkniętej faktury jest dozwolony.
--
-- UWAGA: treści wyjątków ('invoice_closed', 'invoice_locked', 'paid_on_in_future', SQLSTATE P0001) są
-- kontraktem z src/lib/services/invoices.ts, który rozpoznaje je po error.message.
-- UWAGA: "dziś" to data w strefie Europe/Warsaw i musi się zgadzać z todayInPoland w src/lib/escalation.ts.
-- current_date liczyłby dzień w strefie sesji (UTC), więc w nocy baza i aplikacja widziałyby różne dni.
-- Funkcja jest security invoker (domyślnie). Pusty search_path: nie odwołuje się do żadnych obiektów schematu.

create function public.invoices_guard_locked_fields() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today_pl date := (now() at time zone 'Europe/Warsaw')::date;
  locked_fields_changed boolean;
begin
  if tg_op = 'UPDATE' then
    locked_fields_changed :=
      new.client_id is distinct from old.client_id
      or new.amount_grosze is distinct from old.amount_grosze
      or new.due_date is distinct from old.due_date;

    if locked_fields_changed then
      if old.paid_on is not null or old.cancelled_on is not null then
        raise exception 'invoice_closed';
      end if;

      -- Granica jak isInvoiceLocked (daysOverdue >= 1) i filtr due_date.gte.today w serwisie.
      if old.paused_on is null and old.due_date < today_pl then
        raise exception 'invoice_locked';
      end if;
    end if;
  end if;

  if new.paid_on is not null
     and new.paid_on > today_pl
     and (tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on) then
    raise exception 'paid_on_in_future';
  end if;

  return new;
end;
$$;

create trigger invoices_guard_locked_fields
  before insert or update of client_id, amount_grosze, due_date, paid_on on public.invoices
  for each row execute function public.invoices_guard_locked_fields();
