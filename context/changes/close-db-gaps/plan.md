# Reguły edycji faktur w bazie (close-db-gaps) — plan implementacji

## Overview

Reguły edycji faktur działają dziś tylko w serwisie, więc właściciel może je obejść, pisząc wprost przez PostgREST.
Jedna nowa migracja z triggerem przenosi do bazy regułę „pól zablokowanych” (`client_id`, `amount_grosze`, `due_date`)
dla faktur zamkniętych oraz przeterminowanych i niewstrzymanych, a także regułę „`paid_on` nie w przyszłości”.
Serwis rozpoznaje nowe wyjątki, a testy `it.fails` z `db-gaps.int.test.ts` stają się zwykłymi testami reguł bazy.

## Current State Analysis

- Reguły 1–3 egzekwuje `updateInvoice` (`src/lib/services/invoices.ts:190-217`): czyta tylko otwarty wiersz
  (zamknięta → `not_found`), sprawdza `isInvoiceLocked` (`src/lib/invoice-lock.ts:8-10`: `paused_on is null` i dzień
  po terminie) dla pól z `lockedFieldsChanged` (`invoice-lock.ts:13-22`: klient, kwota, termin; numer nie), a update
  powtarza warunki (`invoices.ts:210-211`).
- Reguła 4 to tylko zod (`src/lib/invoice-schemas.ts:55-62`) z `todayInPoland` (`src/lib/escalation.ts:19-30`,
  `Europe/Warsaw`), podpięty w `withPaymentInput` (`src/lib/services/invoices-api.ts:70-75`).
- RLS `update` sprawdza tylko właściciela (`supabase/migrations/20261005120000_create_invoices.sql:32-35`).
  4 testy `it.fails` (`src/lib/services/db-gaps.int.test.ts:52-91`) dowodzą luk.
- Wzorzec triggera: `invoices_guard_client_active` (`20261009120000_add_client_deactivated_on.sql:11-66`) — plpgsql,
  security invoker, `set search_path = ''`, `raise exception '<kod>'` (SQLSTATE P0001) jako kontrakt z serwisem.
- `toErrorCode` (`invoices.ts:64-70`) rozpoznaje P0001 tylko dla `client_inactive`; reszta → `unknown` (500).
- Baza nie ma ustawionej strefy czasowej; `current_date` w sesji PostgREST to data UTC.

## Desired End State

Przez PostgREST (z kluczem i sesją właściciela) baza odrzuca:

- zmianę `client_id`, `amount_grosze` lub `due_date` faktury zapłaconej albo anulowanej (komunikat `invoice_closed`),
- zmianę tych pól faktury otwartej, niewstrzymanej i przeterminowanej, tj. `due_date < dzień PL` (komunikat `invoice_locked`),
- wstawienie faktury z `paid_on > dzień PL` i update, który zmienia `paid_on` na datę `> dzień PL` (komunikat `paid_on_in_future`).

Warunki są liczone na stanie `old`, jak w serwisie. Wszystkie dziś legalne ścieżki aplikacji dalej działają, a w
`db-gaps.int.test.ts` nie ma już żadnego `it.fails`. Wyjątek z triggera, który dotrze do serwisu (wyścig o północy),
daje `invoice_locked` → `locked` (409) i `invoice_closed` → `not_found` (404) zamiast 500.

### Key Discoveries:

- Dzień „dziś” musi być równy `todayInPoland`: `(now() at time zone 'Europe/Warsaw')::date`. Z `current_date` (UTC)
  reguła 4 w nocy odrzucałaby legalne „dziś”, a reguła blokady byłaby łagodniejsza od aplikacji (research, Summary).
- Reguła czasu nie może być CHECK-iem (Postgres zakłada niezmienność warunków CHECK), a reguły blokady porównują
  `old` z `new` — oba wymagają triggera.
- `updateInvoice` wysyła wszystkie pola z `toRow` (`invoices.ts:55-62`), także niezmienione, więc trigger musi
  porównywać wartości (`is distinct from`), a nie samą obecność kolumny w `SET`.
