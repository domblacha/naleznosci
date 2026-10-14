# Przejścia stanu, izolacja i walidacja przez API — plan wdrożenia

## Overview

Faza 2 planu testów (`context/foundation/test-plan.md` §3) obejmuje ryzyka #4, #5 i #6.
Celem jest dowód na prawdziwej bazie, że:

- niedozwolone przejście stanu faktury lub klienta jest odrzucane i nie zmienia wiersza,
  a dozwolone zostawia spójny wiersz;
- użytkownik B nie odczyta ani nie zmieni zasobów użytkownika A;
- wartości spoza zakresu wysłane z pominięciem formularza dostają 400 i nie zmieniają stanu;
- `listOpenInvoices` (źródło `/` i `/invoices`) pomija faktury zapłacone i anulowane.

Plan buduje pierwszą warstwę testów integracyjnych w repo: eksportowane handlery tras
wywoływane w Node (Vitest) na lokalnym Supabase dev, z kontami testowymi tworzonymi i
usuwanymi przez admina. `npm test` zostaje bez bazy; CI dla integracji to faza 3.

## Current State Analysis

Źródło: `context/changes/testing-api-state-and-isolation/research.md`.

- Testy: 12 plików unit w `src/lib/`, `vitest.config.ts` ma `include: ["src/**/*.test.ts"]`,
  `npm test` działa w CI (`ci.yml:25`) bez bazy. API, RLS, constrainty i triggery pokrywa
  tylko ręczny `scripts/smoke.mjs` (HTTP, bez odczytu wiersza po odrzuceniu, poza CI).
- Niedozwolone przejście daje **404 `not_found`**, nie 409: serwisy filtrują UPDATE po
  oczekiwanym stanie i mapują 0 wierszy na `not_found` (`src/lib/services/invoices.ts:175-183`,
  `:223-276`; `src/lib/services/invoices-api.ts:11-18`). 409 tylko dla `locked`,
  `duplicate_number`, `client_inactive`, `duplicate_*`, `has_open_invoices`.
- Izolacja opiera się wyłącznie na RLS (`authenticated` per operacja, `anon` → false) i
  złożonym FK `invoices_client_owner_fkey`; żadne zapytanie nie filtruje po `user_id`.
  Cudze id na każdym z 10 endpointów z `[id]` → 404; cudzy `clientId` → 404 `client_not_found`.
- Serwer używa tych samych schematów zod co formularze (research §5); granice schematów
  mają już testy unit.
- `listOpenInvoices` (`invoices.ts:72-81`) filtruje `.is("paid_on", null).is("cancelled_on", null)`;
  wołają ją `src/pages/index.astro:29` i `src/pages/invoices.astro:26`.
- Jedyne importy `astro:*` w ścieżce handlerów: `src/lib/supabase.ts:3` (i
  `src/lib/config-status.ts:1`, nieużywany przez API).
- Wszystkie cztery tabele mają `user_id ... references auth.users (id) on delete cascade` —
  usunięcie użytkownika usuwa jego klientów, faktury, ustawienia i profil.
- `supabase/config.toml`: API 54321, `enable_confirmations = false`, limit rejestracji
  30 / 5 min (`:190`).

## Desired End State

- `npm run test:integration` na działającym lokalnym Supabase uruchamia zestaw, który:
  - przechodzi macierz stan × akcja faktur i klientów (research §2) z asercją na status,
    kod błędu w ciele i stan wiersza po wywołaniu;
  - sprawdza konto B na wszystkich endpointach z `[id]`, przy tworzeniu faktury, na
    zapisie settings/sender-profile i na odczytach serwisów;
  - sprawdza jeden przypadek 400 na endpoint z ciałem;
  - dowodzi testami `it.fails` luk, których baza dziś nie chroni;
  - po zakończeniu nie zostawia kont testowych ani ich danych.
- `npm test` uruchamia tylko testy unit i nadal przechodzi bez bazy.
- `test-plan.md` §4, §6.3, §6.4, §6.5 i README opisują nową warstwę.

