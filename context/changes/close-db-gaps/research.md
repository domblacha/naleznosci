---
date: 2026-10-21T13:38:01+0200
researcher: Dominik Blacha (z Claude Code)
git_commit: 2f556a4
branch: chore/close-milestone-m1
repository: naleznosci
topic: "Przeniesienie reguł edycji faktur do bazy, by zamknąć luki PostgREST (close-db-gaps)"
tags: [research, supabase, migrations, triggers, invoices, db-gaps, integration-tests]
status: complete
last_updated: 2026-10-21
last_updated_by: Dominik Blacha (z Claude Code)
---

# Research: Przeniesienie reguł edycji faktur do bazy (close-db-gaps)

**Date**: 2026-10-21T13:38:01+0200
**Researcher**: Dominik Blacha (z Claude Code)
**Git Commit**: 2f556a4
**Branch**: chore/close-milestone-m1
**Repository**: naleznosci

## Research Question

Z `change.md`: które reguły egzekwuje dziś tylko `src/lib/services/invoices.ts`, jak dokładnie
brzmią (warunki, granice dat, strefa czasowa), co już jest w bazie i jakie ograniczenia musi
spełnić nowa migracja (trigger/constraint), żeby zamknąć 4 luki z
`src/lib/services/db-gaps.int.test.ts` bez psucia testów kontrolnych i reszty aplikacji:

1. zakaz zmiany `amount_grosze` faktury zapłaconej (`paid_on`),
2. zakaz zmiany `amount_grosze` faktury anulowanej (`cancelled_on`),
3. zakaz zmiany `due_date` faktury przeterminowanej i niewstrzymanej (`paused_on is null`),
4. zakaz `paid_on` w przyszłości.

## Summary

- Wszystkie 4 reguły istnieją dziś wyłącznie w warstwie aplikacji: reguły 1–3 w filtrach i
  pre-checku `updateInvoice` (`src/lib/services/invoices.ts:190-217`, `src/lib/invoice-lock.ts:8-22`),
  reguła 4 w schemacie zod `paymentInputSchema` (`src/lib/invoice-schemas.ts:55-62`), podpiętym
  w `withPaymentInput` (`src/lib/services/invoices-api.ts:70-75`). Polityka RLS `update` sprawdza
  tylko właściciela (`supabase/migrations/20261005120000_create_invoices.sql:32-35`), więc
  właściciel przez PostgREST może zrobić każdą z 4 zmian — co dowodzą 4 testy `it.fails`
  (`db-gaps.int.test.ts:52-91`).
- W bazie są już: CHECK zakresu `paid_on` 2000–2100 (`20261007120000_add_invoice_paid_on.sql:5-7`,
  komentarz w linii 3 wprost mówi, że „nie w przyszłości” wymusza aplikacja), wykluczenie
  zapłacona+anulowana (`20261007180000_add_invoice_cancelled_on.sql:11-12`), wstrzymanie tylko
  otwartej (`20261008120000_add_invoice_paused_on.sql:10-11`), migawka ⇔ zapłacona
  (`20261010130000_add_invoice_payment_snapshot.sql:31-35`) i jeden trigger na `invoices`
  (`invoices_guard_client_active`, `20261009120000_add_client_deactivated_on.sql:43-66`).
- **Decydujące: „dziś” w aplikacji to data w strefie `Europe/Warsaw`** (`todayInPoland`,
  `src/lib/escalation.ts:19-30`), używana zarówno przez blokadę edycji
  (`src/pages/api/invoices/[id].ts:15`), jak i przez regułę `paid_on`
  (`src/lib/services/invoices-api.ts:74`). Lokalna baza nie ma ustawionej strefy w migracjach
  ani w `supabase/config.toml` (grep `timezone` — brak trafień), więc `current_date` w sesji
  PostgREST to data UTC. Między 00:00 a 01:00/02:00 czasu polskiego data UTC jest o dzień
  wcześniejsza: check `paid_on <= current_date` odrzuciłby wtedy legalne `paid_on` = dziś
  (PL), na które aplikacja pozwala. Baza musi liczyć dzień jako
  `(now() at time zone 'Europe/Warsaw')::date` (wniosek z kodu; nie uruchamiano).
