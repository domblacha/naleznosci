# Odsetki i rekompensata przy przeterminowanych fakturach — plan implementacji

## Overview

Wycinek S-04 z roadmapy (US-01, FR-007, NFR „kwoty do grosza”). Przy każdej fakturze po terminie na liście `/` użytkownik widzi odsetki proste (kwota × roczna stopa × dni po terminie / 365) i rekompensatę z progu kwotowego (0 dla klienta z wyłączonym przełącznikiem). Kwoty są zaokrąglone do grosza (połowa w górę) i liczone z ustawień domyślnych w kodzie, bo ustawienia użytkownika dochodzą dopiero w S-10. Wyliczenia to czysta funkcja z testami, bo konsumują je S-05 (ponaglenie) i S-06 (odsetki do dnia wpłaty).

## Current State Analysis

- Liczba dni po terminie jest już liczona w czasie polskim: `daysOverdue(dueDate, today)` (`src/lib/escalation.ts:37-39`). Termin 10.10 i dziś 13.10 dają 3 dni (11, 12 i 13 października), czyli dokładnie okres „od dnia po terminie do dziś” z FR-007. `groupInvoices` dokłada `daysOverdue` do każdej pozycji (`src/lib/escalation.ts:51-73`).
- Progi dni są stałą `DEFAULT_THRESHOLDS` przekazywaną jako parametr (`src/lib/escalation.ts:1-3`). Ten sam wzorzec pasuje do stopy i progów rekompensaty.
- Kwota faktury to `amount_grosze bigint` w zakresie 1–99 999 999 999 (`supabase/migrations/20261005120000_create_invoices.sql:11`). W TS to `amountGrosze: number` (`src/types.ts:20`).
- Przełącznik rekompensaty istnieje na kliencie: `clients.charge_compensation boolean not null default true` (`supabase/migrations/20261003120000_create_clients.sql:8`), mapowany na `Client.chargeCompensation` (`src/lib/services/clients.ts:7,26`). `Invoice` go nie ma, a serwis faktur dołącza tylko `clients(name)` (`src/lib/services/invoices.ts:7,21,28`).
- Lista na `/` to wyspa `InvoicesManager` z tabelą o 5 kolumnach w kontenerze `max-w-3xl` (`src/components/invoices/InvoicesManager.tsx:92-113`, `src/pages/index.astro:33`). Kwoty formatuje `Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })` z groszy (`InvoicesManager.tsx:27-31`).
- `POST /api/invoices` zwraca fakturę przez ten sam `COLUMNS` co lista (`src/lib/services/invoices.ts:58-62`). Rozszerzenie `COLUMNS` obejmie więc też fakturę dodaną w dialogu.
- `/dev/ui` pokazuje `InvoicesManager` z przykładowymi fakturami budowanymi przez `sampleInvoice(...)` (`src/components/dev/KitchenSinkForms.tsx:36-60`).

## Desired End State

Na `/` tabela każdej grupy ma dwie nowe kolumny wyrównane do prawej: „Odsetki” i „Rekompensata”. Faktury po terminie (od 1 dnia, także z grupy „Po terminie, przed etapem 1”) mają kwoty w PLN do grosza. Bieżące (0 dni lub termin w przyszłości) mają „—” w obu kolumnach. Klient z wyłączonym przełącznikiem ma rekompensatę „0,00 zł”. Kontener strony ma `max-w-5xl`.

Przykład: faktura na 1 234,56 zł, 40 dni po terminie, klient z rekompensatą ma odsetki 18,60 zł (123 456 gr × 13,75% × 40 / 365 = 1 860,30 gr → 1 860 gr) i rekompensatę 170,00 zł (kwota ≤ 5 000 zł).

Weryfikacja: Vitest pokrywa wzór, zaokrąglenie, granice progów i największą kwotę. Ręcznie sprawdzamy listę i `/dev/ui`. Po merge kod jest na produkcji.

### Key Discoveries:

- Iloczyn `amountGrosze × stopa_pb × dni` przekracza `Number.MAX_SAFE_INTEGER` (99 999 999 999 × 1375 × 3650 ≈ 5·10¹⁷ > 9·10¹⁵). Wyliczenie musi iść na `BigInt`, a liczbą wraca dopiero wynik w groszach (maks. ~1,4·10¹¹, bezpieczny).
- Ustawowe odsetki za opóźnienie w transakcjach handlowych w II półroczu 2026 wynoszą 13,75% (stopa referencyjna NBP 3,75% + 10 pp). Rekompensata z art. 10 ustawy o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych to 40/70/100 EUR, z granicami: kwota ≤ 5 000 zł; > 5 000 zł i < 50 000 zł; ≥ 50 000 zł.
- Migracja nie jest potrzebna. Przełącznik klienta dochodzi przez `clients(name, charge_compensation)` w istniejącym zapytaniu, a ustawienia domyślne są stałą w kodzie. Zmiana przełącznika klienta działa wstecz na wszystkie jego otwarte faktury, zgodnie z zasadą FR-009 „zmiana działa natychmiast na otwarte faktury”.

## What We're NOT Doing

- Tabela i ekran ustawień (S-10). Stopa i progi to stała `DEFAULT_CHARGE_SETTINGS` przekazywana do funkcji jako parametr.
- Przeliczanie rekompensaty z EUR po kursie NBP z miesiąca przed terminem. Kwoty progów to stałe w PLN (przeliczone raz po ok. 4,25 zł/EUR), zgodnie z PRD („3 progi kwotowe w PLN”).
- Zmiana stopy w czasie (osobne stopy dla półroczy). PRD Non-Goals: jedna stopa na cały okres opóźnienia.
- Odsetki do dnia wpłaty i zamrażanie kwot (S-06). Funkcja przyjmuje liczbę dni, więc S-06 poda dni do daty wpłaty bez zmiany wzoru.
- Kolumna „Razem” i sumy pod grupami. Sumy per klient policzy ponaglenie (S-05).
- Grupa „wstrzymane” (S-08). Odsetki wstrzymanych faktur rosną dalej, ale tę grupę dodaje S-08.
- Zmiana kroków smoke. Kwoty zależą od daty uruchomienia, a pokrywają je testy jednostkowe. Smoke pozostaje regresją listy i API.
- Migracja bazy.

## Implementation Approach

Kolejność jak w S-03, od rdzenia na zewnątrz. Najpierw czysty moduł wyliczeń z testami, bez bazy i UI, bo poprawność kwot jest guardrailem z Kryteriów sukcesu PRD. Potem dane i widok: typ `Invoice` dostaje przełącznik klienta, a wyspa liczy kwoty dla każdego wiersza z `daysOverdue`, które już zwraca `groupInvoices`. Wyliczenie działa w wyspie, więc faktura dodana w dialogu od razu pokazuje kwoty bez przeładowania. Na koniec PR i potok F-01, który przy braku migracji tylko wdraża kod.

## Critical Implementation Details

- **Bez liczb zmiennoprzecinkowych.** Stopa jest zapisana w punktach bazowych (13,75% = 1375). Odsetki: `n = amountGrosze × rateBp × days` jako `BigInt`, mianownik `365 × 10 000 = 3 650 000`, zaokrąglenie połowa w górę `(2n + den) / (2·den)` (dzielenie całkowite; wartości są nieujemne). Nigdy `amount * 0.1375 * days / 365` na `number`.

## Phase 1: Reguła wyliczeń

### Overview

Czysty moduł, który dla kwoty w groszach, liczby dni po terminie, przełącznika klienta i ustawień zwraca odsetki i rekompensatę w groszach. Do tego testy wzoru, zaokrąglenia, granic progów i największej kwoty.

### Changes Required:

#### 1. Moduł wyliczeń

**File**: `src/lib/charges.ts` (nowy)

**Intent**: Jedno źródło prawdy dla kwot należnych od klienta. Korzystają z niego lista (S-04), ponaglenie (S-05) i historia zapłaconych (S-06), a S-10 podmieni tylko ustawienia.

