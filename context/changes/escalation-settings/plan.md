# Ustawienia reguły eskalacji — Implementation Plan

## Overview

S-10 z roadmapy (FR-009). Użytkownik ustawia na stronie `/settings` dni 4 progów eskalacji, roczną stopę odsetek i 3 kwoty rekompensaty w PLN. Zmiana działa od razu na etapy i kwoty wszystkich otwartych faktur, także na ponaglenia. Zapłacone faktury dostają przy wpłacie **niezmienną migawkę** stopy i kwoty rekompensaty, więc zmiana ustawień (ani przełącznika „naliczaj rekompensatę” u klienta) nie przepisuje już rozliczonej historii.

## Current State Analysis

- Progi to stała `DEFAULT_THRESHOLDS = [3, 7, 14, 30]` (`src/lib/escalation.ts:3`), a stopa i progi rekompensaty to `DEFAULT_CHARGE_SETTINGS` (`src/lib/charges.ts:23-33`). Czyste funkcje przyjmują je jako parametry domyślne: `groupInvoices` (`escalation.ts:61`), `interestGrosze`/`compensationGrosze` (`charges.ts:40,49`), `chargesAsOf` (`charges.ts:72`), `buildClientReminders` (`src/lib/reminder.ts:32-36`).
- Miejsca wywołań nie przekazują ustawień: `InvoicesManager.tsx:21` (etykiety grup z `DEFAULT_THRESHOLDS`), `:46` (`groupInvoices`), `:170,176` (odsetki i rekompensata), `RemindersSection.tsx:16`, `PaymentDialog.tsx:94` (podgląd), `PaidInvoicesManager.tsx:96` (historia) i `KitchenSinkForms.tsx:95,451,475`.
- **Historia liczy kwoty na bieżąco.** Faktura nie przechowuje stopy ani kwot. `/history` liczy `chargesAsOf(invoice, paidOn)` przy każdym renderze ze stałej i z bieżącego `clients.charge_compensation`. S-06 świadomie odłożyło decyzję o zamrożeniu do S-10 (`context/archive/2026-10-07-mark-invoice-paid/plan.md:36`, `plan-brief.md:24,64`). Bez zmian w S-10 zmiana stopy przepisałaby odsetki rozliczonych faktur: dla 10 000 zł i 30 dni zamiast 113,01 zł przy 13,75% pokazałaby 92,47 zł przy 11,25%. Ten sam efekt już dziś daje przełączenie flagi klienta.
- Jedna funkcja `setInvoicePayment` (`src/lib/services/invoices.ts:107-125`) obsługuje oznaczenie jako zapłacona i zmianę daty (`PUT /api/invoices/[id]/payment`) oraz cofnięcie (`DELETE`). Nie rozróżnia dziś „oznacz” od „zmień datę”.
- Uwagi z przeglądu S-04 (`context/archive/2026-10-06-interest-and-compensation/reviews/impl-review.md:36-47`): F1, czyli argumenty `charges.ts` muszą być liczbami całkowitymi (walidacja zod `int()` w S-10), oraz F2, czyli typ progów nie wymusza otwartego ostatniego progu, a fallback `?? tiers[tiers.length - 1]` maskuje błąd.
- Anulowane faktury nie pokazują kwot (`CancelledInvoicesSection`), więc migawka ich nie dotyczy. Blokada edycji faktury (`src/lib/invoice-lock.ts`) zależy od terminu, nie od progów.

## Desired End State