- Harness wstawia przeterminowane i zapłacone fixture'y insertem (`src/test/integration/harness.ts:138-169`), więc
  reguły blokady dotyczą tylko `update`; insert sprawdza wyłącznie `paid_on`.
- `scripts/smoke.mjs:120-124` liczy `daysAgo(0)` w UTC; data UTC ≤ data PL, więc trigger jej nie odrzuci.

## What We're NOT Doing

- Numer faktury zamkniętej pozostaje zmienialny przez PostgREST (aplikacja go blokuje, ale nie fałszuje to historii).
- Nie zamrażamy migawki `paid_rate_bp` / `paid_compensation_grosze` zapłaconej faktury.
- Reguła `paid_on` nie sprawdza update'ów, które nie zmieniają `paid_on` (istniejący wiersz z przyszłą datą,
  wpisany ręcznie, zostaje modyfikowalny).
- Nie walidujemy istniejących wierszy (trigger nie sprawdza danych przy utworzeniu); nie edytujemy już zastosowanych
  migracji (nieaktualny komentarz w `20261007120000_add_invoice_paid_on.sql:3` prostuje nowa migracja).
- Brak reguły „wpłata przed wystawieniem” — schemat nie ma daty wystawienia (decyzja z
  `context/archive/2026-10-14-testing-api-state-and-isolation/plan.md:80-84`).
- Nie zmieniamy nazwy pliku `db-gaps.int.test.ts` (odwołują się do niej test-plan i archiwum).

## Implementation Approach

Jeden trigger `before insert or update of client_id, amount_grosze, due_date, paid_on` na `public.invoices` z funkcją,
która w kolejności: (1) na update odrzuca zmianę pól zablokowanych w zamkniętej fakturze, (2) na update odrzuca
zmianę pól zablokowanych w fakturze przeterminowanej i niewstrzymanej, (3) na insert i na update ze zmienionym
`paid_on` odrzuca datę w przyszłości. Serwis dostaje dwie stałe komunikatów i dwie gałęzie w `toErrorCode`.

## Critical Implementation Details

- **Kontrakt dnia**: komentarz `UWAGA` w migracji musi wskazać `todayInPoland` w `src/lib/escalation.ts` jako
  źródło, z którym strefa `Europe/Warsaw` ma się zgadzać (wzór: `20261010130000_add_invoice_payment_snapshot.sql:14-16`).
  Granica blokady to `old.due_date < dzień PL`, czyli odpowiednik `daysOverdue >= 1` / filtra `due_date.gte.today`.
- **Kolumny wyzwalacza**: `update of …` odpala trigger tylko, gdy kolumna jest w `SET`; `cancelInvoice`, `pauseInvoice`,
  `restoreInvoice` i wznowienie jej nie ustawiają, więc ich nie dotyka. Przy cofnięciu wpłaty `new.paid_on is null`,
  więc reguła 3 przepuszcza.

## Phase 1: Trigger w bazie i testy reguł

### Overview

Migracja zamyka luki; testy `db-gaps.int.test.ts` przestają być `it.fails`, pokrywają rozszerzony zakres i dowodzą,
że legalne ścieżki przechodzą.

### Changes Required:

#### 1. Migracja z triggerem

**File**: `supabase/migrations/20261021120000_guard_invoice_locked_fields.sql`

**Intent**: Funkcja `public.invoices_guard_locked_fields()` i trigger o tej samej nazwie egzekwują trzy reguły z
Desired End State. Komentarze po polsku opisują niezmiennik, kontrakt komunikatów z `src/lib/services/invoices.ts`
i powiązanie dnia z `todayInPoland`; jeden wiersz odnotowuje, że reguła „`paid_on` nie w przyszłości” z komentarza
w `add_invoice_paid_on.sql` jest od teraz egzekwowana w bazie.

