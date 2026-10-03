# Dodawanie i edycja klientów — plan implementacji

## Overview

Wycinek S-02 z roadmapy (FR-002, część „dodaj i edytuj”). Zalogowany użytkownik dodaje klienta (nazwa, opcjonalny NIP, przełącznik „naliczaj rekompensatę” domyślnie włączony), edytuje go i widzi listę swoich klientów na `/clients`. Duplikat jest odrzucany. To pierwsza tabela domenowa, więc wycinek ustala wzorzec izolacji danych właściciela (RLS), z którego korzystają kolejne wycinki.

## Current State Analysis

- Brak warstwy danych: nie ma `supabase/migrations/` ani `src/types.ts`. `supabase/config.toml` istnieje (Postgres 17), ale lokalny projekt nie jest powiązany z produkcyjnym (`supabase/.temp` nie ma project-ref).
- Wzorzec formularzy auth: wyspa React waliduje po stronie klienta, potem robi natywny `POST` na `/api/auth/*`, endpoint waliduje zod-em i odsyła redirect z `?error=<kod>`, a kod tłumaczy na polski mapa w `src/lib/auth-errors.ts`. Ten wycinek celowo odchodzi od redirectów na rzecz **dialogu + fetch JSON** (decyzja z planowania), ale reużywa komponentów pól.
- Komponenty do reużycia: `FormField` (`src/components/auth/FormField.tsx` — etykieta, ikona, błąd pola, `aria-invalid`/`aria-describedby`), `ServerError`, `SubmitButton`. W `src/components/ui/` są tylko `alert`, `button`, `card`, `input`, `label`.
- Ochrona tras: `PROTECTED_ROUTES` w `src/middleware.ts:6` jest puste; `/` chronione dokładnym dopasowaniem. Middleware ustawia `locals.user`.
- Brak test runnera. Jest `scripts/smoke.mjs`: bezzależnościowy, obsługuje słoik ciasteczek i wysyła tylko formularze urlencoded.
- Wdrożenie: każdy push na `main` od razu wdraża Workera (README §Deployment). Rollback Workera nie cofa migracji (`context/foundation/infrastructure.md:71`).
- `lessons.md`: w `.astro` na komponentach React używa się `className`, nie `class`.

## Desired End State

- Tabela `public.clients` z RLS: użytkownik widzi i zmienia wyłącznie swoje wiersze, `anon` nie ma dostępu, twarde usuwanie zablokowane.
- Reguła duplikatu jest wymuszana w bazie (częściowe indeksy unikalne) i tłumaczona na polski komunikat przy właściwym polu.
- `/clients` (chroniona) pokazuje listę klientów alfabetycznie, ze stanem pustym. Dialog dodawania i edycji działa bez przeładowania strony, a lista odświeża się lokalnie.
- Topbar ma nawigację „Faktury” (`/`) i „Klienci” (`/clients`).
- `npm test` (Vitest) pokrywa logikę NIP i schematu, a `npm run smoke` sprawdza CRUD klienta, 409 przy duplikacie, 401 bez sesji i izolację między dwoma użytkownikami.
- Migracja jest zastosowana na produkcji przed pushem kodu, a procedura opisana w README.

### Key Discoveries:

- Wzorzec endpointu i walidacji: `src/pages/api/auth/signup.ts:7-25` (`prerender = false`, `safeParse`, `createClient` może zwrócić `null` przy braku konfiguracji).
- Polskie komunikaty z kodu błędu: `src/lib/auth-errors.ts:1-23`.
- Pole formularza z błędem: `src/components/auth/FormField.tsx:1-70` (wymaga propa `icon`).
- Blokada „pending” przy submicie i bfcache: `src/components/hooks/use-submit-pending.ts`.
- Kitchen sink do rozszerzenia: `src/pages/dev/ui.astro`, `src/components/dev/KitchenSinkForms.tsx` (sekcja „Empty” jest dziś N/A, teraz pojawia się realny stan pusty).
- Reguła ESLint zakazująca literałów kolorów i arbitralnych wartości w widokach: `eslint.config.js:89-99` (nie dotyczy `src/components/ui/**`).
- Przykładowy poprawny NIP do testów: `1234563218` (wagi 6,5,7,2,3,4,5,6,7 → suma 118, 118 mod 11 = 8 = ostatnia cyfra).