- Topbar ma link „Ustawienia” prowadzący do chronionej strony `/settings`. Formularz zawiera 4 progi dni (liczby całkowite), roczną stopę w % z dokładnością do 0,01 i 3 kwoty rekompensaty w zł (dla kwoty faktury ≤ 5 000 zł, > 5 000 zł i < 50 000 zł oraz ≥ 50 000 zł). Ma przyciski „Zapisz” i „Przywróć domyślne”, który wypełnia formularz wartościami z kodu bez zapisu.
- Użytkownik bez zapisanych ustawień widzi i używa wartości domyślnych (3/7/14/30, 13,75%, 170 / 297,50 / 425 zł).
- Po zapisie `/` (grupy etapów i ich etykiety, odsetki, rekompensata, ponaglenia) oraz podgląd w dialogu „Zapłacona” liczą się z ustawień użytkownika.
- Oznaczenie faktury jako zapłaconej zapisuje na niej stopę (bp) i kwotę rekompensaty progu. Kwota rekompensaty wynosi 0, gdy klient ma wyłączone naliczanie. `/history` i podgląd w „Zmień datę” liczą się wyłącznie z migawki. Zmiana daty wpłaty zmienia tylko liczbę dni, a rekompensata jest pokazywana tylko przy wpłacie po terminie. „Przywróć do otwartych” czyści migawkę.
- Zapłacone faktury sprzed tej zmiany mają migawkę z obecnych wartości domyślnych, więc ich kwoty w historii się nie zmieniają.

### Key Discoveries:

- Granice progów rekompensaty (5 000 / 50 000 zł i flagi `inclusive`) są ustawowe i zostają w kodzie. Konfigurowalne są tylko 3 kwoty, więc ostatni próg jest otwarty z definicji (F2).
- Migawka rekompensaty to **kwota progu**, a nie wynik zależny od dni. Dzięki temu zmiana daty wpłaty z „przed terminem” na „po terminie” (i odwrotnie) daje poprawny wynik bez ponownego czytania ustawień.
- Wzorzec warunkowego update po odczycie wiersza: `updateInvoice` (`src/lib/services/invoices.ts:131-160`).

## What We're NOT Doing

- Konfiguracja granic progów rekompensaty (5 000 / 50 000 zł): zdecydowano „tylko 3 kwoty”.
- Wersjonowanie ustawień z datami obowiązywania i kilka stóp na jeden okres opóźnienia (PRD Non-Goal).
- Odświeżanie migawki przy zmianie daty wpłaty: zdecydowano „zachować zamrożone”.
- Migawka dla faktur anulowanych (nie pokazują kwot).
- Zmiana liczby etapów (stale 4, FR-009).
- Trigger bazodanowy liczący migawkę: logika progów zostaje w `charges.ts`.
- Ręczna korekta wyliczonych kwot (PRD: poza MVP).

## Implementation Approach

Ustawienia trzymamy w tabeli `user_settings` z jednym wierszem na użytkownika, zapisywanym upsertem. Brak wiersza oznacza wartości domyślne z kodu, a dotychczasowe stałe stają się tymi wartościami domyślnymi. Serwer czyta ustawienia na stronach `/` i `/history` i przekazuje je do wysp jako props, a czyste funkcje dostają je jako parametry, które już przyjmują. Migawka to dwie kolumny na `invoices` wypełniane w `setInvoicePayment` tylko przy przejściu „otwarta → zapłacona”. Kolejność faz chroni historię: najpierw powstają ustawienia, potem migawka, a dopiero potem ustawienia zaczynają wpływać na wyliczenia i dostają ekran.

## Critical Implementation Details

- **Oznaczenie a zmiana daty w `setInvoicePayment`**: najpierw odczyt faktury z flagą klienta. Jeśli `paid_on` jest `null`, wylicz migawkę z ustawień użytkownika i wykonaj update z `.is("paid_on", null)`. Jeśli faktura jest już zapłacona, aktualizuj tylko `paid_on` z `.not("paid_on", "is", null)`. Zero zwróconych wierszy (równoległa zmiana) daje `not_found`, jak dziś. Cofnięcie ustawia `paid_on`, `paid_rate_bp` i `paid_compensation_grosze` na `null`.
- **Okno między migracją a wdrożeniem kodu**: constraint „migawka jest wtedy i tylko wtedy, gdy `paid_on`” sprawia, że stary kod po migracji fazy 2 nie oznaczy faktury jako zapłaconej (naruszenie constraintu). Potok wdraża kod sekundy po `db push`. Gdy `wrangler deploy` padnie, trzeba wykonać „Re-run failed jobs” (README §Migracje). Kolejność w migracji: dodanie kolumn, backfill, constraint.
- **Backfill powiela w SQL wartości domyślne** (1375 bp, progi 500 000 / 5 000 000 groszy z `inclusive` jak w `DEFAULT_CHARGE_SETTINGS`, kwoty 17 000 / 29 750 / 42 500 i 0 dla `charge_compensation = false`). Komentarz w migracji i przy stałej wskazuje, że muszą się zgadzać w chwili migracji.