**Contract**: plpgsql, security invoker, `set search_path = ''`, `before insert or update of client_id, amount_grosze,
due_date, paid_on on public.invoices for each row`. Komunikaty (SQLSTATE P0001): `invoice_closed`, `invoice_locked`,
`paid_on_in_future`. Pole zablokowane = którekolwiek z `client_id`, `amount_grosze`, `due_date` jest
`distinct from` wartości w `old`. Zamknięta = `old.paid_on is not null or old.cancelled_on is not null`. Zablokowana =
otwarta (`old`), `old.paused_on is null`, `old.due_date < (now() at time zone 'Europe/Warsaw')::date`.

#### 2. Testy reguł bazy

**File**: `src/lib/services/db-gaps.int.test.ts`

**Intent**: Zdjąć `.fails` z 4 testów, zmienić tytuły z „known gap: …” na opis reguły, a `describe` i komentarz na
górze pliku na „reguły egzekwowane przez bazę”. Odrzucenia asertują dokładny `error.message` (kontrakt z serwisem),
nie tylko `not.toBeNull()`. Dodać przypadki rozszerzonego zakresu i kontrole legalnych ścieżek. Fixture'y dalej
powstają w `beforeAll`, każdy test na własnym wierszu.

**Contract**: tytuły po angielsku (lessons). Nowe odrzucenia: zmiana `due_date` i `client_id` zapłaconej faktury
(`invoice_closed`; drugi klient z `insertClient`), zmiana `client_id` i `amount_grosze` przeterminowanej
niewstrzymanej (`invoice_locked`), insert z `paid_on` = `2099-01-01` i pełną migawką (`paid_on_in_future`; wprost
przez `a.client.from("invoices").insert`, bo `insertInvoice` rzuca). Nowe kontrole (`error` null): zmiana `paid_on`
zapłaconej na inną przeszłą datę, cofnięcie wpłaty (`paid_on`, migawka → null), zmiana kwoty wstrzymanej
przeterminowanej faktury, update przeterminowanej z nowym numerem i niezmienionymi `client_id`/`amount_grosze`/`due_date`
(kształt zapytania z `toRow`). Istniejące 3 kontrole zostają bez zmian.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Testy integracyjne przechodzą, w `db-gaps.int.test.ts` nie ma `it.fails`: `npm run test:integration`
- Lint i typy przechodzą: `npm run lint` oraz `npx astro check`
- Testy jednostkowe przechodzą: `npm test`

#### Manual Verification:

- Przegląd SQL migracji: warunki na `old`, granica `old.due_date < dzień PL`, `is distinct from`, komentarz `UWAGA` przy strefie czasowej

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przeglądu SQL przed fazą 2.

---

## Phase 2: Mapowanie w serwisie i dokumentacja

### Overview

Wyjątki z triggera, które dotrą do serwisu, dostają kody zgodne z kontraktem API; dokumentacja opisuje nową migrację
i zamknięte luki.

### Changes Required:

#### 1. Mapowanie komunikatów

**File**: `src/lib/services/invoices.ts`

**Intent**: Obok `CLIENT_INACTIVE_MESSAGE` dodać stałe `invoice_locked` i `invoice_closed`, a w `toErrorCode`
mapować P0001 z tymi komunikatami na `locked` i `not_found`. `paid_on_in_future` zostaje `unknown` (przez API
nieosiągalne, bo dzień aplikacji ≤ dzień bazy).

**Contract**: `toErrorCode` — dwie nowe gałęzie przed `return "unknown"`; `InvoiceErrorCode` bez zmian.

#### 2. README

**File**: `README.md`

**Intent**: W akapicie „Supabase Configuration” dopisać zdanie o migracji `guard_invoice_locked_fields`: baza odrzuca
zmianę klienta, kwoty i terminu faktury zamkniętej oraz przeterminowanej i niewstrzymanej, a także `paid_on` w
przyszłości (dzień liczony w `Europe/Warsaw`).

**Contract**: sekcja `## Supabase Configuration`, akapit z listą migracji `invoices`.

