# Lista otwartych faktur pogrupowana po etapach eskalacji — plan implementacji

## Overview

Wycinek S-03 z roadmapy (gwiazda przewodnia; US-01, FR-003 w części „dodaj”, FR-005, FR-010 w części „grupy”). Użytkownik dodaje fakturę (klient, numer, kwota, termin) w dialogu na `/` i od razu widzi ją na liście otwartych faktur w grupie wynikającej z liczby dni po terminie (czas polski) i domyślnych progów +3/+7/+14/+30: etap 4, 3, 2, 1, po terminie przed pierwszym progiem albo bieżące. Reguła etapu jest czystą funkcją z automatycznymi testami przypadków brzegowych, bo wszystkie kolejne wycinki (odsetki, ponaglenie, zapłata, wstrzymanie) na niej budują.

## Current State Analysis

- `/` to chroniony placeholder z kartą „Tutaj pojawią się Twoje faktury.” (`src/pages/index.astro:1-19`), a Topbar ma już link „Faktury” (`src/components/Topbar.astro:7-10`).
- Jedyna tabela domenowa to `public.clients` z RLS (8 polityk), `user_id default auth.uid()` i częściowymi indeksami unikalnymi (`supabase/migrations/20261003120000_create_clients.sql`). Nie ma ograniczenia `unique (id, user_id)`, więc nic jeszcze nie pozwala na złożony FK.
- Wzorzec warstw z S-02:
  - serwis jako jedyne miejsce zapytań, mapujący `23505` po nazwie indeksu (`src/lib/services/clients.ts:38-45`);
  - wspólny strażnik endpointów: auth, konfiguracja, JSON i zod (`src/lib/services/clients-api.ts:22-46`);
  - schemat zod używany i w API, i w formularzu (`src/lib/client-schemas.ts`), oraz mapa komunikatów (`src/lib/client-errors.ts`);
  - wyspa zasilana listą z SSR (`src/pages/clients.astro`, `src/components/clients/ClientsManager.tsx`), dialog z eksportowanym widokiem dla `/dev/ui` (`src/components/clients/ClientFormDialog.tsx:26-75`) i hook formularza (`src/components/hooks/use-client-form.ts`).
- Vitest jest skonfigurowany na `src/**/*.test.ts` (`vitest.config.ts`). `scripts/smoke.mjs` ma dwa konta (A i B) oraz kroki klientów, a ID klienta A zapisuje w `clientIds.a` (`scripts/smoke.mjs:51-114`).
- Potok CI (`.github/workflows/ci.yml`): na PR uruchamia lint, `astro check`, testy i build; po merge na `main` buduje, wykonuje `supabase db push`, a dopiero potem `wrangler deploy`.
- W `src/components/ui/` nie ma komponentu `select`.

## Desired End State

Zalogowany użytkownik na `/` widzi nagłówek „Faktury” i przycisk „Dodaj fakturę”. Dialog zbiera klienta (select), numer, kwotę i termin. Po zapisie faktura pojawia się bez przeładowania w swojej grupie. Grupy są ułożone od najpilniejszej (etap 4 → 3 → 2 → 1 → po terminie przed etapem 1 → bieżące), puste są ukryte, a w grupie pierwszy jest najstarszy termin (remis po numerze). Bez klientów widać stan pusty z linkiem do `/clients`. Bez faktur widać stan pusty z przyciskiem dodawania.

Reguła, przykład: termin 10.10, dziś 13.10 (czas polski) daje 3 dni po terminie, czyli etap 1.

Weryfikacja: Vitest pokrywa regułę i schemat, smoke dodaje faktury dwoma kontami i potwierdza izolację, a po merge migracja i kod są na produkcji w kolejności baza → kod.

### Key Discoveries:

- Polityka RLS `user_id = auth.uid()` na `invoices` nie wystarczy do izolacji. Zwykły FK `client_id → clients(id)` przepuści fakturę konta B wskazującą klienta konta A, bo sprawdzenie FK omija RLS. Potrzebny jest złożony FK `(client_id, user_id) → clients(id, user_id)`, a ten wymaga `unique (id, user_id)` na `clients`.
- Mapowanie błędów po nazwie ograniczenia działa w S-02 (`src/lib/services/clients.ts:8-11,38-45`). Faktury używają tego samego mechanizmu dla `23505` (numer) i `23503` (cudzy klient).
- Schemat klienta jest idempotentny, więc hook wysyła sparsowane dane (`use-client-form.ts:51-59`). Schemat faktury zmienia kształt (`amount` jako tekst → `amountGrosze`), więc hook waliduje lokalnie tym samym schematem, ale wysyła **surowe** pola formularza, a API parsuje je jeszcze raz.
- `json()` mieszka dziś w `clients-api.ts`. Faktury go potrzebują, więc trafi do neutralnego `src/lib/http.ts`.
- Lekcja z `context/foundation/lessons.md`: w `.astro` na komponentach React używamy `className`, a `class` tylko na elementach HTML. Dotyczy nowej strony `/`.

## What We're NOT Doing

- Edycja, anulowanie i blokada edycji po terminie (S-07). W bazie polityka `delete` = `false`, a polityka `update` dotyczy tylko właściciela i nie ma endpointu.
- Oznaczanie jako zapłacona i widok historii (S-06), wstrzymanie i grupa „wstrzymane” (S-08).
- Odsetki i rekompensata (S-04), ponaglenia (S-05).
- Tabela ustawień i edycja progów (S-10). Progi to stała `DEFAULT_THRESHOLDS` w kodzie, przekazywana do funkcji jako parametr.
- Filtrowanie po kliencie i sortowanie (S-11). Jest tylko domyślny porządek grup i wierszy.
- Dodawanie faktury z wiersza klienta na `/clients`.
- Data wystawienia, VAT, waluty i inne pola faktury.
- Paginacja; skala danych jest mała.
- Odświeżanie „dziś” w otwartej karcie po północy. Data jest wyznaczana przy renderze strony.

## Implementation Approach

Kolejność od rdzenia na zewnątrz. Najpierw czysta reguła (`src/lib/escalation.ts`) z testami, bez bazy i UI, bo to sedno produktu i wymóg determinizmu. Potem warstwa danych i API wg wzorca S-02: migracja, typy, schemat, serwis, endpoint i smoke. Na końcu widok, który wywołuje tę samą funkcję grupującą z datą „dziś” wyznaczoną na serwerze. Wdrożenie idzie przez PR i potok F-01, który stosuje migrację przed kodem.

Funkcja grupująca działa w wyspie (a nie tylko na serwerze), żeby faktura dodana w dialogu od razu trafiła do właściwej grupy bez przeładowania. Serwer przekazuje `today` jako prop, więc serwer i przeglądarka liczą względem tej samej daty, niezależnie od strefy czasowej przeglądarki.

## Critical Implementation Details

- **Granica dnia.** „Dziś” to data kalendarzowa w strefie `Europe/Warsaw` wyznaczona z `Date` przez `Intl.DateTimeFormat` (dostępne w workerd). Dni po terminie to różnica dwóch dat ISO `YYYY-MM-DD` liczona przez `Date.UTC`, a nie różnica milisekund lokalnych. Dzięki temu zmiana czasu letniego/zimowego nie daje 0,96 ani 1,04 dnia.
- **Kwota bez liczb zmiennoprzecinkowych.** Tekst kwoty jest zamieniany na grosze przez rozbicie na część całkowitą i ułamkową, nigdy przez `parseFloat(x) * 100` (`0,29 * 100 = 28.999…`).

## Phase 1: Reguła eskalacji

### Overview

Czysty moduł, który dla daty terminu, daty „dziś” i progów zwraca liczbę dni po terminie i grupę, oraz grupuje listę faktur w ustalonej kolejności. Do tego testy przypadków brzegowych z roadmapy.

### Changes Required:

#### 1. Moduł reguły

**File**: `src/lib/escalation.ts`