## Phase 1: Model ustawień i API

### Overview

Tabela ustawień z RLS, typy, walidacja, serwis z wartościami domyślnymi i endpoint zapisu. Domknięcie F1/F2 w `charges.ts`. Po tej fazie ustawienia da się zapisać przez API, ale nic ich jeszcze nie czyta.

### Changes Required:

#### 1. Migracja `user_settings`

**File**: `supabase/migrations/20261010120000_create_user_settings.sql`

**Intent**: Jeden wiersz ustawień na użytkownika z ograniczeniami zgodnymi z walidacją aplikacji.

**Contract**: `public.user_settings`: `user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade`; `threshold_1`…`threshold_4 integer not null` z checkiem `1 <= threshold_1 < threshold_2 < threshold_3 < threshold_4 <= 365`; `annual_rate_bp integer not null check (between 0 and 10000)`; `compensation_1_grosze`…`compensation_3_grosze bigint not null check (between 0 and 10000000)`; `updated_at timestamptz not null default now()`. RLS włączony z politykami per (operacja, rola), jak w `create_clients`: `select`/`insert`/`update` dla `authenticated` z warunkiem właściciela, `delete` dla `authenticated` z `using (false)` i wszystko dla `anon` z `false`.

#### 2. Typy i wartości domyślne

**File**: `src/types.ts`, `src/lib/charges.ts`, `src/lib/escalation.ts`

**Intent**: Jeden typ ustawień dla UI i serwera. Typ progów wymusza otwarty ostatni próg (F2), a moduł dokumentuje wymóg liczb całkowitych (F1).

**Contract**:
- `src/types.ts`: `EscalationSettings { thresholds: EscalationThresholds; annualRateBp: number; compensationGrosze: readonly [number, number, number] }` oraz `EscalationSettingsInput` z polami tekstowymi formularza.
- `src/lib/charges.ts`: typ `compensationTiers` zawężony do `readonly [BoundedTier, BoundedTier, { maxAmountGrosze: null; inclusive: false; compensationGrosze: number }]`. Usunięcie fallbacku `?? tiers[tiers.length - 1]` i komentarza „S-10 przeniesie”. Nowa `chargeSettingsFrom(settings: EscalationSettings): ChargeSettings` składa progi ze stałych granic i kwot użytkownika. Komentarz modułu mówi, że argumenty muszą być liczbami całkowitymi, a test `expect(() => interestGrosze(100.5, 1)).toThrow()` przypina to zachowanie.
- `DEFAULT_ESCALATION_SETTINGS: EscalationSettings` (w `charges.ts` albo nowym `src/lib/settings.ts`) zbudowane z `DEFAULT_THRESHOLDS` i `DEFAULT_CHARGE_SETTINGS`, tak żeby `chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)` było równe `DEFAULT_CHARGE_SETTINGS` (test).

#### 3. Walidacja

**File**: `src/lib/settings-schemas.ts` (+ `settings-schemas.test.ts`)

**Intent**: Parsowanie tekstu formularza na wartości całkowite bez liczb zmiennoprzecinkowych, z komunikatami po polsku przy polach.

**Contract**: `settingsInputSchema: z.ZodType<EscalationSettings>`. Progi to liczby całkowite 1–365, a każdy kolejny musi być większy od poprzedniego, z błędem przy drugim polu pary. Stopę `"13,75"` / `"13.75"` parsuje się na 1375 bp (0–100, najwyżej 2 miejsca po przecinku). Kwoty „1 234,56” parsuje się na grosze (0–100 000 zł) jak `parseAmountGrosze` w `invoice-schemas.ts`, ale z dopuszczeniem zera. Wspólny parser kwoty warto wydzielić, jeśli nie komplikuje to `invoice-schemas.ts`. Testy obejmują progi nierosnące, próg 0, stopę 13,755 i ujemną, kwotę 0 (dozwolona) oraz zamianę na grosze.

#### 4. Serwis i API

**File**: `src/lib/services/settings.ts`, `src/pages/api/settings.ts`