## What We're NOT Doing

- Dezaktywacja, przywracanie i usuwanie klienta (S-09). Nie dodajemy kolumny `is_active`, bo indeksy unikalne bez filtra aktywności już obejmą przyszłych nieaktywnych klientów.
- Twarde usuwanie: polityka `delete` jest zawsze `false`.
- Dodatkowe pola klienta (e-mail, adres, osoba kontaktowa): PRD ich nie wymaga, ponaglenie idzie do schowka.
- Wyszukiwanie, filtrowanie i paginacja listy klientów.
- Nazwa jako duplikat względem klienta **z** NIP. „Acme” z NIP i „acme” bez NIP mogą współistnieć (decyzja z planowania).
- Weryfikacja NIP w zewnętrznych rejestrach (GUS, biała lista VAT). Sprawdzamy tylko format i sumę kontrolną.
- Automatyczne migracje w CI.
- Przenoszenie `FormField`/`ServerError`/`SubmitButton` z `components/auth/`: importujemy je z obecnego miejsca.

## Implementation Approach

Regułę duplikatu wymusza baza (dwa częściowe indeksy unikalne), więc nie ma wyścigu przy równoczesnych zapisach. Aplikacja normalizuje dane wejściowe **przed** zapisem: NIP do 10 cyfr, nazwę przycina i zwija w niej spacje. Dzięki temu indeks na `lower(name)` i `nip` porównuje już postać kanoniczną. Ten sam schemat zod waliduje dane w API i w dialogu, więc komunikaty klienta i serwera są spójne. Izolację zapewnia RLS (`(select auth.uid()) = user_id`), a API dodatkowo zwraca 401 bez sesji i 404, gdy wiersz jest niewidoczny. Lista jest renderowana SSR i przekazywana do wyspy jako props, a wyspa po zapisie aktualizuje stan lokalnie odpowiedzią API.

## Critical Implementation Details

**Kolejność wdrożenia.** Push na `main` od razu wdraża kod. Migrację trzeba zastosować na produkcyjnej bazie (`supabase db push`) **przed** pushem kodu, który z niej korzysta. W odwrotnej kolejności `/clients` zwraca błąd do czasu migracji. Rollback Workera nie cofa schematu.

**Mapowanie naruszenia unikalności.** Supabase zwraca `code: "23505"`, a nazwę naruszonego indeksu podaje w `message`/`details`. Mapowanie na `duplicate_nip` / `duplicate_name` musi rozpoznawać nazwę indeksu (`clients_user_nip_key` / `clients_user_name_key`), więc nazwy w migracji i w kodzie muszą być identyczne.

## Phase 1: Warstwa danych i reguły

### Overview

Tabela z RLS i indeksami duplikatów, współdzielone typy, czysta logika NIP i schemat walidacji, Vitest z testami jednostkowymi.

### Changes Required:

#### 1. Migracja tabeli klientów

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_clients.sql`

**Intent**: Utworzyć pierwszą tabelę domenową z izolacją właściciela i wymuszeniem reguły duplikatu w bazie.

**Contract**:
- `public.clients`:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
  - `name text not null` z checkiem: długość po `btrim` 1–200
  - `nip text null` z checkiem `nip ~ '^[0-9]{10}$'`
  - `charge_compensation boolean not null default true`
  - `created_at timestamptz not null default now()`
- Indeksy: `clients_user_nip_key` unique `(user_id, nip) where nip is not null` i `clients_user_name_key` unique `(user_id, lower(name)) where nip is null`.
- `enable row level security`. Po jednej polityce na parę operacja × rola (8 polityk):
  - `authenticated`: `select`/`update` z `using ((select auth.uid()) = user_id)`, `update` dodatkowo z `with check` o tym samym warunku; `insert` z `with check ((select auth.uid()) = user_id)`; `delete` z `using (false)`.
  - `anon`: wszystkie cztery z `false`.

#### 2. Typy współdzielone

**File**: `src/types.ts`

**Intent**: Encja i DTO klienta wspólne dla serwisu, API i wyspy.

**Contract**: `Client { id: string; name: string; nip: string | null; chargeCompensation: boolean; createdAt: string }` (camelCase w DTO; mapowanie z snake_case w serwisie) oraz `ClientInput { name: string; nip: string | null; chargeCompensation: boolean }`.

#### 3. Logika NIP

**File**: `src/lib/nip.ts`

**Intent**: Normalizacja i walidacja NIP w jednym miejscu, używana przez schemat.

**Contract**:
- `normalizeNip(raw: string): string` usuwa białe znaki i myślniki oraz prefiks `PL` (bez rozróżniania wielkości liter).
- `isValidNip(nip: string): boolean` sprawdza dokładnie 10 cyfr i sumę kontrolną: wagi 6,5,7,2,3,4,5,6,7, suma mod 11 równa ostatniej cyfrze; wynik 10 oznacza zawsze błąd.

#### 4. Schemat klienta i komunikaty błędów

**File**: `src/lib/client-schemas.ts`, `src/lib/client-errors.ts`

**Intent**: Jeden schemat zod dla API i dialogu, który zwraca dane kanoniczne. Polskie komunikaty dla kodów błędów API.

**Contract**:
- `clientInputSchema` (zod) → `ClientInput`:
  - `name`: przycięcie i zwinięcie spacji, 1–200 znaków; komunikaty „Podaj nazwę klienta” / „Nazwa może mieć najwyżej 200 znaków”.
  - `nip`: pusty string lub brak → `null`, w przeciwnym razie `normalizeNip`, a następnie `isValidNip`; komunikat „Podaj poprawny NIP (10 cyfr)”.
  - `chargeCompensation`: boolean, domyślnie `true`.
- `clientErrorMessage(code)` w stylu `auth-errors.ts`:
  - `duplicate_nip` → „Klient z tym NIP-em już istnieje.”
  - `duplicate_name` → „Klient o tej nazwie (bez NIP) już istnieje.”
  - `not_found`, `unauthorized`, `config_missing` i domyślny komunikat.

#### 5. Vitest

**File**: `package.json`, `vitest.config.ts`, `src/lib/nip.test.ts`, `src/lib/client-schemas.test.ts`

**Intent**: Wprowadzić runner testów jednostkowych (S-03 dostaje go gotowego) i pokryć reguły tego wycinka.

**Contract**:
- `vitest` w devDependencies, skrypt `"test": "vitest run"`.
- Konfiguracja z aliasem `@` → `./src` i środowiskiem `node`, bez ładowania adaptera Cloudflare.
- Pliki `*.test.ts` przechodzą `npm run lint`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się lokalnie od zera: `npx supabase db reset`
- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- W lokalnym Studio tabela `clients` ma włączone RLS i 8 polityk (4 × `authenticated`, 4 × `anon`), bez polityki `FOR ALL`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą. Checkboxy kryteriów są w `## Progress`.

---

## Phase 2: API i ochrona tras

### Overview

Serwis dostępu do danych, endpointy JSON tworzenia i edycji, ochrona `/clients` i smoke test izolacji.

### Changes Required:

#### 1. Serwis klientów

**File**: `src/lib/services/clients.ts`

**Intent**: Jedyne miejsce zapytań do tabeli `clients`: mapowanie wierszy na DTO i błędów Postgresa na kody domenowe.