**Intent**: Jedno źródło prawdy dla klasyfikacji faktury, używane przez stronę `/` (SSR) i wyspę. S-04, S-05 i S-08 będą z niego korzystać.

**Contract**:
- `type EscalationThresholds = readonly [number, number, number, number]`; `DEFAULT_THRESHOLDS = [3, 7, 14, 30]`.
- `type EscalationGroup = "stage_4" | "stage_3" | "stage_2" | "stage_1" | "pre_threshold" | "current"`; `GROUP_ORDER` w tej kolejności (od najpilniejszej).
- `todayInPoland(now: Date): string`: data ISO w `Europe/Warsaw`.
- `daysOverdue(dueDate: string, today: string): number`: `today − dueDate` w dniach kalendarzowych; ujemne lub 0, gdy termin jeszcze nie minął albo jest dziś.
- `escalationGroup(days: number, thresholds = DEFAULT_THRESHOLDS): EscalationGroup`. `days ≤ 0` → `current`. `1 ≤ days < t1` → `pre_threshold`. `days ≥ t1` → `stage_1`, `≥ t2` → `stage_2`, `≥ t3` → `stage_3`, `≥ t4` → `stage_4` (etap 4 końcowy). Progi są **włączne**.
- `groupInvoices<T extends { dueDate: string; number: string }>(items: T[], today: string, thresholds?)` zwraca `{ group, items: (T & { daysOverdue: number })[] }[]`: tylko niepuste grupy, w `GROUP_ORDER`. W grupie sortuje po `dueDate` rosnąco, a remis po `number` (`localeCompare("pl", { numeric: true })`).

#### 2. Testy reguły

**File**: `src/lib/escalation.test.ts`

**Intent**: Automatyczna weryfikacja determinizmu i granic, czego wymaga ryzyko S-03 w roadmapie.

**Contract**: przypadki co najmniej:
- `daysOverdue`: termin = dziś → 0; termin jutro → −1; `2026-10-10` / `2026-10-13` → 3; przez zmianę czasu `2026-10-24` / `2026-10-26` → 2 oraz `2026-03-28` / `2026-03-30` → 2; przez koniec roku `2026-12-30` / `2027-01-02` → 3.
- `escalationGroup` z domyślnymi progami: −5 i 0 → `current`; 1 i 2 → `pre_threshold`; 3 i 6 → `stage_1`; 7 i 13 → `stage_2`; 14 i 29 → `stage_3`; 30 i 365 → `stage_4`.
- `escalationGroup` z progami `[1, 2, 3, 4]`: 1 → `stage_1` (brak okna przed progiem).
- `todayInPoland`: `2026-10-12T21:59:59Z` → `2026-10-12`, `2026-10-12T22:00:00Z` → `2026-10-13` (CEST); `2026-12-31T22:59:59Z` → `2026-12-31`, `2026-12-31T23:00:00Z` → `2027-01-01` (CET).
- `groupInvoices`: kolejność grup od etapu 4, brak pustych grup, w grupie najstarszy termin pierwszy, remis `FV/2` przed `FV/10`, dwa wywołania z tymi samymi danymi dają ten sam wynik.

### Success Criteria:

#### Automated Verification:

- Testy reguły przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- Przegląd tabeli przypadków w teście: progi włączne, dzień terminu w „bieżące”, etap 4 końcowy — zgodnie z decyzją z planowania

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dane i API

### Overview