**Intent**: Odczyt z wartościami domyślnymi i zapis upsertem.

**Contract**:
- `getSettings(supabase): Promise<EscalationSettings>`: `maybeSingle()`, a gdy wiersza nie ma, zwraca `DEFAULT_ESCALATION_SETTINGS`. Błąd zapytania rzuca wyjątek, jak `listOpenInvoices`.
- `saveSettings(supabase, settings): Promise<EscalationSettings>`: `upsert` po `user_id`, ustawia `updated_at`.
- `PUT /api/settings`: `prerender = false`, sesja wymagana (401 jak w innych API), body walidowane `settingsInputSchema` (400 `invalid_input` z `fieldErrors`, wzorem `withInvoiceInput`), odpowiedź 200 `{ settings }`.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokrycie API ustawień i izolacji użytkowników.

**Contract**: grupa `settingsSteps()` składająca się z kroków: `PUT /api/settings` bez sesji → 401; nierosnące progi → 400 z `fieldErrors`; poprawne ustawienia → 200 z wartościami w bp i groszach; użytkownik B nie widzi ustawień A (kolejny PUT B nie zmienia A, sprawdzone przez odpowiedź A po ponownym zapisie). Na końcu grupa przywraca wartości domyślne, żeby nie wpływać na inne grupy.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą, w tym `settings-schemas.test.ts` i nowe testy `charges.test.ts`: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi, łącznie z grupą `settingsSteps`: `npm run smoke`

#### Manual Verification:

- W Supabase Studio wiersz `user_settings` z nierosnącymi progami jest odrzucany przez check

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Zamrożenie kwot zapłaconych faktur

### Overview

Migawka stopy i kwoty rekompensaty na fakturze, zapis przy oznaczeniu jako zapłacona, a historia i dialog „Zmień datę” liczone z migawki. Po tej fazie historia nie zależy już od ustawień ani od flagi klienta.

### Changes Required:

#### 1. Migracja migawki

**File**: `supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql`

**Intent**: Kolumny migawki, uzupełnienie istniejących zapłaconych faktur wartościami, które dziś widać w historii, i niezmiennik spójności.

**Contract**: `paid_rate_bp integer null check (between 0 and 10000)`, `paid_compensation_grosze bigint null check (>= 0)`. Backfill dla `paid_on is not null`: stopa 1375, a kwota z progu wg `amount_grosze` (`<= 500000` → 17000, `< 5000000` → 29750, w pozostałych przypadkach 42500) albo 0, gdy `clients.charge_compensation = false` (złączenie po `client_id`). Następnie constraint `invoices_payment_snapshot_check`: `(paid_on is null) = (paid_rate_bp is null) and (paid_on is null) = (paid_compensation_grosze is null)`. Istniejące polityki RLS obejmują nowe kolumny.

#### 2. Typy i wyliczenia z migawki

**File**: `src/types.ts`, `src/lib/charges.ts` (+ `charges.test.ts`)

**Intent**: Historia liczona tylko z danych faktury. Migawka powstaje jedną czystą funkcją.

**Contract**:
- `Invoice` dostaje pola `paidRateBp: number | null` i `paidCompensationGrosze: number | null`.
- `paymentSnapshot(invoice: { amountGrosze; clientChargesCompensation }, settings: ChargeSettings): { rateBp: number; compensationGrosze: number }`. Kwota progu wynosi 0, gdy klient nie nalicza.
- `frozenChargesAsOf(invoice: { dueDate; amountGrosze }, snapshot: { rateBp; compensationGrosze }, asOf: string): ChargesAsOf`. `days = max(0, daysOverdue)`, odsetki liczone ze stopy migawki, a rekompensata to `days > 0 ? snapshot.compensationGrosze : 0`.
- Testy obejmują zgodność `frozenChargesAsOf(paymentSnapshot(...))` z `chargesAsOf` dla tych samych ustawień, wpłatę w terminie (rekompensata 0 mimo kwoty w migawce), klienta bez rekompensaty i to, że zmiana ustawień nie zmienia wyniku dla tej samej migawki.

#### 3. Serwis faktur

**File**: `src/lib/services/invoices.ts`, `src/pages/api/invoices/[id]/payment.ts`