Weryfikacja: `npm test`, `npm run test:integration`, `npm run lint`, `npx astro check` zielone;
ręcznie: celowe zepsucie filtra/guardu czerwieni właściwy test, a Studio nie pokazuje
pozostawionych kont.

### Key Discoveries:

- Handler dotyka tylko `context.locals.user`, `context.request`, `context.params` i
  `context.cookies` (przekazywane do `createSupabase`) — research §7. Mock `@/lib/supabase`
  omija `astro:env/server`.
- `setInvoicePayment` przy pierwszej zapłacie zapisuje migawkę z ustawień użytkownika
  (`paymentSnapshot`, `src/lib/charges.ts:138-152`) i czyści `paused_on`; przy zmianie daty
  migawka zostaje (`invoices.ts:144-153`); cofnięcie czyści `paid_on`, obie kolumny migawki
  i `paused_on` (`:126`).
- `updateInvoice` sprawdza blokadę na odczytanym wierszu (`invoices.ts:208`), więc dla
  faktury po terminie zmiana kwoty daje 409 `locked`, a zmiana samego numeru 200.
- Trigger `invoices_guard_client_active` działa pod RLS wywołującego — dla cudzego klienta
  oczekiwany jest 404 `client_not_found`, nie 409 (wniosek researchu do potwierdzenia testem).
- Pliki `.ts` w `src/pages/` Astro traktuje jako trasy — testy nie mogą leżeć obok handlerów.
- Lekcje: bez `db reset` na bazie dev; tytuły `describe`/`it` po angielsku, komentarze po polsku.

## What We're NOT Doing

- **Nie zmieniamy kontraktu 404 dla złego stanu na 409.** Testy utrwalają obecny kontrakt
  (404 + `error:"not_found"` + niezmieniony wiersz); ewentualna zmiana to osobna zmiana produktu.
- **Nie łatamy luk w bazie** (blokada edycji, edycja zamkniętej faktury, `paid_on` w
  przyszłości). Faza je dowodzi testami `it.fails` i odnotowuje jako kandydata na osobną zmianę.
- **`paid_on` przed terminem płatności nie jest luką** — to legalna wcześniejsza wpłata.
  Reguła „wpłata przed wystawieniem” nie ma odpowiednika w schemacie (brak daty wystawienia) —
  tylko odnotowujemy, bez testu.
- **Brak CI dla integracji, `supabase start` w workflow i post-edit hooka** — faza 3.
- **Bez osobnej instancji Supabase i bez `db reset`** — testy działają na bazie dev i sprzątają po sobie.
- **Bez ponownego testowania granic schematów zod** — mają testy unit; integracja sprawdza
  tylko, że schemat jest podpięty.
- **Bez middleware, `@supabase/ssr` i ciasteczek** — auth ze startera (§7 planu testów) zostaje
  przy smoke. `scripts/smoke.mjs` zostaje bez zmian.
- **Bez kolejności trzech kwot rekompensaty** — brak takiej reguły w domenie.

## Implementation Approach

Warstwa: bezpośrednie wywołanie eksportowanych `GET`/`POST`/`PUT`/`DELETE` z modułów
`src/pages/api/**` z ręcznie zbudowanym `APIContext`. `@/lib/supabase` jest zamockowany tak,
by `createClient` zwracał klienta supabase-js zalogowanego jako bieżący użytkownik testu
(klucz anon + sesja z `signInWithPassword`), więc ścieżka obejmuje UUID-guard, 401, zod,
mapowanie statusów, serwis, RLS, constrainty i triggery. Stan po wywołaniu czytamy osobnym
zapytaniem tym samym klientem właściciela (pełny wiersz `select("*")`). Odczyty bez endpointów
(listy, `getSettings`, `getSenderProfile`) testujemy wywołaniem serwisu jako B. Luki bazy
— bezpośrednio przez PostgREST jako właściciel.