Tabela `invoices` z izolacją właściciela (RLS i złożony FK) oraz unikalnym numerem w obrębie konta. Do tego typy, schemat wejścia z parsowaniem kwoty, serwis, `POST /api/invoices` i rozszerzony smoke.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_invoices.sql`

**Intent**: Pierwsza tabela faktur. Baza wymusza izolację, przynależność klienta do właściciela i unikalność numeru, więc żaden wyścig ani ręczne żądanie ich nie obejdzie.

**Contract**:
- `alter table public.clients add constraint clients_id_user_key unique (id, user_id)`.
- Tabela `public.invoices`:
  - `id uuid pk default gen_random_uuid()`;
  - `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`;
  - `client_id uuid not null`;
  - `number text not null check (char_length(btrim(number)) between 1 and 50)`;
  - `amount_grosze bigint not null check (amount_grosze between 1 and 99999999999)`;
  - `due_date date not null`;
  - `created_at timestamptz not null default now()`;
  - `constraint invoices_client_owner_fkey foreign key (client_id, user_id) references public.clients (id, user_id)`.
- Indeksy: `create unique index invoices_user_number_key on public.invoices (user_id, lower(number))`; indeks pod FK na `(client_id, user_id)`.
- RLS włączone i 8 polityk wg wzorca z `create_clients.sql`. Dla `authenticated`: `select`/`insert`/`update` z `(select auth.uid()) = user_id`, `delete` z `using (false)` i komentarzem „anulowanie w S-07”. Dla `anon` wszystkie cztery z `false`.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Encja i DTO faktury współdzielone przez serwis, API i UI.

**Contract**: `Invoice { id; clientId; clientName; number; amountGrosze: number; dueDate: string /* YYYY-MM-DD */; createdAt }` oraz `InvoiceInput { clientId; number; amountGrosze; dueDate }`.

#### 3. Helper JSON

**File**: `src/lib/http.ts` (nowy), `src/lib/services/clients-api.ts`

**Intent**: Przenieść `json(body, status)` do neutralnego modułu, żeby API faktur nie importowało z modułu klientów.

**Contract**: `export function json(body: unknown, status: number): Response`. `clients-api.ts` importuje go stamtąd i nadal reeksportuje (`export { json }`), więc `src/pages/api/clients/[id].ts` działa bez zmian.

#### 4. Schemat wejścia i komunikaty

**File**: `src/lib/invoice-schemas.ts`, `src/lib/invoice-errors.ts`

**Intent**: Jedna walidacja dla dialogu i API, z polskimi komunikatami pod polami. Kwota trafia do bazy w groszach.

**Contract**: `invoiceInputSchema` (wejście: `{ clientId, number, amount: string, dueDate }`, wyjście: `InvoiceInput`):
- `clientId`: UUID, komunikat „Wybierz klienta”.
- `number`: trim i zwinięte spacje, 1–50 znaków; komunikaty „Podaj numer faktury” / „Numer może mieć najwyżej 50 znaków”.
- `amount` → `amountGrosze`: usuwa spacje (także twarde), akceptuje `,` lub `.` jako separator i najwyżej 2 miejsca po przecinku (`^\d+([.,]\d{1,2})?$`), > 0, ≤ 999 999 999,99. Komunikat „Podaj kwotę większą od zera, np. 1 234,56”. Konwersja bez `parseFloat`.
- `dueDate`: `YYYY-MM-DD`, prawdziwa data kalendarzowa (np. `2026-02-30` odrzucone), rok 2000–2100. Komunikat „Podaj poprawny termin płatności”. Daty z przeszłości są dozwolone.

`invoiceErrorMessage(code)` wg wzoru `client-errors.ts`:
- `duplicate_number` → „Faktura o tym numerze już istnieje.”;
- `client_not_found` → „Nie znaleziono klienta. Odśwież stronę.”;
- `unauthorized`, `config_missing` oraz domyślny komunikat jak u klientów.

#### 5. Testy schematu

**File**: `src/lib/invoice-schemas.test.ts`

**Intent**: Przypiąć parsowanie kwoty i daty, bo błędy tutaj zafałszują odsetki w S-04.

**Contract**: przypadki:
- kwota: `"1 234,56"` → 123456; `"1234.5"` → 123450; `"0,29"` → 29; `"100"` → 10000; odrzucone: `"0"`, `"0,00"`, `"-5"`, `"12,345"`, `"abc"`, `""`, `"1 000 000 000,00"`; akceptowane `"999 999 999,99"`;
- numer: `"  FV/1/2026  "` → `"FV/1/2026"`; pusty i 51 znaków odrzucone;
- termin: `"2026-02-30"` i `"30.10.2026"` odrzucone, `"2020-01-15"` przyjęte;
- `clientId`: brak → „Wybierz klienta”.

#### 6. Serwis faktur

**File**: `src/lib/services/invoices.ts`

**Intent**: Jedyne miejsce zapytań o faktury i mapowania błędów bazy na kody domenowe.

**Contract**:
- `listInvoices(supabase): Promise<Invoice[]>` wybiera kolumny faktury z `clients(name)`.
- `createInvoice(supabase, input): Promise<InvoiceResult>`, gdzie `InvoiceResult = { ok: true; invoice } | { ok: false; code: "duplicate_number" | "client_not_found" | "unknown" }`.
- Mapowanie: `23505` z `invoices_user_number_key` → `duplicate_number`; `23503` z `invoices_client_owner_fkey` → `client_not_found`. Nazwy ograniczeń są stałymi z komentarzem o zgodności z migracją, jak w `clients.ts:9-11`.
- `user_id` nie jest wysyłane (domyślne `auth.uid()`).

#### 7. Endpoint

**File**: `src/lib/services/invoices-api.ts`, `src/pages/api/invoices/index.ts`

**Intent**: `POST /api/invoices` wg wzorca strażnika z `clients-api.ts`.

**Contract**:
- `export const prerender = false`; `POST`.
- 401 `unauthorized`, 500 `config_missing`, 400 `{ error: "invalid_input", fieldErrors }`.
- 201 `{ invoice }`, 409 `duplicate_number`, 404 `client_not_found`, 500 `unknown`.
- `/` jest już chroniona; nowa trasa API sama zwraca 401 bez sesji.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Automatycznie potwierdzić izolację, unikalność numeru i SSR listy na prawdziwym serwerze i bazie.

**Contract**:
- Zapisać ID klienta B (krok „user B: same NIP as A is allowed” dostaje `check: created("b")`).
- Dodać `invoiceSteps()` po `clientSteps()`:
  - anonim `POST /api/invoices` → 401;
  - A tworzy `FV/1/<stamp>` dla `clientIds.noNip`, kwota `"1 234,56"`, termin 40 dni wstecz → 201 i `amountGrosze === 123456`;
  - A, `fv/1/<stamp>` → 409 `duplicate_number`;
  - A, kwota `"0"` → 400 z `fieldErrors.amount`;
  - B z `clientIds.a` → 404 `client_not_found`;
  - B z `clientIds.b` i tym samym numerem `FV/1/<stamp>` → 201;
  - `GET /` dla A → 200 i HTML zawiera `nameNoNip`;
  - `GET /` dla B → 200 i HTML **nie** zawiera `nameNoNip`.
- Sprawdzenie izolacji w HTML opiera się na `nameNoNip`, bo tylko konto A ma takiego klienta. `nameA` i numer faktury występują u obu kont.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się od zera: `npx supabase db reset`
- Testy schematu i reguły przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke`