**Intent**: Migawka powstaje tylko przy przejściu „otwarta → zapłacona” i z ustawień właściciela.

**Contract**: `COLUMNS`, `InvoiceRow` i `toInvoice` zawierają nowe kolumny. `setInvoicePayment(supabase, id, paidOn)` działa jak opisano w Critical Implementation Details: ustawienia czyta przez `getSettings` (tylko przy oznaczeniu), a migawkę wylicza przez `paymentSnapshot(invoice, chargeSettingsFrom(settings))`. Sygnatura publiczna i kody błędów bez zmian.

#### 4. Historia i dialog wpłaty

**File**: `src/components/invoices/PaidInvoicesManager.tsx`, `src/components/invoices/PaymentDialog.tsx`

**Intent**: `/history` i podgląd „Zmień datę” pokazują kwoty z migawki.

**Contract**: `PaidInvoicesManager` liczy `frozenChargesAsOf(invoice, { rateBp: paidRateBp, compensationGrosze: paidCompensationGrosze }, paidOn)`. `PaymentDialog` w trybie `edit` liczy podgląd z migawki faktury, a w trybie `mark` na razie bez zmian (ustawienia dochodzą w fazie 3).

#### 5. Kitchen sink i smoke

**File**: `src/components/dev/KitchenSinkForms.tsx`, `scripts/smoke.mjs`

**Intent**: Przykładowe faktury zgodne z nowym typem i sprawdzenie zamrożenia end-to-end.

**Contract**: przykładowe faktury dostają pola migawki (`null` dla otwartych). Nowa grupa smoke `snapshotSteps()` na własnym kliencie z rekompensatą: zapisz ustawienia A (stopa 1000 bp, kwoty 100/200/300 zł) → oznacz fakturę jako zapłaconą → odpowiedź ma `paidRateBp: 1000` i kwotę progu → zmień ustawienia na 2000 bp → zmień datę wpłaty → `paidRateBp` nadal 1000 → `DELETE …/payment` → oba pola `null` → przywróć ustawienia domyślne. Istniejące kroki płatności nadal przechodzą.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą, w tym testy `paymentSnapshot` i `frozenChargesAsOf`: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi, łącznie z grupą `snapshotSteps`: `npm run smoke`

#### Manual Verification:

- Kwoty zapłaconych faktur w `/history` po migracji są identyczne jak przed nią
- Przełączenie „naliczaj rekompensatę” u klienta nie zmienia rekompensaty jego zapłaconych faktur w `/history`
- Zmiana daty wpłaty w `/history` na dzień w terminie pokazuje rekompensatę 0, a powrót na datę po terminie znów pokazuje kwotę z migawki

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Ustawienia w wyliczeniach otwartych faktur

### Overview

Strona `/` czyta ustawienia użytkownika i przekazuje je do listy, ponagleń i podglądu wpłaty. Po tej fazie zapis przez API zmienia etapy i kwoty otwartych faktur.

### Changes Required:

#### 1. Strona faktur

**File**: `src/pages/index.astro`

**Intent**: Ustawienia wczytywane na serwerze razem z fakturami i klientami.

**Contract**: `getSettings(supabase)` w tym samym `Promise.all`. Błąd daje ten sam komunikat `loadError`. Prop `settings: EscalationSettings` dla `InvoicesManager`.

#### 2. Lista, ponaglenia i podgląd wpłaty

**File**: `src/components/invoices/InvoicesManager.tsx`, `src/components/invoices/RemindersSection.tsx`, `src/components/invoices/PaymentDialog.tsx`

**Intent**: Wszystkie wyliczenia otwartych faktur z ustawień użytkownika, bez stałych.

**Contract**: etykiety grup budowane z `settings.thresholds` (funkcja zamiast stałej `GROUP_LABELS` na poziomie modułu). `groupInvoices(invoices, today, settings.thresholds)`, `interestGrosze(..., settings.annualRateBp)` i `compensationGrosze(..., chargeSettingsFrom(settings).compensationTiers)`. `RemindersSection` dostaje `settings` i woła `buildClientReminders(invoices, today, settings.thresholds, chargeSettingsFrom(settings))`. `PaymentDialog` w trybie `mark` dostaje `settings` i liczy podgląd `chargesAsOf(invoice, paidOn, chargeSettingsFrom(settings))`, czyli tą samą wartością, którą zapisze serwer. Po zmianach żaden komponent nie importuje `DEFAULT_THRESHOLDS` ani `DEFAULT_CHARGE_SETTINGS` (poza `/dev/ui`).