**Contract**:
- `listClients(supabase): Promise<Client[]>` sortuje po nazwie (`order("name")`). Ostateczne sortowanie z polską kolacją robi UI przez `localeCompare(…, "pl")`.
- `createClient(supabase, input): Promise<Result>`.
- `updateClient(supabase, id, input): Promise<Result>`.
- `Result` = `{ ok: true, client } | { ok: false, code: "duplicate_nip" | "duplicate_name" | "not_found" | "unknown" }`.
- `update` bez zwróconego wiersza (np. cudzy lub nieistniejący `id` ukryty przez RLS) daje `not_found`. Kod `23505` daje `duplicate_*` na podstawie nazwy indeksu.
- `user_id` nie jest przesyłany z aplikacji, bo ustawia go `default auth.uid()`.

#### 2. Endpointy

**File**: `src/pages/api/clients/index.ts`, `src/pages/api/clients/[id].ts`

**Intent**: Tworzenie i edycja klienta przez JSON dla dialogu.

**Contract**:
- `export const prerender = false`.
- `POST /api/clients` i `PUT /api/clients/[id]` przyjmują JSON zgodny z `clientInputSchema`.
- Odpowiedzi:
  - `201`/`200` z `{ client }`;
  - `400 { error: "invalid_input", fieldErrors }` (z `z.flattenError` lub odpowiednika w zod 4);
  - `401 { error: "unauthorized" }` bez `locals.user`;
  - `404 { error: "not_found" }`, także dla `id` niebędącego UUID;
  - `409 { error: "duplicate_nip" | "duplicate_name" }`;
  - `500 { error: "config_missing" | "unknown" }`.

#### 3. Ochrona strony

**File**: `src/middleware.ts`

**Intent**: Niezalogowany użytkownik na `/clients` trafia na logowanie.

**Contract**: `PROTECTED_ROUTES = ["/clients"]`. Ścieżek API nie dodajemy do listy, bo same zwracają 401 w JSON zamiast redirectu.

#### 4. Smoke test klientów i izolacji

**File**: `scripts/smoke.mjs`

**Intent**: Automatycznie dowieść, że RLS i API izolują dane między kontami, a duplikat jest odrzucany.

**Contract**:
- `request` obsługuje body JSON i zwraca `status`, `location` oraz sparsowane body lub tekst.
- Każdy użytkownik ma osobny słoik ciasteczek.
- Nowe kroki po istniejących:
  - bez sesji: `POST /api/clients` → 401, `GET /clients` → 302 na `/auth/signin`;
  - użytkownik A: utworzenie klienta z NIP → 201; ponownie ten sam NIP w innym zapisie (`PL 123-456-32-18` vs `1234563218`) → 409 `duplicate_nip`; klient bez NIP „Acme Smoke” → 201, a „acme  smoke” → 409 `duplicate_name`; `PUT` własnego klienta → 200; `GET /clients` → 200 i zawiera nazwę;
  - użytkownik B: `PUT` klienta A → 404; `GET /clients` → 200 i **nie** zawiera nazwy klienta A; utworzenie klienta z tym samym NIP co A → 201 (duplikaty są per właściciel).
- Nazwy klientów zawierają znacznik czasu, żeby kolejne uruchomienia się nie gryzły.

### Success Criteria:

#### Automated Verification:

- Lint i typy przechodzą: `npm run lint && npx astro check`
- Testy jednostkowe nadal przechodzą: `npm test`
- Smoke przechodzi na dev serwerze z lokalnym Supabase: `npm run dev` + `npm run smoke`

#### Manual Verification:

- Niezalogowany `GET /clients` w przeglądarce przekierowuje na `/auth/signin`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Phase 3: UI listy i dialogu

### Overview

Strona `/clients` z wyspą listy i dialogu dodawania/edycji, nawigacja w Topbar i stany w kitchen sinku.

### Changes Required:

#### 1. Komponenty shadcn

**File**: `src/components/ui/dialog.tsx`, `src/components/ui/switch.tsx`, `src/components/ui/table.tsx`