#### Manual Verification:

- W Studio (`localhost:54323`) tabela `invoices` ma RLS i 8 polityk, a `clients` ma ograniczenie `clients_id_user_key`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Widok listy i dialog

### Overview

Strona `/` z listą faktur w grupach i dialogiem „Dodaj fakturę” wg wzorca `/clients`.

### Changes Required:

#### 1. Komponent select

**File**: `src/components/ui/select.tsx`

**Intent**: Wybór klienta w dialogu.

**Contract**: `npx shadcn@latest add select` (styl lyra). Bez nadpisywania kolorów przez `className`.

#### 2. Strona `/`

**File**: `src/pages/index.astro`

**Intent**: Zastąpić placeholder listą faktur ładowaną na serwerze.

**Contract**:
- SSR: `listInvoices`, `listClients`, `today = todayInPoland(new Date())`.
- Brak konfiguracji lub błąd zapytania → `Alert` destrukcyjny, jak w `clients.astro`.
- Nagłówek `<h1>` „Faktury”, kontener `max-w-3xl` (lub szerszy, jeśli tabela tego wymaga) i `<InvoicesManager initialInvoices clients today client:load />`.
- Na komponentach React `className`, nie `class` (lekcja).

#### 3. Wyspa listy

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Stan listy, grupowanie przez `groupInvoices(invoices, today)` i otwieranie dialogu. Po zapisie dodaje fakturę do stanu, a ta trafia do grupy bez przeładowania.