#### 3. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Przykłady przekazują jawnie `DEFAULT_ESCALATION_SETTINGS`.

**Contract**: wywołania i propsy zgodne z nowymi sygnaturami.

### Success Criteria:

#### Automated Verification:

- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke nadal przechodzi: `npm run smoke`
- W `src/components/invoices/` nie ma importów `DEFAULT_THRESHOLDS` ani `DEFAULT_CHARGE_SETTINGS`: `grep -rE "DEFAULT_(THRESHOLDS|CHARGE_SETTINGS)" src/components/invoices` nic nie zwraca

#### Manual Verification:

- Po zapisaniu przez API progów 1/2/3/4 faktura 2 dni po terminie trafia na `/` do „Etap 2 · od 2 dni po terminie”, a jej ponaglenie ma ton etapu 2
- Po zapisaniu innej stopy i kwot odsetki i rekompensata na `/` oraz podgląd „Zapłacona” odpowiadają nowym ustawieniom, a kwoty w `/history` się nie zmieniają

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Ekran `/settings`

### Overview

Strona ustawień z formularzem, linkiem w nawigacji i stanami w `/dev/ui`.

### Changes Required:

#### 1. Strona i ochrona trasy

**File**: `src/pages/settings.astro`, `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: Chroniona strona „Ustawienia” wzorem `/clients`.

**Contract**: strona wczytuje `getSettings` (błąd → `Alert` z komunikatem, jak na `/clients`) i renderuje `<SettingsForm initialSettings={...} client:load />`. `/settings` w `PROTECTED_ROUTES`. Link „Ustawienia” po „Historia” w Topbarze.

#### 2. Formularz

**File**: `src/components/settings/SettingsForm.tsx`, `src/components/hooks/use-settings-form.ts`

**Intent**: Edycja wszystkich ustawień w jednym formularzu z walidacją po stronie klienta i serwera.

**Contract**: hook wzorem `use-invoice-form`/`use-client-form`: stan pól tekstowych (stopa i kwoty wyświetlane przez `amountInputText`-podobny format z przecinkiem), walidacja `settingsInputSchema`, `PUT /api/settings`, błędy pól i błąd serwera (`ServerError`), stan `pending` (`SubmitButton`). Formularz składa się z sekcji „Progi eskalacji (dni po terminie)” (Etap 1–4), „Odsetki” (roczna stopa, %) i „Rekompensata” (3 pola z etykietami zakresów kwot faktury). Wykorzystuje `FormField`, `Input`, `Card` i `Button` z `src/components/ui/`. „Przywróć domyślne” (`variant="outline"`) wypełnia pola wartościami `DEFAULT_ESCALATION_SETTINGS` bez zapisu. Po udanym zapisie widoczny jest komunikat „Zapisano ustawienia” (rola `status`), a pola przyjmują wartości z odpowiedzi serwera. Formularz ma widok wydzielony do `/dev/ui`.

#### 3. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Stany formularza ustawień w `/dev/ui` (wymóg CLAUDE.md dla komponentów formularzy).

**Contract**: stany domyślny, z błędami pól (nierosnące progi, zła stopa), z błędem serwera, pending oraz po zapisie.

#### 4. README

**File**: `README.md`

**Intent**: Dokumentacja nowej tabeli, kolumn migawki i trasy.

**Contract**: akapit o migracjach `create_user_settings` i `add_invoice_payment_snapshot` (historia zamrożona na stopie i rekompensacie z dnia oznaczenia jako zapłacona), wiersz `/settings` w tabeli tras i dopisek w sekcji Smoke o wymaganych migracjach dla grup `settingsSteps` i `snapshotSteps`.

### Success Criteria:

#### Automated Verification:

- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi (bez literałów kolorów i klas palety): `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke nadal przechodzi: `npm run smoke`

