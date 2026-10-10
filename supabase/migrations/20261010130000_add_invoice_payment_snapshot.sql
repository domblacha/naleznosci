-- Migawka kwot zapłaconej faktury: roczna stopa odsetek (bp) i kwota rekompensaty progu (grosze),
-- zapisywane przy oznaczeniu faktury jako zapłaconej (src/lib/services/invoices.ts, setInvoicePayment).
-- Historia liczy się wyłącznie z migawki, więc zmiana ustawień ani flagi klienta jej nie przepisuje.
-- Istniejące polityki RLS (update tylko dla właściciela, anon bez dostępu) obejmują nowe kolumny.
-- Kolejność: kolumny, backfill, constraint (constraint wymaga uzupełnionych wierszy).

alter table public.invoices
  add column paid_rate_bp integer null
    constraint invoices_paid_rate_bp_range check (paid_rate_bp between 0 and 10000),
  add column paid_compensation_grosze bigint null
    constraint invoices_paid_compensation_grosze_range check (paid_compensation_grosze >= 0);

-- Backfill: zapłacone faktury dostają wartości, które dziś widać w historii.
-- UWAGA: powiela DEFAULT_CHARGE_SETTINGS z src/lib/charges.ts (1375 bp; <= 500 000 gr -> 17 000,
-- < 5 000 000 gr -> 29 750, w pozostałych przypadkach 42 500; 0, gdy klient nie nalicza rekompensaty).
-- Wartości muszą się zgadzać z kodem w chwili tej migracji.
update public.invoices as i
set
  paid_rate_bp = 1375,
  paid_compensation_grosze = case
    when not c.charge_compensation then 0
    when i.amount_grosze <= 500000 then 17000
    when i.amount_grosze < 5000000 then 29750
    else 42500
  end
from public.clients as c
where c.id = i.client_id
  and i.paid_on is not null;

-- Niezmiennik: migawka jest wtedy i tylko wtedy, gdy faktura jest zapłacona.
alter table public.invoices
  add constraint invoices_payment_snapshot_check check (
    (paid_on is null) = (paid_rate_bp is null)
    and (paid_on is null) = (paid_compensation_grosze is null)
  );