**Contract**:
- Stany puste:
  - brak klientów → „Najpierw dodaj klienta” z linkiem do `/clients` (bez przycisku dodawania faktury);
  - są klienci, brak faktur → „Nie masz jeszcze faktur” i „Dodaj fakturę”.
- Każda niepusta grupa to `<section>` z nagłówkiem `<h2>` i liczbą faktur. Etykiety wynikają z progów:
  - „Etap 4 · od 30 dni po terminie”, „Etap 3 · od 14 dni po terminie”, „Etap 2 · od 7 dni po terminie”, „Etap 1 · od 3 dni po terminie”;
  - „Po terminie, przed etapem 1”;
  - „Bieżące”.
- `Table` z kolumnami: Klient, Numer, Kwota (`Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })` z groszy), Termin (`dd.mm.rrrr`), Dni po terminie (liczba, a dla bieżących „—”).
- Przywracanie fokusu po zamknięciu dialogu jak w `ClientsManager.tsx:96-100`.

#### 4. Dialog i hook formularza

**File**: `src/components/invoices/InvoiceFormDialog.tsx`, `src/components/hooks/use-invoice-form.ts`

**Intent**: Formularz faktury z walidacją po stronie klienta tym samym schematem i błędami serwera pod właściwymi polami.

**Contract**:
- `InvoiceFormView` jest eksportowany (dla `/dev/ui`) i ma pola:
  - Klient: `Select` z `Label` powiązanym przez `id`, klienci posortowani `localeCompare("pl")`;
  - Numer: `FormField`;
  - Kwota: `FormField`, placeholder `1 234,56`;
  - Termin: `FormField type="date"`;
  - `ServerError` i `SubmitButton` „Zapisz” / „Zapisywanie...”.
- Hook waliduje przez `invoiceInputSchema`, a wysyła surowe `{ clientId, number, amount, dueDate }`. Mapowanie odpowiedzi:
  - 400 → błędy pól;
  - 409 `duplicate_number` → błąd pod numerem;
  - 404 `client_not_found` → błąd pod klientem;
  - pozostałe → `ServerError`.
- Dialog montuje formularz tylko po otwarciu, więc stan resetuje się przy każdym otwarciu (jak w `ClientFormDialog.tsx:117`).

#### 5. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Stany nowego formularza w `/dev/ui` (wymóg z `CLAUDE.md`).

**Contract**: sekcje „InvoiceFormView: default”, „…: errors” (błąd pod klientem, numerem, kwotą i terminem), „…: pending + server error”, a do tego `InvoicesManager` z przykładowymi danymi obejmującymi kilka grup oraz ze stanami pustymi (bez klientów, bez faktur).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi lokalnie: `npm run smoke`

#### Manual Verification:

- Faktury z terminem dziś, wczoraj, 3, 7, 14, 30 i 100 dni temu trafiają kolejno do: bieżące, przed etapem 1, etap 1, 2, 3, 4, 4
- Grupy idą od etapu 4 do bieżących, puste są ukryte, a w grupie najstarszy termin jest pierwszy
- Dodana faktura pojawia się w grupie bez przeładowania, a po odświeżeniu jest w tym samym miejscu
- Duplikat numeru (inna wielkość liter) daje komunikat pod numerem, a błędna kwota pod kwotą
- Stany puste (bez klientów, bez faktur) wyglądają poprawnie; dialog jest obsługiwalny klawiaturą, a fokus wraca na przycisk
- `/dev/ui` pokazuje stany formularza i listy w trybie jasnym i ciemnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Wdrożenie