#### Manual Verification:

- Niezalogowany użytkownik wchodzący na `/settings` trafia na `/auth/signin`
- Nowy użytkownik widzi na `/settings` wartości domyślne (3/7/14/30, 13,75, 170,00 / 297,50 / 425,00)
- Zapis nierosnących progów lub stopy 13,755 pokazuje błąd przy polu i nic nie zapisuje
- Zapis poprawnych ustawień pokazuje „Zapisano ustawienia”, wartości zostają po odświeżeniu, a `/` od razu liczy się z nowych ustawień
- „Przywróć domyślne”, a potem „Zapisz”, wraca do wartości domyślnych
- `/dev/ui` pokazuje stany formularza ustawień poprawnie w trybie jasnym i ciemnym

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `settings-schemas.test.ts`: parsowanie stopy na bp i kwot na grosze, granice zakresów, progi ściśle rosnące, kwota 0.
- `charges.test.ts`: `chargeSettingsFrom(DEFAULT_ESCALATION_SETTINGS)` równe `DEFAULT_CHARGE_SETTINGS`; `paymentSnapshot` (próg wg kwoty, 0 przy wyłączonej rekompensacie); `frozenChargesAsOf` (zgodność z `chargesAsOf`, wpłata w terminie, niezależność od bieżących ustawień); `interestGrosze(100.5, 1)` rzuca wyjątek (F1).
- `escalation.test.ts` i `reminder.test.ts` już testują dowolne progi. Dopisać przypadek progów 1/2/3/4 tylko wtedy, gdy go brakuje.

### Integration Tests:

- Smoke `settingsSteps`: autoryzacja, walidacja, zapis, izolacja.
- Smoke `snapshotSteps`: migawka przy oznaczeniu, niezmienność po zmianie ustawień i daty, czyszczenie przy cofnięciu.

### Manual Testing Steps:

1. Zapisz 10 000 zł zapłacone 30 dni po terminie przy stopie 13,75% i sprawdź odsetki 113,01 zł w `/history`.
2. Zmień stopę na 11,25% w `/settings` i sprawdź, że `/history` nadal pokazuje 113,01 zł, a otwarta faktura z tymi samymi danymi na `/` pokazuje 92,47 zł.
3. Przywróć zapłaconą fakturę do otwartych i sprawdź, że liczy się z 11,25%. Po ponownym oznaczeniu `/history` pokazuje 92,47 zł.

## Performance Considerations

Jedno dodatkowe zapytanie (`maybeSingle` po kluczu głównym) na stronach `/` i `/settings` oraz przy oznaczeniu faktury jako zapłaconej. Pomijalne.

## Migration Notes

- Dwie migracje: `create_user_settings` (faza 1) i `add_invoice_payment_snapshot` (faza 2). Obie trafiają na produkcję przez potok po merge PR-a. Lokalnie stosuj je przez `npx supabase migration up`, bez `db reset`.
- Backfill migawki używa wartości domyślnych z chwili migracji, a nie ustawień użytkownika (tabela ustawień jest wtedy pusta lub dopiero co utworzona). Dzięki temu kwoty w historii są identyczne jak przed migracją.
- Rollback Workera nie cofa kolumn. Stary kod po migracji fazy 2 nie oznaczy faktury jako zapłaconej (constraint), patrz Critical Implementation Details.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-10)
- PRD: `context/foundation/prd.md` (FR-007, FR-009)
- Odłożona decyzja o zamrożeniu historii: `context/archive/2026-10-07-mark-invoice-paid/plan.md:36`, `plan-brief.md:24,64`
- Uwagi F1/F2: `context/archive/2026-10-06-interest-and-compensation/reviews/impl-review.md:36-47`
- Wzorzec warunkowego update: `src/lib/services/invoices.ts:131-160`
- Wzorzec migracji z RLS: `supabase/migrations/20261003120000_create_clients.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model ustawień i API

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up` — 3f51595
- [x] 1.2 Typy i Astro przechodzą: `npx astro check` — 3f51595
- [x] 1.3 Lint przechodzi: `npm run lint` — 3f51595
- [x] 1.4 Testy jednostkowe przechodzą, w tym `settings-schemas.test.ts` i nowe testy `charges.test.ts`: `npm test` — 3f51595
- [x] 1.5 Build przechodzi: `npm run build` — 3f51595
- [x] 1.6 Smoke przechodzi, łącznie z grupą `settingsSteps`: `npm run smoke` — 3f51595