Wyrocznie: oczekiwane statusy i kody z kontraktu z research §1–§2, wartości migawki z ustawień,
które test sam zapisał (np. stopa 1000 bp), nigdy z wyniku funkcji produkcyjnej.

Konta: `auth.admin.createUser` (klucz `service_role` tylko w kodzie testów, z
`supabase status -o env`), e-mail `int-<runId>-<rola>@example.com`, potwierdzony. Każdy plik
tworzy własnych użytkowników w `beforeAll` i usuwa ich w `afterAll`; `globalSetup` usuwa
konta `int-*@example.com` pozostawione przez przerwany przebieg. Pliki integracyjne biegną
sekwencyjnie (`fileParallelism: false`), dane są unikalne per test (numery faktur, nazwy, NIP).

## Critical Implementation Details

- **Stan dozwolony dla właściciela w testach izolacji.** Dla każdego endpointu B dostaje
  zasób A w stanie, w którym ta sama akcja wykonana przez A by się udała (np. DELETE payment
  na zapłaconej, DELETE pause na wstrzymanej). Inaczej 404 wynikałby ze stanu, nie z własności,
  i test nie dowodziłby izolacji.
- **Fixtures stanów** wstawiamy klientem właściciela przez PostgREST (RLS działa), z kompletem
  kolumn wymaganych przez constrainty (zapłacona: `paid_on` + obie kolumny migawki; wstrzymana:
  tylko otwarta). Przejście, które jest przedmiotem testu, zawsze idzie przez handler.
- **Daty** wybieramy daleko od „dziś” (termin w przeszłości np. `2024-01-15` dla „po terminie”,
  `2099-12-31` dla „bieżąca”, wpłata `2025-01-10`), żeby nie mockować czasu ani nie zależeć
  od `todayInPoland`.

## Phase 1: Infrastruktura testów integracyjnych

### Overview

Rozdzielenie unit/integration w Vitest, odczyt lokalnego Supabase, konta testowe, wywołanie
handlera jako dany użytkownik i jeden test dowodzący, że cała ścieżka działa.

### Changes Required:

#### 1. Konfiguracja Vitest

**File**: `vitest.config.ts`

**Intent**: Dwa projekty, żeby `npm test` (CI) nie potrzebował bazy, a integracja biegła sekwencyjnie z setupem bazy.

**Contract**: `test.projects`: `unit` — `include: ["src/**/*.test.ts"]`, `exclude` `src/**/*.int.test.ts`;
`integration` — `include: ["src/**/*.int.test.ts"]`, `fileParallelism: false`,
`globalSetup: "src/test/integration/global-setup.ts"`, `setupFiles` z mockiem `@/lib/supabase`,
dłuższy `testTimeout`. Każdy projekt ma `test.name` (`unit`, `integration`), bo `--project` dopasowuje
po nazwie, i `extends: true`, żeby dziedziczył wspólny alias `@`. Nadpisanie `exclude` w `unit`
zachowuje domyślne wykluczenia (`...configDefaults.exclude`).

#### 2. Skrypty npm

**File**: `package.json`

**Intent**: Jawne wejście do każdej warstwy.

**Contract**: `"test": "vitest run --project unit"`, nowy `"test:integration": "vitest run --project integration"`.

#### 3. Global setup

**File**: `src/test/integration/global-setup.ts`

**Intent**: Ustalić URL i klucze lokalnego Supabase i posprzątać po przerwanych przebiegach, zanim ruszy pierwszy plik.

**Contract**: Czyta `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` z `process.env`, a gdy ich brak — z
`npx supabase status -o env` (odfiltrować linie CLI, parsować `KEY="value"`). Brak stacka →
błąd z komunikatem „uruchom `npx supabase start`”. **Straż celu:** odmawia startu, gdy host `API_URL` nie jest
`127.0.0.1` ani `localhost` (klucz `service_role` i `deleteUser` nie mogą trafić w zdalny projekt). Przekazuje wartości do testów przez `provide`
(z deklaracją typu `ProvidedContext`). Usuwa użytkowników o e-mailu pasującym do
`^int-\d+-[a-z]+@example\.com$` (`auth.admin.listUsers` w pętli po stronach, bo jedna strona to 50 kont, + `deleteUser`) — i tylko ich.