### Overview

Dokumentacja, PR i wdrożenie przez potok F-01 (migracja przed kodem), a następnie weryfikacja na produkcji.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Opisać nowy stan aplikacji.

**Contract**:
- w sekcji Supabase wzmianka o tabeli `public.invoices` (migracja `create_invoices`);
- w tabeli tras wiersz `/` jako „lista otwartych faktur”;
- w sekcji smoke informacja, że kroki faktur wymagają migracji `create_invoices`.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Zamknąć otwarte pytanie z S-03.

**Contract**: przy Unknown „Czy próg +3 oznacza etap 1 od 3. dnia…” dopisać rozstrzygnięcie: progi włączne, dzień terminu = bieżąca (decyzja z planowania 2026-10-05). Statusów nie ruszamy; to robią `/10x-implement` i `/10x-archive`.

#### 3. PR i wdrożenie

**Intent**: Zmiana trafia na produkcję wyłącznie przez gałąź i PR (README §Deployment).

**Contract**:
- gałąź `feat/invoice-escalation-list` i PR, w którym przeglądamy SQL migracji;
- merge po zielonym `checks`;
- job `deploy` wykonuje `db push`, a potem `wrangler deploy`;
- bez ręcznego `db push`.

### Success Criteria:

#### Automated Verification:

- Job `checks` na PR jest zielony: `gh pr checks`
- Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1`
- Migracja jest zastosowana na produkcji: `npx supabase migration list` pokazuje `create_invoices` po obu stronach

#### Manual Verification:

- Smoke na produkcji przechodzi (za zgodą użytkownika, bo zostawia konta testowe): `BASE_URL=https://naleznosci.domblacha.workers.dev npm run smoke`
- Na produkcji dodana faktura z terminem sprzed 3 dni jest w grupie „Etap 1”

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/escalation.test.ts`: dni po terminie (dzień terminu, przyszły termin, zmiana czasu w marcu i październiku, przełom roku), granice każdego progu po obu stronach, etap 4 końcowy, niestandardowe progi, północ czasu polskiego latem i zimą, kolejność i determinizm grupowania.
- `src/lib/invoice-schemas.test.ts`: parsowanie kwoty do groszy (separatory, spacje, limity, brak błędów zmiennoprzecinkowych), numer, poprawność daty, brak klienta.

### Integration Tests:

- `scripts/smoke.mjs`: 401 bez sesji, utworzenie faktury z konwersją kwoty, 409 na duplikat numeru bez względu na wielkość liter, 400 na złą kwotę, 404 przy cudzym kliencie, ten sam numer dozwolony u innego konta, klient A-only (`nameNoNip`) w HTML `/` konta A i jego brak u konta B.

### Manual Testing Steps:

1. Zaloguj się bez klientów i otwórz `/`: widać „Najpierw dodaj klienta” z linkiem.
2. Dodaj klienta, wróć na `/`: „Nie masz jeszcze faktur” i przycisk.
3. Dodaj faktury z terminami: dziś, wczoraj, 3, 7, 14, 30 i 100 dni temu. Sprawdź grupy, kolejność grup i kolejność w grupie.
4. Dodaj `fv/…` jako duplikat istniejącego `FV/…`: komunikat pod numerem.
5. Wpisz kwotę `12,345` i `0`: komunikat pod kwotą; `1 234,56` wyświetla się jako `1 234,56 zł`.
6. Odśwież stronę: układ się nie zmienia.

## Performance Considerations

Mała skala (PRD: `data_volume: small`). Jedno zapytanie z dołączoną nazwą klienta i grupowanie w pamięci. Indeks unikalny `(user_id, lower(number))` i indeks pod FK wystarczą; bez paginacji.

## Migration Notes

Nowa tabela i dodatkowe ograniczenie `unique (id, user_id)` na `clients`, które istniejące dane zawsze spełniają, bo `id` jest PK. Migrację stosuje job `deploy` przed wdrożeniem kodu. Wycofanie wymaga nowej migracji przez PR (`drop table public.invoices; alter table public.clients drop constraint clients_id_user_key;`), a rollback Workera nie cofa schematu (README §Migracje).

## References

- Roadmapa: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (US-01, FR-003, FR-005, FR-010, NFR)
- Poprzedni wycinek (wzorzec): `context/archive/2026-10-03-add-and-edit-clients/plan.md`
- Migracja klientów: `supabase/migrations/20261003120000_create_clients.sql`
- Serwis i API klientów: `src/lib/services/clients.ts:38-45`, `src/lib/services/clients-api.ts:22-46`
- Wyspa i dialog: `src/components/clients/ClientsManager.tsx`, `src/components/clients/ClientFormDialog.tsx`, `src/components/hooks/use-client-form.ts`
- Smoke: `scripts/smoke.mjs:51-114`
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła eskalacji

#### Automated

- [x] 1.1 Testy reguły przechodzą: `npm test` — 4246a16
- [x] 1.2 Lint przechodzi: `npm run lint` — 4246a16
- [x] 1.3 Typy przechodzą: `npx astro check` — 4246a16

#### Manual

- [x] 1.4 Przegląd tabeli przypadków w teście: progi włączne, dzień terminu w „bieżące”, etap 4 końcowy — zgodnie z decyzją z planowania — 4246a16

### Phase 2: Dane i API

#### Automated

- [x] 2.1 Migracja stosuje się od zera: `npx supabase db reset`
- [x] 2.2 Testy schematu i reguły przechodzą: `npm test`
- [x] 2.3 Lint przechodzi: `npm run lint`
- [x] 2.4 Typy przechodzą: `npx astro check`
- [x] 2.5 Smoke przechodzi lokalnie (z `npm run dev` i lokalnym Supabase): `npm run smoke`

#### Manual

- [x] 2.6 W Studio (`localhost:54323`) tabela `invoices` ma RLS i 8 polityk, a `clients` ma ograniczenie `clients_id_user_key`

### Phase 3: Widok listy i dialog

#### Automated

- [ ] 3.1 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- [ ] 3.2 Typy przechodzą: `npx astro check`
- [ ] 3.3 Testy przechodzą: `npm test`
- [ ] 3.4 Build przechodzi: `npm run build`
- [ ] 3.5 Smoke przechodzi lokalnie: `npm run smoke`

#### Manual

- [ ] 3.6 Faktury z terminem dziś, wczoraj, 3, 7, 14, 30 i 100 dni temu trafiają kolejno do: bieżące, przed etapem 1, etap 1, 2, 3, 4, 4
- [ ] 3.7 Grupy idą od etapu 4 do bieżących, puste są ukryte, a w grupie najstarszy termin jest pierwszy
- [ ] 3.8 Dodana faktura pojawia się w grupie bez przeładowania, a po odświeżeniu jest w tym samym miejscu
- [ ] 3.9 Duplikat numeru (inna wielkość liter) daje komunikat pod numerem, a błędna kwota pod kwotą
- [ ] 3.10 Stany puste (bez klientów, bez faktur) wyglądają poprawnie; dialog jest obsługiwalny klawiaturą, a fokus wraca na przycisk
- [ ] 3.11 `/dev/ui` pokazuje stany formularza i listy w trybie jasnym i ciemnym

### Phase 4: Wdrożenie

#### Automated

- [ ] 4.1 Job `checks` na PR jest zielony: `gh pr checks`
- [ ] 4.2 Job `deploy` po merge jest zielony: `gh run list --branch main --limit 1`
- [ ] 4.3 Migracja jest zastosowana na produkcji: `npx supabase migration list` pokazuje `create_invoices` po obu stronach

#### Manual

- [ ] 4.4 Smoke na produkcji przechodzi (za zgodą użytkownika, bo zostawia konta testowe): `BASE_URL=https://naleznosci.domblacha.workers.dev npm run smoke`
- [ ] 4.5 Na produkcji dodana faktura z terminem sprzed 3 dni jest w grupie „Etap 1”