#### Manual

- [x] 1.7 W Supabase Studio wiersz `user_settings` z nierosnącymi progami jest odrzucany przez check — 3f51595

### Phase 2: Zamrożenie kwot zapłaconych faktur

#### Automated

- [x] 2.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up` — 6794af3
- [x] 2.2 Typy i Astro przechodzą: `npx astro check` — 6794af3
- [x] 2.3 Lint przechodzi: `npm run lint` — 6794af3
- [x] 2.4 Testy jednostkowe przechodzą, w tym testy `paymentSnapshot` i `frozenChargesAsOf`: `npm test` — 6794af3
- [x] 2.5 Build przechodzi: `npm run build` — 6794af3
- [x] 2.6 Smoke przechodzi, łącznie z grupą `snapshotSteps`: `npm run smoke` — 6794af3

#### Manual

- [x] 2.7 Kwoty zapłaconych faktur w `/history` po migracji są identyczne jak przed nią — 6794af3
- [x] 2.8 Przełączenie „naliczaj rekompensatę” u klienta nie zmienia rekompensaty jego zapłaconych faktur w `/history` — 6794af3
- [x] 2.9 Zmiana daty wpłaty w `/history` na dzień w terminie pokazuje rekompensatę 0, a powrót na datę po terminie znów pokazuje kwotę z migawki — 6794af3

### Phase 3: Ustawienia w wyliczeniach otwartych faktur

#### Automated

- [x] 3.1 Typy i Astro przechodzą: `npx astro check`
- [x] 3.2 Lint przechodzi: `npm run lint`
- [x] 3.3 Testy jednostkowe przechodzą: `npm test`
- [x] 3.4 Build przechodzi: `npm run build`
- [x] 3.5 Smoke nadal przechodzi: `npm run smoke`
- [x] 3.6 W `src/components/invoices/` nie ma importów `DEFAULT_THRESHOLDS` ani `DEFAULT_CHARGE_SETTINGS`: `grep -rE "DEFAULT_(THRESHOLDS|CHARGE_SETTINGS)" src/components/invoices` nic nie zwraca

#### Manual

- [x] 3.7 Po zapisaniu przez API progów 1/2/3/4 faktura 2 dni po terminie trafia na `/` do „Etap 2 · od 2 dni po terminie”, a jej ponaglenie ma ton etapu 2
- [x] 3.8 Po zapisaniu innej stopy i kwot odsetki i rekompensata na `/` oraz podgląd „Zapłacona” odpowiadają nowym ustawieniom, a kwoty w `/history` się nie zmieniają

### Phase 4: Ekran `/settings`

#### Automated

- [ ] 4.1 Typy i Astro przechodzą: `npx astro check`
- [ ] 4.2 Lint przechodzi (bez literałów kolorów i klas palety): `npm run lint`
- [ ] 4.3 Testy jednostkowe przechodzą: `npm test`
- [ ] 4.4 Build przechodzi: `npm run build`
- [ ] 4.5 Smoke nadal przechodzi: `npm run smoke`

#### Manual

- [ ] 4.6 Niezalogowany użytkownik wchodzący na `/settings` trafia na `/auth/signin`
- [ ] 4.7 Nowy użytkownik widzi na `/settings` wartości domyślne (3/7/14/30, 13,75, 170,00 / 297,50 / 425,00)
- [ ] 4.8 Zapis nierosnących progów lub stopy 13,755 pokazuje błąd przy polu i nic nie zapisuje
- [ ] 4.9 Zapis poprawnych ustawień pokazuje „Zapisano ustawienia”, wartości zostają po odświeżeniu, a `/` od razu liczy się z nowych ustawień
- [ ] 4.10 „Przywróć domyślne”, a potem „Zapisz”, wraca do wartości domyślnych
- [ ] 4.11 `/dev/ui` pokazuje stany formularza ustawień poprawnie w trybie jasnym i ciemnym