#### 3. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: W §6.5 (fazy 2 i 3) zaznaczyć, że luki z `db-gaps.int.test.ts` zamknęła zmiana `close-db-gaps`, a plik
testuje teraz reguły bazy bez `it.fails`.

**Contract**: sekcja `### 6.5 Per-rollout-phase notes`.

### Success Criteria:

#### Automated Verification:

- Lint i typy przechodzą: `npm run lint` oraz `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Testy integracyjne przechodzą: `npm run test:integration`

#### Manual Verification:

- Smoke przechodzi na lokalnym dev serverze: `npm run smoke` (serwer ubity przed i po, zgodnie z lessons)
- W aplikacji: edycja faktury przed terminem, zmiana daty wpłaty w `/history` i cofnięcie wpłaty działają jak dotąd

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie smoke i sprawdzenia w aplikacji.

---

## Testing Strategy

### Unit Tests:

- Bez nowych — mapowanie w `toErrorCode` jest nieosiągalne przez API bez wyścigu; kontrakt komunikatów dowodzą
  asercje `error.message` w testach integracyjnych.

### Integration Tests:

- `db-gaps.int.test.ts`: 4 dawne luki + 5 nowych odrzuceń + 4 nowe kontrole + 3 istniejące kontrole.
- `invoice-transitions.int.test.ts` bez zmian — musi przejść (dozwolone przejścia przez API, w tym zmiana daty wpłaty,
  cofnięcie wpłaty, edycja wstrzymanej przeterminowanej).

### Manual Testing Steps:

1. Zastosuj migrację `npx supabase migration up` na bazie dev z danymi.
2. W `/invoices` edytuj fakturę przed terminem (kwota, termin) — zapis się udaje.
3. W `/history` zmień datę wpłaty zapłaconej faktury, potem cofnij wpłatę — oba działają.

## Migration Notes

- Lokalnie `npx supabase migration up`, nie `db reset` (lessons). Produkcja: migracja idzie w jobie `deploy` po merge
  PR-a, przed kodem; faza 1 nie wymaga zmian w kodzie, więc kolejność jest bezpieczna.
- Istniejące wiersze nie są walidowane. Rollback = nowa migracja `drop trigger` / `drop function` przez PR.

## References

- Research: `context/changes/close-db-gaps/research.md`
- Wzorzec triggera: `supabase/migrations/20261009120000_add_client_deactivated_on.sql:11-66`
- Reguła blokady: `src/lib/invoice-lock.ts:8-22`, `src/lib/services/invoices.ts:190-217`
- Dzień PL: `src/lib/escalation.ts:19-30`
- Test-plan §6.5: `context/foundation/test-plan.md:165-183`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Trigger w bazie i testy reguł

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- [x] 1.2 Testy integracyjne przechodzą, w `db-gaps.int.test.ts` nie ma `it.fails`: `npm run test:integration`
- [x] 1.3 Lint i typy przechodzą: `npm run lint` oraz `npx astro check`
- [x] 1.4 Testy jednostkowe przechodzą: `npm test`

#### Manual

- [x] 1.5 Przegląd SQL migracji: warunki na `old`, granica `old.due_date < dzień PL`, `is distinct from`, komentarz `UWAGA` przy strefie czasowej

### Phase 2: Mapowanie w serwisie i dokumentacja

#### Automated

- [ ] 2.1 Lint i typy przechodzą: `npm run lint` oraz `npx astro check`
- [ ] 2.2 Testy jednostkowe przechodzą: `npm test`
- [ ] 2.3 Testy integracyjne przechodzą: `npm run test:integration`

#### Manual

- [ ] 2.4 Smoke przechodzi na lokalnym dev serverze: `npm run smoke` (serwer ubity przed i po, zgodnie z lessons)
- [ ] 2.5 W aplikacji: edycja faktury przed terminem, zmiana daty wpłaty w `/history` i cofnięcie wpłaty działają jak dotąd