- Reguła 4 nie nadaje się na CHECK: wynik zależy od czasu, a Postgres zakłada niezmienność
  warunków CHECK. Pasuje trigger `before insert or update`, wzorem istniejącego
  `invoices_guard_client_active` (plpgsql, `set search_path = ''`, `raise exception '<kod>'`,
  SQLSTATE P0001). Reguły 1–3 też wymagają triggera, bo porównują `old` z `new`.
- Testy kontrolne (`db-gaps.int.test.ts:47-50,62-65,75-82`) i macierz niedozwolonych przejść
  w `invoice-transitions.int.test.ts` (wywołania przez handler: serwis filtruje wiersz, zanim
  dotrze do bazy) nie powinny zmienić wyniku przy triggerze opartym na stanie `old` — szczegóły
  i warunki niżej.

## Detailed Findings

### Reguły w serwisie (stan obecny)

- `updateInvoice` czyta wiersz tylko, gdy `paid_on is null` i `cancelled_on is null`
  (`invoices.ts:196-204`); dla zapłaconej/anulowanej zwraca `not_found` (404) bez dotykania bazy.
  Update powtarza te same filtry (`invoices.ts:210`). Serwis blokuje więc **każdą** edycję
  zamkniętej faktury (numer, klient, kwota, termin), nie tylko `amount_grosze`.
- Blokada edycji: `isInvoiceLocked` = `pausedOn === null && daysOverdue(dueDate, today) >= 1`
  (`invoice-lock.ts:8-10`), czyli faktura jest zablokowana od dnia **po** terminie
  (`today > due_date`). Pola zablokowane to `clientId`, `amountGrosze`, `dueDate`
  (`invoice-lock.ts:13-22`); numer nie. Przy zmianie pól zablokowanych update dodaje
  `or(due_date.gte.today, paused_on.not.is.null)` (`invoices.ts:211`) — warunek liczony na
  bieżącym stanie wiersza (odpowiednik `old` w triggerze).
- `paid_on`: zod odrzuca datę `> today` (PL) (`invoice-schemas.ts:60`). `setInvoicePayment`
  (`invoices.ts:116-173`) sam tej reguły nie sprawdza — polega na walidacji trasy
  (`src/pages/api/invoices/[id]/payment.ts:15-17`).
- `toErrorCode` rozpoznaje P0001 tylko dla komunikatu `client_inactive` (`invoices.ts:64-70`);
  każdy inny wyjątek z triggera trafi do `unknown` (500), chyba że plan doda mapowanie.

### Co egzekwuje baza (stan obecny)

- RLS `invoices_update_authenticated`: tylko `auth.uid() = user_id`
  (`20261005120000_create_invoices.sql:32-35`).
- CHECK-i stanu: `invoices_paid_on_range`, `invoices_cancelled_on_range`,
  `invoices_paused_on_range` (zakres 2000–2100), `invoices_single_closed_state`,
  `invoices_paused_only_open`, `invoices_payment_snapshot_check`
  (migracje `20261007120000`, `20261007180000`, `20261008120000`, `20261010130000`).
- Trigger `invoices_guard_client_active`: `before insert or update of client_id, paid_on,
cancelled_on`, rzuca `client_inactive` (`20261009120000_add_client_deactivated_on.sql:43-66`).
  Komentarz w liniach 11-14 tej migracji ustala konwencję: treść wyjątku jest kontraktem z serwisem,
  funkcje są security invoker, `search_path = ''` z pełnymi nazwami.
- Wersja Postgresa lokalnie: 17 (`supabase/config.toml:36`).

### Warunki, które musi spełnić nowy trigger (wnioski z kodu)

- **Reguły 1–2** (kwota zamkniętej faktury): odrzuć `update`, gdy
  `old.paid_on is not null or old.cancelled_on is not null` i
  `new.amount_grosze is distinct from old.amount_grosze`. Warunek na `old` blokuje także
  jednoczesne „cofnij wpłatę/przywróć + zmień kwotę” w jednym zapytaniu; ścieżki serwisu
  (`setInvoicePayment` reopen `invoices.ts:122-131`, `restoreInvoice` `invoices.ts:237-247`)
  nie zmieniają kwoty, więc ich nie dotyka.