#### 4. Harness

**File**: `src/test/integration/harness.ts` (+ `src/test/integration/setup.ts` z `vi.mock`)

**Intent**: Wspólne narzędzia, żeby pliki testów opisywały tylko przypadki.

**Contract**:
- `createTestUsers(roles)` → dla każdej roli `{ user, client }` (admin create + `signInWithPassword` kluczem anon; klient z `persistSession: false, autoRefreshToken: false`, żeby timery nie trzymały procesu); `deleteTestUsers(users)` do `afterAll`.
- `callRoute(handler, { as, method, params, body, rawBody })` → `{ status, body }`; ustawia klienta zwracanego przez zamockowane `createClient` na klienta `as` (albo brak użytkownika dla przypadków 401), buduje `Request` z JSON-em i `locals.user`.
- `readRow(client, table, id)` → pełny wiersz albo `null`; `countRows(client, table)`.
- Fixtures: `insertClient(client, overrides)`, `insertInvoice(client, clientId, state, overrides)` dla stanów `open-current`, `open-overdue`, `paused`, `paid`, `cancelled`, z unikalnymi numerami/nazwami/NIP.
- `setup.ts`: `vi.mock("@/lib/supabase", () => ({ createClient: () => currentClient() }))`. Jeśli mock z `setupFiles` nie obejmuje importów handlerów, to samo wywołanie trafia na górę każdego pliku `*.int.test.ts`.

Klucz `service_role` jest używany wyłącznie w `src/test/integration/`; nic z tego katalogu nie jest importowane przez `src/pages` ani `src/lib` poza plikami `*.int.test.ts`.

#### 5. Limit logowań w lokalnym Supabase

**File**: `supabase/config.toml`

**Intent**: `admin.createUser` omija limit rejestracji, ale `signInWithPassword` w harnessie podlega `sign_in_sign_ups` (30 / 5 min / IP, `:190`). Zestaw robi ok. 8 logowań na przebieg, więc kilka przebiegów w 5 minut (kroki ręczne, testy mutacyjne) kończyłoby się 429 i losowo czerwonymi testami.

**Contract**: w `[auth.rate_limit]` ustawić `sign_in_sign_ups = 1000` z komentarzem po angielsku, że to dla testów integracyjnych. Zmiana dotyczy tylko lokalnego stacka: CI robi `supabase db push`, nie `config push`, więc produkcja bez zmian. Po zmianie `npx supabase stop` i `npx supabase start` (bez `--no-backup`; dane dev zostają, bez `db reset`).

#### 6. Test infrastruktury

**File**: `src/test/integration/harness.int.test.ts`

**Intent**: Dowód, że ścieżka handler → mock → RLS działa, zanim powstaną macierze.

**Contract**: `POST /api/clients` jako A → 201, wiersz widoczny dla A przez `readRow`, `user_id` = id A; to samo wywołanie bez użytkownika → 401 i brak nowego wiersza.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi i nie uruchamia żadnego pliku `*.int.test.ts`
- `npm run test:integration` przechodzi na działającym lokalnym Supabase
- `npm run lint` przechodzi
- `npx astro check` przechodzi

#### Manual Verification:

- Przy zatrzymanym Supabase `npm run test:integration` kończy się czytelnym komunikatem o `npx supabase start`
- Po przebiegu Studio (`localhost:54323` → Authentication) nie pokazuje kont `int-*@example.com`, a dane dev użytkownika są nietknięte

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Przejścia stanu (#4) i filtr list

### Overview

Macierz stan × akcja dla faktur i klientów oraz filtr `listOpenInvoices`, na jednym koncie.

### Changes Required:

#### 1. Macierz faktur

**File**: `src/lib/services/invoice-transitions.int.test.ts`

**Intent**: Każda komórka macierzy research §2 jako przypadek tabelaryczny (`describe.each`/`it.each`).

**Contract**:
- **Niedozwolone → status + `error` + wiersz identyczny jak przed wywołaniem:**
  - edycja (kwota/termin/klient) zapłaconej i anulowanej → 404 `not_found`; edycja tylko numeru zapłaconej i anulowanej → 404;
  - edycja kwoty i terminu faktury po terminie, niewstrzymanej → 409 `locked`;
  - zapłata anulowanej → 404; cofnięcie wpłaty otwartej, po terminie, wstrzymanej, anulowanej → 404;
  - anulowanie zapłaconej i anulowanej → 404; przywrócenie otwartej, wstrzymanej, zapłaconej → 404;
  - wstrzymanie wstrzymanej, zapłaconej, anulowanej → 404; wznowienie otwartej, zapłaconej, anulowanej → 404.
- **Dozwolone → status 200/201 i spójny wiersz:**
  - edycja numeru faktury po terminie → 200, zmieniony tylko numer; edycja kwoty wstrzymanej po terminie → 200;
  - zapłata otwartej i wstrzymanej (po zapisaniu przez test własnych ustawień, np. stopa 1000 bp) → `paid_on` = data z ciała, `paid_rate_bp` = 1000, `paid_compensation_grosze` = kwota progu z ustawień testu (lub 0 dla klienta bez rekompensaty), `paused_on` = null;
  - zmiana daty zapłaconej po zmianie ustawień → nowa `paid_on`, migawka bez zmian;
  - cofnięcie wpłaty → `paid_on`, obie kolumny migawki i `paused_on` = null;
  - anulowanie otwartej, po terminie, wstrzymanej → `cancelled_on` ustawione, `paused_on` = null;
  - przywrócenie anulowanej → `cancelled_on` = null; wstrzymanie → `paused_on` ustawione; wznowienie → `paused_on` = null.
- **Reguły z bazy:**
  - tworzenie z numerem zajętym (inna wielkość liter) → 409 `duplicate_number`, liczba faktur bez zmian; numer anulowanej faktury jest wolny → 201;
  - przywrócenie anulowanej, gdy numer zajęła nowa faktura → 409 `duplicate_number`, wiersz bez zmian;
  - tworzenie faktury dla usuniętego klienta → 409 `client_inactive`, brak nowego wiersza;
  - cofnięcie wpłaty, gdy klient jest już usunięty → 409 `client_inactive`, wiersz bez zmian;
  - przywrócenie anulowanej u usuniętego klienta → 409 `client_inactive`.
- Niepoprawny UUID w `[id]` → 404 (jeden przypadek na trasę z `[id]`).

#### 2. Macierz klientów

**File**: `src/lib/services/client-transitions.int.test.ts`

**Intent**: Przejścia klienta i trigger blokujący usunięcie.

**Contract**:
- usunięcie klienta z otwartą lub wstrzymaną fakturą → 409 `has_open_invoices`, `deactivated_on` = null;
- usunięcie klienta tylko z zapłaconą i anulowaną → 200, `deactivated_on` ustawione;
- edycja, usunięcie usuniętego → 404; przywrócenie aktywnego → 404; przywrócenie usuniętego → 200;
- duplikat NIP / nazwy z aktywnym → 409 `duplicate_nip` / `duplicate_name`; z usuniętym → wariant `_inactive`; liczba klientów bez zmian.

#### 3. Filtr list

**File**: `src/lib/services/open-invoices.int.test.ts`

**Intent**: Gwarancja, której faza 1 nie mogła sprawdzić bez bazy (test-plan §6.5).

**Contract**: użytkownik z fakturą otwartą, wstrzymaną, zapłaconą i anulowaną: `listOpenInvoices` zwraca dokładnie id otwartej i wstrzymanej; `listPaidInvoices` tylko zapłaconą; `listCancelledInvoices` tylko anulowaną.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` przechodzi, w tym trzy nowe pliki
- `npm test`, `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Usunięcie `.is("cancelled_on", null)` z `listOpenInvoices` czerwieni test filtra; po przywróceniu jest zielony
- Usunięcie `.not("paid_on", "is", null)` z gałęzi cofnięcia wpłaty w `setInvoicePayment` czerwieni przypadek „cofnięcie wpłaty otwartej”; po przywróceniu jest zielony

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Izolacja użytkowników (#5)

### Overview

Konto B przeciw zasobom konta A na każdym endpointcie i odczycie.

### Changes Required:

#### 1. Testy izolacji

**File**: `src/lib/services/isolation.int.test.ts`

**Intent**: Dowód, że cudze id nie działa nigdzie, a dane A zostają bez zmian.

**Contract**:
- **10 endpointów z `[id]`** (`PUT /api/invoices/:id`, `PUT|DELETE .../payment`, `PUT|DELETE .../cancellation`, `PUT|DELETE .../pause`, `PUT /api/clients/:id`, `PUT|DELETE .../deactivation`): B na zasobie A w stanie dozwolonym dla A → 404 `not_found`, wiersz A identyczny jak przed wywołaniem.
- **Cudzy klient:** B tworzy fakturę z `clientId` A → 404 `client_not_found`, A i B bez nowych faktur; B edytuje własną fakturę (stan `open-current` — po terminie wynik byłby 409 `locked`, bo zmiana `clientId` jest zmianą pola blokowanego), podając `clientId` A → 404, wiersz B bez zmian; to samo dla usuniętego klienta A → 404 `client_not_found` (nie 409 `client_inactive`).
- **Zapis bez id:** A ma własne ustawienia i profil nadawcy; B robi `PUT /api/settings` i `PUT /api/sender-profile` → 200 dla B, wiersze A identyczne jak przed.
- **Odczyty:** jako B (bez własnych danych) `listClients`, `listActiveClients`, `listOpenInvoices`, `listPaidInvoices`, `listCancelledInvoices` → puste; `getSettings` → wartości domyślne, nie ustawienia A; `getSenderProfile` → pusty profil, nie profil A.
- **Brak sesji:** każda trasa mutująca bez użytkownika → 401 `unauthorized`, wiersze A bez zmian.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` przechodzi, w tym `isolation.int.test.ts`
- `npm test`, `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Tymczasowe poluzowanie polityki `select` na `invoices` czerwieni testy odczytów (zmiana w Studio na `using (true)`, potem przywrócenie tym samym SQL-em co w migracji `create_invoices`, bez `db reset`)

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Walidacja serwera (#6), luki bazy i dokumentacja

### Overview

Jeden przypadek 400 na endpoint z ciałem, testy `it.fails` dla luk bazy i wpisy w dokumentacji.

### Changes Required:

#### 1. Walidacja

**File**: `src/lib/services/validation.int.test.ts`

**Intent**: Dowód, że schemat jest podpięty na serwerze i odrzucenie nie zmienia stanu.

**Contract**: każdy przypadek → 400, `error:"invalid_input"`, `fieldErrors` zawiera wskazane pole, stan bez zmian (wiersz lub liczba wierszy):
- `POST /api/clients` — NIP z błędną sumą kontrolną;
- `PUT /api/clients/:id` — pusta nazwa;
- `POST /api/invoices` — kwota `"0,00"`;
- `PUT /api/invoices/:id` — kwota ujemna;
- `PUT /api/invoices/:id/payment` — `paidOn` w przyszłości (`2099-01-01`);
- `PUT /api/settings` — progi niemonotoniczne; dodatkowo stopa podana liczbą JSON zamiast tekstu;
- `PUT /api/sender-profile` — IBAN z błędną sumą kontrolną;
- jedna trasa z ciałem nie-JSON → 400 `invalid_input`, `fieldErrors: {}`.

#### 2. Luki bazy

**File**: `src/lib/services/db-gaps.int.test.ts`

**Intent**: Uruchomić wnioski researchu: reguły egzekwowane tylko w serwisie są obchodzone przez PostgREST. `it.fails` asertuje pożądane zachowanie (baza odrzuca), więc test przejdzie na czerwono, gdy luka zostanie załatana — sygnał do zdjęcia `.fails`.

**Contract**: jako właściciel, bezpośrednio przez supabase-js (bez handlera), tytuły zaczynają się od `known gap:`. `it.fails` zalicza test przy dowolnym wyjątku, więc fixture'y powstają w `beforeAll`/`beforeEach` (ich błąd czerwieni test), a ciało `it.fails` zawiera tylko update i `expect(error).not.toBeNull()` (supabase-js zwraca błąd, nie rzuca). Do każdej luki dochodzi zwykły test kontrolny: ta sama zmiana na stanie dozwolonym (otwarta, niewstrzymana, przed terminem) kończy się bez błędu, co dowodzi, że update i fixture są poprawne:
- zmiana `amount_grosze` zapłaconej faktury → oczekiwany błąd bazy;
- zmiana `amount_grosze` anulowanej faktury → oczekiwany błąd bazy;
- zmiana `due_date` faktury po terminie, niewstrzymanej → oczekiwany błąd bazy;
- ustawienie `paid_on` w przyszłości (z kompletem migawki) → oczekiwany błąd bazy.

#### 3. Dokumentacja

**File**: `context/foundation/test-plan.md`, `README.md`

**Intent**: Następna osoba wie, jak dodać test integracyjny i co jest luką.

**Contract**:
- §4 Stack: wiersz „integration” — narzędzie i komenda `npm run test:integration`, wymóg działającego `npx supabase start`.
- §6.3: wzorzec przejścia (macierz, asercja status + kod + `readRow` przed/po, fixtures przez PostgREST, przejście przez handler), przykład `invoice-transitions.int.test.ts`.
- §6.4: wzorzec nowego endpointu (B na zasobie A w stanie dozwolonym dla A; jeden przypadek 400 ze stanem bez zmian), przykłady `isolation.int.test.ts`, `validation.int.test.ts`.
- §6.5: notatka fazy 2 — kontrakt 404 dla złego stanu; lista luk z `db-gaps.int.test.ts` jako kandydat na osobną zmianę (trigger blokady / check daty); brak reguły „wpłata przed wystawieniem”.
- README → Available Scripts: `npm test` (unit) i `npm run test:integration` (wymaga lokalnego Supabase, tworzy i usuwa konta `int-*@example.com`, nie resetuje bazy).

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` przechodzi, w tym `validation.int.test.ts` i `db-gaps.int.test.ts` (luki raportowane jako oczekiwane porażki)
- `npm test`, `npm run lint` i `npx astro check` przechodzą

#### Manual Verification:

- Podmiana schematu w `PUT /api/settings` na `z.any()` czerwieni przypadek progów niemonotonicznych; po przywróceniu jest zielony
- Wpisy w `test-plan.md` §4, §6.3–§6.5 i README są zrozumiałe bez czytania tego planu

---

## Testing Strategy

### Unit Tests:

- Bez zmian; `npm test` uruchamia tylko projekt `unit`.

### Integration Tests:

- `harness.int.test.ts` — ścieżka handler → mock → RLS.
- `invoice-transitions`, `client-transitions`, `open-invoices` — ryzyko #4 i filtr list.
- `isolation` — ryzyko #5.
- `validation`, `db-gaps` — ryzyko #6 i luki bazy.

### Manual Testing Steps:

1. `npx supabase start`, potem `npm run test:integration` dwa razy z rzędu — oba przebiegi zielone.
2. Przerwij przebieg (Ctrl+C) w połowie, uruchom ponownie — `globalSetup` usuwa pozostawione konta.
3. Testy mutacyjne z kryteriów każdej fazy.

## Performance Considerations

Pliki biegną sekwencyjnie na wspólnej bazie; każdy tworzy 1–3 konta przez admina (bez limitu
rejestracji). Oczekiwany czas zestawu: dziesiątki sekund — akceptowalny lokalnie; w razie potrzeby
faza 3 rozważy współbieżność plików z unikalnymi danymi.

## Migration Notes

Brak migracji. Testy nie wykonują `db reset`; jedyne trwałe skutki to konta testowe, usuwane
w `afterAll` i w `globalSetup`.

## References

- Research: `context/changes/testing-api-state-and-isolation/research.md`
- Plan testów: `context/foundation/test-plan.md` §2 (#4–#6), §3 faza 2, §6.3–§6.5
- Kontrakt i macierz: `src/lib/services/invoices.ts:64-276`, `src/lib/services/invoices-api.ts:11-78`, `src/lib/services/clients.ts:47-146`
- Constrainty i triggery: `supabase/migrations/20261007180000_add_invoice_cancelled_on.sql:12,17`, `20261008120000_add_invoice_paused_on.sql:11`, `20261009120000_add_client_deactivated_on.sql:17-66`, `20261010130000_add_invoice_payment_snapshot.sql:32-35`
- Poprzednia faza: `context/changes/testing-domain-rules/plan.md`
- HTTP smoke (izolacja przez HTTP): `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastruktura testów integracyjnych

#### Automated

- [x] 1.1 `npm test` przechodzi i nie uruchamia żadnego pliku `*.int.test.ts` — 81086d7
- [x] 1.2 `npm run test:integration` przechodzi na działającym lokalnym Supabase — 81086d7
- [x] 1.3 `npm run lint` przechodzi — 81086d7
- [x] 1.4 `npx astro check` przechodzi — 81086d7

#### Manual

- [x] 1.5 Przy zatrzymanym Supabase `npm run test:integration` kończy się czytelnym komunikatem o `npx supabase start` — 81086d7
- [x] 1.6 Po przebiegu Studio (`localhost:54323` → Authentication) nie pokazuje kont `int-*@example.com`, a dane dev użytkownika są nietknięte — 81086d7

### Phase 2: Przejścia stanu (#4) i filtr list

#### Automated

- [x] 2.1 `npm run test:integration` przechodzi, w tym trzy nowe pliki — 4222d55
- [x] 2.2 `npm test`, `npm run lint` i `npx astro check` przechodzą — 4222d55

#### Manual

- [x] 2.3 Usunięcie `.is("cancelled_on", null)` z `listOpenInvoices` czerwieni test filtra; po przywróceniu jest zielony — 4222d55
- [x] 2.4 Usunięcie `.not("paid_on", "is", null)` z gałęzi cofnięcia wpłaty w `setInvoicePayment` czerwieni przypadek „cofnięcie wpłaty otwartej”; po przywróceniu jest zielony — 4222d55

### Phase 3: Izolacja użytkowników (#5)

#### Automated

- [x] 3.1 `npm run test:integration` przechodzi, w tym `isolation.int.test.ts`
- [x] 3.2 `npm test`, `npm run lint` i `npx astro check` przechodzą

#### Manual

- [x] 3.3 Tymczasowe poluzowanie polityki `select` na `invoices` czerwieni testy odczytów (zmiana w Studio na `using (true)`, potem przywrócenie tym samym SQL-em co w migracji `create_invoices`, bez `db reset`)

### Phase 4: Walidacja serwera (#6), luki bazy i dokumentacja

#### Automated

- [ ] 4.1 `npm run test:integration` przechodzi, w tym `validation.int.test.ts` i `db-gaps.int.test.ts` (luki raportowane jako oczekiwane porażki)
- [ ] 4.2 `npm test`, `npm run lint` i `npx astro check` przechodzą

#### Manual

- [ ] 4.3 Podmiana schematu w `PUT /api/settings` na `z.any()` czerwieni przypadek progów niemonotonicznych; po przywróceniu jest zielony
- [ ] 4.4 Wpisy w `test-plan.md` §4, §6.3–§6.5 i README są zrozumiałe bez czytania tego planu