**Intent**: Brakujące klocki UI zamiast własnych implementacji.

**Contract**: `npx shadcn@latest add dialog switch table` (styl lyra z `components.json`). Bez modyfikacji kolorów przez `className`.

#### 2. Strona klientów

**File**: `src/pages/clients.astro`

**Intent**: Chroniona strona renderująca listę SSR i przekazująca ją do wyspy.

**Contract**:
- Wywołuje `listClients` z klientem Supabase z requestu, a wyspa dostaje `<ClientsManager initialClients={...} client:load />`.
- Layout jak `index.astro` (`Topbar`), tytuł „Klienci”.
- Na komponentach React w `.astro` używa `className` (lessons.md).

#### 3. Wyspa listy i dialogu

**File**: `src/components/clients/ClientsManager.tsx`, `src/components/clients/ClientFormDialog.tsx`, `src/components/hooks/use-client-form.ts`

**Intent**: Lista klientów z akcjami „Dodaj klienta” i „Edytuj”. Dialog z formularzem, walidacją klienta tym samym schematem i obsługą odpowiedzi API.

**Contract**:
- **Lista**: tabela z kolumnami Nazwa, NIP (10 cyfr albo „—”), Rekompensata (Tak/Nie) i przyciskiem „Edytuj”, sortowana `localeCompare(…, "pl")`. Gdy brak klientów, stan pusty „Nie masz jeszcze klientów” z przyciskiem dodania.
- **Dialog**:
  - pola: nazwa (`FormField`) i NIP (`FormField`, opcjonalny, podpowiedź „Opcjonalnie, np. 123-456-32-18”);
  - przełącznik „Naliczaj rekompensatę” (`Switch` + `Label`), domyślnie włączony przy dodawaniu;
  - w trybie edycji pola wypełnione bieżącymi wartościami;
  - submit przez `SubmitButton` z blokadą w trakcie zapisu.
- **Obsługa odpowiedzi**:
  - `400` → błędy przy polach;
  - `409 duplicate_nip` → błąd pod polem NIP, `duplicate_name` → pod polem nazwy;
  - inne błędy → `ServerError` w dialogu;
  - sukces → zamknięcie dialogu i podmiana lub dodanie wiersza w stanie listy.
- **Hook** `use-client-form` trzyma stan pól i błędów, waliduje `clientInputSchema` i wysyła żądanie.
- Brak literałów kolorów i arbitralnych wartości (ESLint).

#### 4. Nawigacja

**File**: `src/components/Topbar.astro`

**Intent**: Dostęp do listy klientów z każdego chronionego ekranu.

**Contract**: Linki „Faktury” (`/`) i „Klienci” (`/clients`); aktywny link oznaczony `aria-current="page"` i wyróżniony tokenami (np. `text-foreground` vs `text-muted-foreground`).

#### 5. Kitchen sink