**Contract**:
- `interface CompensationTier { maxAmountGrosze: number | null; inclusive: boolean; compensationGrosze: number }` (lub równoważny kształt), `interface ChargeSettings { annualRateBp: number; compensationTiers: readonly [CompensationTier, CompensationTier, CompensationTier] }`.
- `DEFAULT_CHARGE_SETTINGS`: `annualRateBp: 1375`. Progi:
  - kwota ≤ 500 000 gr (5 000 zł) → 17 000 gr (170,00 zł);
  - kwota > 500 000 gr i < 5 000 000 gr → 29 750 gr (297,50 zł);
  - kwota ≥ 5 000 000 gr (50 000 zł) → 42 500 gr (425,00 zł).
  Komentarz przy stałej: źródło (odsetki handlowe II półrocze 2026, art. 10 ustawy: 40/70/100 EUR po ok. 4,25 zł) i to, że S-10 przeniesie je do ustawień.
- `interestGrosze(amountGrosze: number, days: number, annualRateBp = DEFAULT_CHARGE_SETTINGS.annualRateBp): number`. `days ≤ 0` → 0. Inaczej wzór z sekcji Critical Implementation Details.
- `compensationGrosze(amountGrosze: number, days: number, chargeCompensation: boolean, tiers = DEFAULT_CHARGE_SETTINGS.compensationTiers): number`. `days ≤ 0` lub `!chargeCompensation` → 0. Inaczej kwota pierwszego pasującego progu.
- Granice progów: dokładnie 5 000,00 zł trafia do progu 1, a dokładnie 50 000,00 zł do progu 3 (zgodnie z ustawą).

#### 2. Testy wyliczeń

**File**: `src/lib/charges.test.ts` (nowy)

**Intent**: Przypiąć wzór i granice, bo cichy błąd zaokrąglenia przechodzi potem do ponagleń.

**Contract**: przypadki co najmniej:
- `interestGrosze` z domyślną stopą: `(123456, 40)` → 1860; `(100000, 1)` → 38; `(100000, 365)` → 13750; `(100000, 0)` → 0; `(100000, -3)` → 0.
- Zaokrąglenie połowa w górę ze stopą 1000 pb: `(1825, 1, 1000)` → 1 (dokładnie 0,5 gr); `(1824, 1, 1000)` → 0.
- Największa kwota bez utraty precyzji: `(99999999999, 3650)` → 137499999999.
- `compensationGrosze` przy `days = 1` i włączonym przełączniku: 100 → 17000; 500000 → 17000; 500001 → 29750; 4999999 → 29750; 5000000 → 42500; 99999999999 → 42500.
- `compensationGrosze`: wyłączony przełącznik → 0; `days = 0` → 0.

### Success Criteria:

#### Automated Verification:

- Testy wyliczeń i reguły przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- Przegląd tabeli przypadków w teście: stopa 13,75%, progi 170,00 / 297,50 / 425,00 zł, 5 000 zł w progu 1, 50 000 zł w progu 3, połowa grosza w górę

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Kwoty na liście

### Overview

Faktura niesie przełącznik rekompensaty klienta, a lista na `/` pokazuje kolumny „Odsetki” i „Rekompensata” w szerszym kontenerze. `/dev/ui` pokazuje nowe kolumny.

### Changes Required:

#### 1. Typ faktury

**File**: `src/types.ts`

**Intent**: Wyspa potrzebuje przełącznika klienta, żeby policzyć rekompensatę bez dodatkowego zapytania.

**Contract**: `Invoice` dostaje `clientChargesCompensation: boolean`. `InvoiceInput` bez zmian.

#### 2. Serwis faktur

**File**: `src/lib/services/invoices.ts`

**Intent**: Lista i odpowiedź `POST` zwracają przełącznik klienta.

**Contract**: `COLUMNS` dołącza `clients(name, charge_compensation)`. `InvoiceRow.clients` to `{ name: string; charge_compensation: boolean } | null`, a `toInvoice` mapuje `clientChargesCompensation` (brak klienta → `false`). Endpoint `POST /api/invoices` zmienia się tylko przez to pole w odpowiedzi.

#### 3. Wyspa listy

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Pokazać kwoty przy każdej fakturze po terminie.

