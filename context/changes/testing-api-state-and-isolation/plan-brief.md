# Przejścia stanu, izolacja i walidacja przez API — Plan Brief

> Full plan: `context/changes/testing-api-state-and-isolation/plan.md`
> Research: `context/changes/testing-api-state-and-isolation/research.md`

## What & Why

Faza 2 planu testów (ryzyka #4, #5, #6). Testy na prawdziwej bazie mają udowodnić, że
niedozwolone przejścia stanu, cudze id i wartości spoza zakresu są odrzucane bez zmiany
w bazie, a ponaglenie i lista pomijają faktury zapłacone i anulowane. Dziś API, RLS,
constrainty i triggery sprawdza tylko ręczny `npm run smoke`, który działa poza CI i nie
czyta wiersza po odrzuceniu.

## Starting Point

W repo jest 12 plików testów unit w `src/lib/`, a `npm test` działa w CI bez bazy.
Serwisy przyjmują `SupabaseClient` jako parametr. Jedynym importem `astro:*` w ścieżce
handlerów jest `src/lib/supabase.ts`, więc handlery da się wywołać w Node.

## Desired End State

`npm run test:integration` na lokalnym Supabase przechodzi przez macierz stan × akcja
faktur i klientów, testy izolacji konta B od konta A, jeden przypadek 400 na endpoint
oraz testy `it.fails` dla luk bazy. Po przebiegu nie zostają konta testowe. `npm test`
dalej obejmuje tylko testy unit. `test-plan.md` §6.3–§6.4 opisuje wzorce dla nowych testów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Warstwa testu | Bezpośrednie wywołanie handlerów z mockiem `@/lib/supabase` | Pokrywa zod, statusy, serwis, RLS, constrainty i triggery bez serwera na 4321 | Research |
| Baza docelowa | Lokalna baza dev, sprzątanie w `afterAll` i `globalSetup` | Nie wymaga nowej infrastruktury, a cascade z `auth.users` usuwa dane testowe | Plan |
| Konta testowe | `auth.admin.createUser` + logowanie hasłem; `service_role` tylko w `src/test/integration/` | Omija limit rejestracji i pozwala usuwać konta; limit logowań `sign_in_sign_ups` podnosimy w `supabase/config.toml` | Plan |
| Pliki i uruchamianie | `src/**/*.int.test.ts`, Vitest `projects` unit/integration, `npm run test:integration` | Job `checks` w CI zostaje zielony bez bazy, a faza 3 tylko dopina skrypt | Plan |
| Kontrakt złego stanu | Asercja na obecny kontrakt: 404 + `not_found` + niezmieniony wiersz | Faza testów nie zmienia zachowania produktu | Plan |
| Luki bez ochrony w bazie | `it.fails` na PostgREST + notatka w §6.5 | Wniosek z researchu zostaje uruchomiony, a test sam zgłosi załatanie luki | Plan |
| Testy izolacji | Zasób A w stanie dozwolonym dla A | 404 ma wynikać z cudzej własności, nie ze stanu zasobu | Plan |

## Scope

**In scope:**
- Infrastruktura: projekty Vitest, `globalSetup`, harness (konta, `callRoute`, `readRow`, fixtures)
- Macierz stan × akcja faktur i klientów, reguły z bazy (duplikat numeru, `client_inactive`, `has_open_invoices`), filtr `listOpenInvoices`
- Izolacja: 10 endpointów z `[id]`, cudzy `clientId`, settings i sender-profile, odczyty serwisów, 401
- Walidacja: po jednym przypadku 400 na endpoint z ciałem; testy `it.fails` dla edycji zamkniętej lub zablokowanej faktury i `paid_on` w przyszłości
- Dokumentacja: `test-plan.md` §4, §6.3–§6.5, README

**Out of scope:**
- Zmiana 404 → 409 i łatanie luk w bazie (osobne zmiany)
- CI, `supabase start` w workflow, post-edit hook (faza 3)
- Middleware, `@supabase/ssr`, auth ze startera (zostaje przy smoke), `db reset`, osobna instancja
- Ponowne testy granic zod (mają testy unit); `paid_on` przed terminem (to legalna wcześniejsza wpłata)

## Architecture / Approach

Test buduje `APIContext` (`Request`, `params`, `locals.user`) i woła eksportowany `PUT`/`POST`/`DELETE`.
Zamockowane `createClient` zwraca klienta supabase-js zalogowanego jako użytkownik
wskazany w `callRoute`. Fixtures stanów wstawia klient właściciela przez PostgREST, pod RLS.
Testowane przejście zawsze idzie przez handler. Wynik ocenia status, kod w ciele odpowiedzi
oraz pełny wiersz odczytany przed wywołaniem i po nim. Wyrocznie pochodzą z kontraktu w
research i z ustawień zapisanych przez sam test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infrastruktura | Projekty Vitest, `globalSetup`, harness, test ścieżki handler → RLS | `vi.mock` w `setupFiles` może nie objąć importów handlerów (fallback: mock w każdym pliku) |
| 2. Przejścia stanu (#4) | Macierze faktur i klientów, reguły z bazy, filtr list | Fixtures muszą spełniać constrainty (migawka przy zapłaconej) |
| 3. Izolacja (#5) | B na zasobach A wszędzie + odczyty + 401 | Zły stan zasobu dałby fałszywie zielone 404 |
| 4. Walidacja (#6) + luki + docs | 400 na endpoint, `it.fails` dla luk, wpisy w test-plan i README | Testy `it.fails` mogą zmylić czytelnika (stąd prefiks `known gap:`) |

**Prerequisites:** działający `npx supabase start` z zastosowanymi migracjami (`migration up`); branch `feat/testing-api-state-and-isolation` z aktualnego `main`.
**Estimated effort:** ~2–3 sesje w 4 fazach.

## Open Risks & Assumptions

- PostgREST może nie umieszczać nazwy constraintu w `message`/`details` dla 23505/23503. Kod na tym polega; jeśli test to pokaże, jest to znalezisko do zgłoszenia, nie powód do poprawiania asercji.
- `supabase status -o env` wypisuje komunikaty CLI, które parser w `globalSetup` musi odfiltrować.
- Testy dzielą bazę z danymi dev. Bezpieczeństwo zapewnia wąski wzorzec e-maili `int-<runId>-<rola>@example.com` przy sprzątaniu.

## Success Criteria (Summary)

- Każde niedozwolone przejście, cudze id i wartość spoza zakresu ma test z asercją na niezmieniony wiersz.
- `npm test` pozostaje bez bazy, a `npm run test:integration` jest zielony dwa razy z rzędu bez śladów w bazie dev.
- Celowe zepsucie filtra, guardu lub schematu czerwieni właściwy test.