**File**: `src/pages/dev/ui.astro`, `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Pokazać nowe stany formularza zgodnie z regułą `/dev/ui` w CLAUDE.md.

**Contract**:
- Sekcje: `Switch` (wł./wył.), formularz klienta (domyślny, błąd duplikatu NIP, pending) i lista klientów w stanie pustym.
- Ostatnia zastępuje dzisiejszy wpis „empty: N/A”.

### Success Criteria:

#### Automated Verification:

- Lint (w tym zakaz literałów kolorów) i typy przechodzą: `npm run lint && npx astro check`
- Build przechodzi: `npm run build`
- Testy i smoke nadal przechodzą: `npm test` + `npm run smoke`

#### Manual Verification:

- Dodanie klienta z NIP `PL 123-456-32-18` zapisuje go i pokazuje na liście jako `1234563218`, bez przeładowania strony
- Ponowne dodanie tego NIP pokazuje „Klient z tym NIP-em już istnieje.” pod polem NIP, a dialog zostaje otwarty z wpisanymi danymi
- NIP `1234563219` (zła suma kontrolna) jest odrzucany przed wysłaniem
- Edycja zmienia wiersz na liście; przełącznik rekompensaty zachowuje stan po odświeżeniu strony
- Stan pusty, dialog i Topbar wyglądają poprawnie w jasnym i ciemnym motywie oraz na szerokości telefonu; fokus wraca do przycisku po zamknięciu dialogu
- `/dev/ui` pokazuje nowe stany

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Phase 4: Wdrożenie migracji i produkcji

### Overview

Udokumentowanie procedury migracji i wdrożenie w poprawnej kolejności: najpierw baza, potem kod.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Usunąć nieaktualne „No database tables or migrations are required” i opisać pracę z migracjami.

**Contract**:
- §Supabase Configuration: lokalnie `npx supabase db reset` / `migration up`.
- §Deployment, nowa podsekcja „Migracje”:
  - jednorazowo `npx supabase link --project-ref <ref>`;
  - przed każdym pushem kodu zależnego od migracji `npx supabase db push`;
  - rollback Workera nie cofa schematu.
- §Smoke test: kroki klientów wymagają zastosowanej migracji.

#### 2. Wdrożenie produkcyjne

**File**: — (operacja)

**Intent**: Zastosować migrację na produkcyjnym Supabase, a dopiero potem wypchnąć kod.

**Contract**: `supabase link` → `supabase db push` (potwierdzenie użytkownika przed wykonaniem na produkcji) → push na `main` → Workers Builds wdraża kod.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration list` pokazuje migrację `create_clients` jako zastosowaną lokalnie i zdalnie
- Smoke przechodzi na produkcji: `BASE_URL=https://naleznosci.domblacha.workers.dev npm run smoke`

#### Manual Verification:

- Na produkcji dodanie i edycja klienta działają, a drugie konto nie widzi klientów pierwszego
- W dashboardzie Supabase (produkcja) tabela `clients` ma włączone RLS i 8 polityk

**Implementation Note**: `supabase db push` na produkcję wymaga jawnej zgody użytkownika przed wykonaniem.

---

## Testing Strategy

### Unit Tests:

- `normalizeNip`: spacje, myślniki, prefiks `PL`/`pl`, kombinacje.
- `isValidNip`:
  - poprawny `1234563218`;
  - zła suma `1234563219`;
  - suma mod 11 = 10 → błąd;
  - 9 i 11 cyfr, litery.
- `clientInputSchema`:
  - nazwa przycięta i ze zwiniętymi spacjami;
  - pusta nazwa i nazwa ponad 200 znaków odrzucone;
  - pusty NIP → `null`;
  - `PL 123-456-32-18` → `1234563218`;
  - zły NIP odrzucony z polskim komunikatem;
  - `chargeCompensation` domyślnie `true`.

### Integration Tests:

- `scripts/smoke.mjs`: 401 bez sesji, tworzenie, duplikat NIP w innym zapisie (409), duplikat nazwy bez NIP bez rozróżniania wielkości liter i spacji (409), edycja, izolacja drugiego użytkownika (404 przy `PUT`, brak w `/clients`), ten sam NIP u innego użytkownika dozwolony.

### Manual Testing Steps:

1. Zaloguj się, wejdź w „Klienci” z Topbar i zobacz stan pusty.
2. Dodaj „Acme” z NIP `PL 123-456-32-18` i wyłączoną rekompensatą; na liście NIP to `1234563218`, a Rekompensata „Nie”.
3. Dodaj „acme” bez NIP: przechodzi (nazwa unikalna tylko wśród klientów bez NIP). Dodaj ponownie „ACME ” bez NIP: odrzucone pod polem nazwy.
4. Edytuj pierwszego klienta i wpisz NIP drugiego (lub odwrotnie), żeby sprowokować kolizję przy edycji; komunikat pojawia się pod właściwym polem.
5. Wyloguj się, załóż drugie konto i sprawdź, że lista jest pusta.

## Performance Considerations