**Contract**:
- Po kolumnie „Dni po terminie” dochodzą „Odsetki” i „Rekompensata” (`TableHead`/`TableCell` z `text-right`, jak „Kwota”).
- Dla `invoice.daysOverdue ≥ 1`: `formatAmount(interestGrosze(invoice.amountGrosze, invoice.daysOverdue))` i `formatAmount(compensationGrosze(invoice.amountGrosze, invoice.daysOverdue, invoice.clientChargesCompensation))`. Wyłączony przełącznik pokazuje „0,00 zł”.
- Dla grupy `current`: „—” w obu kolumnach, jak w „Dni po terminie”.
- Wyliczenia z ustawień domyślnych (`DEFAULT_CHARGE_SETTINGS`), bez nowych propsów.

#### 4. Strona `/`

**File**: `src/pages/index.astro`

**Intent**: Zmieścić 7 kolumn.

**Contract**: kontener `<main>` z `max-w-3xl` na `max-w-5xl`. Bez innych zmian.

#### 5. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: `/dev/ui` pokazuje nowe kolumny, także przypadek klienta bez rekompensaty (wymóg z `CLAUDE.md`).

**Contract**: `sampleInvoice` ustawia `clientChargesCompensation` z przykładowego klienta. Przynajmniej jeden przykładowy klient ma `chargeCompensation: false` i fakturę po terminie, a jedna faktura ma kwotę powyżej 5 000 zł.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke`

#### Manual Verification:

- Faktura 1 234,56 zł z terminem 40 dni temu pokazuje odsetki 18,60 zł i rekompensatę 170,00 zł
- Faktura bieżąca (termin dziś lub później) ma „—” w kolumnach odsetek i rekompensaty, a faktura z grupy „Po terminie, przed etapem 1” ma kwoty
- Klient z wyłączonym przełącznikiem ma rekompensatę „0,00 zł”, a odsetki są naliczone
- Faktura dodana w dialogu od razu pokazuje kwoty, a po odświeżeniu są takie same
- Tabela mieści się w `max-w-5xl` bez przewijania na desktopie; `/dev/ui` pokazuje kolumny w trybie jasnym i ciemnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wdrożenie

### Overview

Dokumentacja, PR i wdrożenie przez potok F-01. Zmiana nie ma migracji, więc `db push` nic nie stosuje, a `wrangler deploy` wdraża kod. Na końcu weryfikacja na produkcji.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Opisać nowy stan listy.

**Contract**: w tabeli tras wiersz `/` opisuje listę otwartych faktur z odsetkami i rekompensatą.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Zamknąć otwarte pytanie z S-04.

**Contract**: przy Unknown „Jakie są domyślne wartości rocznej stopy odsetek i 3 progów kwotowych rekompensaty…” dopisać rozstrzygnięcie: 13,75% (odsetki handlowe II półrocze 2026), progi 170,00 / 297,50 / 425,00 zł z granicami ≤ 5 000 zł / > 5 000 i < 50 000 zł / ≥ 50 000 zł (decyzja z planowania 2026-10-06). Statusów nie ruszamy; to robią `/10x-implement` i `/10x-archive`.

#### 3. PR i wdrożenie

**Intent**: Zmiana trafia na produkcję wyłącznie przez gałąź i PR (README §Deployment).

**Contract**:
- gałąź `feat/interest-and-compensation` i PR;
- merge po zielonym `checks`;
- job `deploy` przechodzi (`db push` bez nowych migracji, potem `wrangler deploy`);
- bez ręcznego `wrangler deploy`.

### Success Criteria:

#### Automated Verification:

- Job `checks` na PR jest zielony: `gh pr checks`
- Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1`

#### Manual Verification:

- Na produkcji faktura po terminie pokazuje odsetki i rekompensatę zgodne z wzorem, a bieżąca ma „—”

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/charges.test.ts`: wzór odsetek na typowych kwotach, 0 i ujemne dni, zaokrąglenie dokładnie połowy grosza w górę i 0,4997 gr w dół, największa kwota z bazy przez 10 lat bez utraty precyzji, granice progów rekompensaty po obu stronach 5 000 zł i 50 000 zł, wyłączony przełącznik, faktura bieżąca.
- `src/lib/escalation.test.ts` bez zmian (regresja liczenia dni).

### Integration Tests:

- `scripts/smoke.mjs` bez zmian: potwierdza, że rozszerzone zapytanie `clients(name, charge_compensation)` nie psuje listy, `POST /api/invoices` ani izolacji kont.

### Manual Testing Steps:

1. Dodaj klienta z rekompensatą i fakturę 1 234,56 zł z terminem 40 dni temu: odsetki 18,60 zł, rekompensata 170,00 zł.
2. Dodaj fakturę 5 000,00 zł i 5 000,01 zł po terminie: rekompensata 170,00 zł i 297,50 zł; fakturę 50 000,00 zł: 425,00 zł.
3. Dodaj fakturę z terminem dziś: „—” w obu kolumnach. Z terminem wczoraj: kwoty widoczne w grupie „Po terminie, przed etapem 1”.
4. Na `/clients` wyłącz rekompensatę klientowi, wróć na `/`: jego faktury mają rekompensatę 0,00 zł, odsetki bez zmian.
5. Odśwież stronę: kwoty się nie zmieniają.

## Performance Considerations

Mała skala (PRD: `data_volume: small`). Dwa działania na `BigInt` na wiersz w wyspie; bez memoizacji poza istniejącym `useMemo` dla grup. Zapytanie bez zmian poza jedną kolumną z dołączonej tabeli.

## Migration Notes

Brak migracji. Rollback to wycofanie Workera (README §Rollback) i revert w PR; schemat bazy się nie zmienia.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (US-01, FR-007, FR-009, Business Logic, NFR)
- Poprzedni wycinek (wzorzec): `context/archive/2026-10-05-invoice-escalation-list/plan.md`
- Reguła dni i grup: `src/lib/escalation.ts:37-73`
- Serwis faktur: `src/lib/services/invoices.ts:7-34`
- Wyspa listy: `src/components/invoices/InvoicesManager.tsx:27-113`
- Kitchen sink: `src/components/dev/KitchenSinkForms.tsx:36-60`
- Odsetki handlowe 2026: https://dziennikprawniczy.pl/ile-wynosza-odsetki-ustawowe-za-opoznienie-w-transakcjach-handlowych-lipiec-grudzien-2026/
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła wyliczeń

#### Automated

- [x] 1.1 Testy wyliczeń i reguły przechodzą: `npm test` — 4e92019
- [x] 1.2 Lint przechodzi: `npm run lint` — 4e92019
- [x] 1.3 Typy przechodzą: `npx astro check` — 4e92019

#### Manual

- [x] 1.4 Przegląd tabeli przypadków w teście: stopa 13,75%, progi 170,00 / 297,50 / 425,00 zł, 5 000 zł w progu 1, 50 000 zł w progu 3, połowa grosza w górę — 4e92019

### Phase 2: Kwoty na liście

#### Automated

- [x] 2.1 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint` — 148d08f
- [x] 2.2 Typy przechodzą: `npx astro check` — 148d08f
- [x] 2.3 Testy przechodzą: `npm test` — 148d08f
- [x] 2.4 Build przechodzi: `npm run build` — 148d08f
- [x] 2.5 Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke` — 148d08f

#### Manual

- [x] 2.6 Faktura 1 234,56 zł z terminem 40 dni temu pokazuje odsetki 18,60 zł i rekompensatę 170,00 zł — 148d08f
- [x] 2.7 Faktura bieżąca (termin dziś lub później) ma „—” w kolumnach odsetek i rekompensaty, a faktura z grupy „Po terminie, przed etapem 1” ma kwoty — 148d08f
- [x] 2.8 Klient z wyłączonym przełącznikiem ma rekompensatę „0,00 zł”, a odsetki są naliczone — 148d08f
- [x] 2.9 Faktura dodana w dialogu od razu pokazuje kwoty, a po odświeżeniu są takie same — 148d08f
- [x] 2.10 Tabela mieści się w `max-w-5xl` bez przewijania na desktopie; `/dev/ui` pokazuje kolumny w trybie jasnym i ciemnym — 148d08f

### Phase 3: Wdrożenie

#### Automated

- [x] 3.1 Job `checks` na PR jest zielony: `gh pr checks` — 058c626
- [x] 3.2 Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1` — fe4b1ef

#### Manual

- [x] 3.3 Na produkcji faktura po terminie pokazuje odsetki i rekompensatę zgodne z wzorem, a bieżąca ma „—” — 058c626