- **Reguła 3** (termin po terminie): odrzuć `update`, gdy `old.paused_on is null`,
  `old.paid_on is null`, `old.cancelled_on is null` (dla zamkniętych patrz otwarte pytanie 1),
  `old.due_date < dzień_PL` i `new.due_date is distinct from old.due_date`. Granica
  `old.due_date < dzień_PL` odpowiada `daysOverdue >= 1` (`invoice-lock.ts:9`) i filtrowi
  `due_date.gte.today` (`invoices.ts:211`).
- **Reguła 4** (`paid_on` w przyszłości): odrzuć `insert` i `update`, gdy
  `new.paid_on > dzień_PL`. Bez `insert` luka zostaje otwarta przez wstawienie od razu
  zapłaconej faktury (fixture `paid` w harnessie robi dokładnie taki insert:
  `src/test/integration/harness.ts:145`). Ograniczenie do zmiany wartości
  (`new.paid_on is distinct from old.paid_on`) chroni istniejące wiersze przed nagłym odrzuceniem
  przy niezwiązanych update'ach (patrz otwarte pytanie 3).
- **dzień_PL** = `(now() at time zone 'Europe/Warsaw')::date`. Z tą definicją baza i aplikacja
  liczą ten sam dzień kalendarzowy; z `current_date` (UTC) reguła 4 byłaby w nocy surowsza od
  aplikacji, a reguła 3 łagodniejsza.

### Wpływ na istniejące testy i skrypty

- `db-gaps.int.test.ts` — kontrole: zmiana kwoty `open-current` (`:47-50`), termin
  `open-current` (`due_date` 2099-12-31, `:62-65`), `paid_on` = `2025-01-10` na
  `open-overdue` (`:75-82`) — żaden warunek z sekcji wyżej ich nie łapie. Po migracji
  4 testy `it.fails` (`:52-60,67-73,84-91`) zaczną przechodzić, więc `it.fails` je zaczerwieni
  — trzeba zdjąć `.fails` i zmienić tytuły „known gap:” (komentarz `:12-14`, test-plan §6.5).
- `invoice-transitions.int.test.ts` — niedozwolone przejścia wołają handler
  (`:185-191`); dla zamkniętej faktury i blokady serwis odpowiada przed zapytaniem
  (404/409), więc triggery nie zmienią statusu. Dozwolone: „edits the amount of a paused overdue
  invoice” (`:204`) — trigger przepuszcza dzięki `old.paused_on is not null`; „edits only the
  number of an overdue invoice” (`:196`) — kwota/termin bez zmian.
- Harness wstawia fixture'y z datami z przeszłości (`harness.ts:111-147`), także przeterminowane
  — insert z przeszłym `due_date` musi zostać dozwolony (reguła 3 dotyczy tylko `update`).
- `scripts/smoke.mjs` liczy `daysAgo(0)` w UTC (`:120-124`) i płaci tą datą
  (`:191,273,345,463`); data UTC jest ≤ dacie PL, więc trigger z dniem PL jej nie odrzuci.

## Code References

- `src/lib/services/db-gaps.int.test.ts:47-91` — 3 testy kontrolne i 4 `it.fails`
- `src/lib/services/invoices.ts:64-70` — mapowanie błędów bazy (P0001 tylko `client_inactive`)
- `src/lib/services/invoices.ts:116-173` — `setInvoicePayment` (bez własnej reguły „nie w przyszłości”)
- `src/lib/services/invoices.ts:190-217` — `updateInvoice`, pre-check blokady i warunek update
- `src/lib/invoice-lock.ts:8-22` — definicja blokady i pól zablokowanych
- `src/lib/invoice-schemas.ts:55-62` — `paymentInputSchema(today)`
- `src/lib/services/invoices-api.ts:70-75` — `withPaymentInput` z `todayInPoland`
- `src/lib/escalation.ts:19-40` — `todayInPoland` (Europe/Warsaw), `daysOverdue`
- `supabase/migrations/20261009120000_add_client_deactivated_on.sql:11-66` — wzorzec triggera i kontraktu komunikatu
- `supabase/migrations/20261007120000_add_invoice_paid_on.sql:3` — jawna notka, że reguła „nie w przyszłości” jest w aplikacji
- `src/test/integration/harness.ts:111-169` — daty i stany fixture'ów
- `scripts/smoke.mjs:120-124` — `daysAgo` w UTC