Brak istotnych: lista per użytkownik jest mała (jednoosobowa działalność), bez paginacji. Indeksy unikalne zaczynają się od `user_id`, więc służą też zapytaniom RLS.

## Migration Notes

Nowa tabela, brak istniejących danych. Migracja jest jednokierunkowa. Ewentualne wycofanie oznacza nową migrację (`drop table`), a nie rollback Workera. Kod musi trafić na produkcję po migracji (Phase 4).

## References

- Roadmapa: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-002, NFR izolacji danych)
- Wzorzec endpointu: `src/pages/api/auth/signup.ts:7-25`
- Wzorzec komunikatów: `src/lib/auth-errors.ts`
- Pole formularza: `src/components/auth/FormField.tsx`
- Ryzyko rollbacku migracji: `context/foundation/infrastructure.md:71,77,86`
- Lekcja `className` w `.astro`: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa danych i reguły

#### Automated

- [x] 1.1 Migracja aplikuje się lokalnie od zera: `npx supabase db reset` — a4efef2
- [x] 1.2 Testy jednostkowe przechodzą: `npm test` — a4efef2
- [x] 1.3 Lint przechodzi: `npm run lint` — a4efef2
- [x] 1.4 Typy przechodzą: `npx astro check` — a4efef2

#### Manual

- [x] 1.5 W lokalnym Studio tabela `clients` ma włączone RLS i 8 polityk (4 × `authenticated`, 4 × `anon`), bez polityki `FOR ALL` — a4efef2

### Phase 2: API i ochrona tras

#### Automated

- [x] 2.1 Lint i typy przechodzą: `npm run lint && npx astro check` — 304f6bd
- [x] 2.2 Testy jednostkowe nadal przechodzą: `npm test` — 304f6bd
- [x] 2.3 Smoke przechodzi na dev serwerze z lokalnym Supabase: `npm run dev` + `npm run smoke` — 304f6bd

#### Manual

- [x] 2.4 Niezalogowany `GET /clients` w przeglądarce przekierowuje na `/auth/signin` — 304f6bd

### Phase 3: UI listy i dialogu

#### Automated

- [x] 3.1 Lint (w tym zakaz literałów kolorów) i typy przechodzą: `npm run lint && npx astro check`
- [x] 3.2 Build przechodzi: `npm run build`
- [x] 3.3 Testy i smoke nadal przechodzą: `npm test` + `npm run smoke`

#### Manual

- [x] 3.4 Dodanie klienta z NIP `PL 123-456-32-18` zapisuje go i pokazuje na liście jako `1234563218`, bez przeładowania strony
- [x] 3.5 Ponowne dodanie tego NIP pokazuje „Klient z tym NIP-em już istnieje.” pod polem NIP, a dialog zostaje otwarty z wpisanymi danymi
- [x] 3.6 NIP `1234563219` (zła suma kontrolna) jest odrzucany przed wysłaniem
- [x] 3.7 Edycja zmienia wiersz na liście; przełącznik rekompensaty zachowuje stan po odświeżeniu strony
- [x] 3.8 Stan pusty, dialog i Topbar wyglądają poprawnie w jasnym i ciemnym motywie oraz na szerokości telefonu; fokus wraca do przycisku po zamknięciu dialogu
- [x] 3.9 `/dev/ui` pokazuje nowe stany

### Phase 4: Wdrożenie migracji i produkcji

#### Automated

- [ ] 4.1 `npx supabase migration list` pokazuje migrację `create_clients` jako zastosowaną lokalnie i zdalnie
- [ ] 4.2 Smoke przechodzi na produkcji: `BASE_URL=https://naleznosci.domblacha.workers.dev npm run smoke`

#### Manual

- [ ] 4.3 Na produkcji dodanie i edycja klienta działają, a drugie konto nie widzi klientów pierwszego
- [ ] 4.4 W dashboardzie Supabase (produkcja) tabela `clients` ma włączone RLS i 8 polityk