## Architecture Insights

- Konwencja migracji: plik `YYYYMMDDHHmmss_opis.sql`, komentarze po polsku, funkcje triggerów
  plpgsql security invoker z `set search_path = ''`, wyjątek z krótkim kodem snake_case jako
  kontrakt z serwisem (`20261009120000_add_client_deactivated_on.sql:11-14`). Nowa migracja nie
  tworzy tabeli, więc wymóg RLS z CLAUDE.md jej nie dotyczy.
- README opisuje każdą migrację w akapicie „Supabase Configuration”; nowa migracja powinna dostać
  tam wpis (a komentarz w `add_invoice_paid_on.sql:3` staje się nieaktualny — plików
  zastosowanych migracji się nie edytuje, README sekcja „Migracje”).
- Lokalne stosowanie: `npx supabase migration up`, nie `db reset` (`context/foundation/lessons.md`).
  Produkcja: migracja idzie przez `deploy` po merge PR-a, przed kodem (README → Deployment).
  Istniejące wiersze produkcyjne nie są walidowane przez trigger przy jego utworzeniu.

## Historical Context (from prior changes)

- `context/archive/2026-10-14-testing-api-state-and-isolation/plan.md:80-84` — świadoma decyzja:
  „Nie łatamy luk w bazie”, tylko dowodzimy ich `it.fails`; „`paid_on` przed terminem płatności
  nie jest luką”; reguła „wpłata przed wystawieniem” nie ma odpowiednika w schemacie. Werdykt:
  aktualne — schemat nadal nie ma daty wystawienia (`20261005120000_create_invoices.sql:6-15`).
- Tamże `:350-360` — kontrakt testów luk (fixture'y poza ciałem `it.fails`, test kontrolny na
  stanie dozwolonym). Werdykt: zgodny z obecnym plikiem `db-gaps.int.test.ts`.
- `context/foundation/test-plan.md:171-183` — §6.5 wskazuje luki jako kandydata na „trigger
  blokady / check daty” i każe zdjąć `.fails` po załataniu, bo `it.fails` zaczerwieni CI (job
  `integration` blokuje `deploy`). Werdykt: aktualne; propozycję „check daty” ta analiza zawęża
  do triggera (zależność od czasu).

## Related Research

- `context/archive/2026-10-20-testing-quality-gates/research.md` — CI i job `integration`.
- `context/archive/2026-10-14-testing-api-state-and-isolation/` (plan, plan-review) — powstanie `db-gaps.int.test.ts`.

## Open Questions

1. **Zakres poza 4 testami.** Serwis blokuje każdą edycję zamkniętej faktury, a change.md wymienia
   tylko `amount_grosze`. Przez PostgREST nadal da się zmienić `due_date` i `client_id` zapłaconej
   faktury (zmienia to dni po terminie i odsetki w historii) oraz migawkę `paid_rate_bp` /
   `paid_compensation_grosze` bez zmiany `paid_on`. Także `client_id` przeterminowanej,
   niewstrzymanej faktury jest polem zablokowanym w aplikacji (`invoice-lock.ts:18`), a w bazie nie.
   Decyzja produktowa: zamknąć tylko 4 udokumentowane luki czy całą regułę „pola zablokowane +
   zamknięta faktura”.
2. **Kody błędów.** Czy nowe wyjątki (np. `invoice_locked`, `invoice_closed`, `paid_on_future`)
   mapować w `toErrorCode` na `locked`/`not_found`, czy zostawić `unknown`? Dziś serwis
   odpowiada przed bazą, więc trigger zadziała tylko przy wyścigu albo z pominięciem API.
3. **`paid_on` przy niezwiązanym update.** Ograniczyć regułę 4 do zmiany `paid_on`
   (`is distinct from`) czy sprawdzać każdy zapis? Istniejące wiersze nie mają przyszłych dat,
   jeśli powstały przez API (zod), ale fixture'y/ręczne wpisy mogły je mieć — nie sprawdzano
   danych lokalnych ani produkcyjnych.
4. **Strefa czasowa zakodowana w SQL.** `Europe/Warsaw` powiela `todayInPoland`; warto opisać to
   komentarzem „UWAGA: musi się zgadzać z …” jak w `add_invoice_payment_snapshot.sql:14-16`.
