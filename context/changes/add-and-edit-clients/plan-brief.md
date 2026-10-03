# Dodawanie i edycja klientów — Plan Brief

> Full plan: `context/changes/add-and-edit-clients/plan.md`

## What & Why

Wycinek S-02 z roadmapy (FR-002): użytkownik dodaje i edytuje klientów (nazwa, opcjonalny NIP, przełącznik „naliczaj rekompensatę”) i widzi ich listę; duplikat jest odrzucany. Faktury z S-03 przypisuje się do klientów, a to pierwsza tabela domenowa. Tu powstaje wzorzec izolacji danych właściciela (RLS), który powtórzą wszystkie kolejne wycinki.

## Starting Point

Aplikacja ma tylko auth (formularze POST z redirectem `?error=`), pusty ekran główny i komponenty pól w `src/components/auth/`. Nie ma migracji, tabel, `src/types.ts` ani test runnera. Lokalny Supabase nie jest powiązany z produkcją, a push na `main` od razu wdraża kod.

## Desired End State

Zalogowany użytkownik wchodzi z Topbar w „Klienci” (`/clients`) i widzi alfabetyczną listę lub stan pusty. W dialogu dodaje i edytuje klientów bez przeładowania strony. Duplikat NIP lub nazwy dostaje polski komunikat pod właściwym polem. Drugi użytkownik nigdy nie widzi cudzych klientów. Vitest i smoke pilnują reguł i izolacji, a migracja jest na produkcji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Normalizacja NIP | Usuń spacje, myślniki i `PL`; zapisz 10 cyfr; sprawdź sumę kontrolną | `PL 123-456-32-18` i `1234563218` to ten sam klient, a literówka jest łapana od razu | Plan |
| Klucz duplikatu | NIP unikalny wśród klientów z NIP; nazwa (trim, zwinięte spacje, bez wielkości liter) unikalna tylko wśród klientów bez NIP | Dosłowne odczytanie PRD, wymuszalne dwoma częściowymi indeksami unikalnymi | Plan |
| Gdzie wymuszać duplikat | Indeksy unikalne w bazie + mapowanie `23505` na 409 | Brak wyścigu przy równoczesnych zapisach | Plan |
| Kształt UI | Strona `/clients` z wyspą: lista + dialog, zapis przez fetch JSON | Bez przeładowań, dane w formularzu zostają po błędzie | Plan |
| Nawigacja | `/clients` + linki „Faktury” / „Klienci” w Topbar | `/` zostaje wolne pod listę faktur z S-03 | Plan |
| Testy | Vitest (logika NIP i schematu) + smoke z dwoma kontami (izolacja, 409, 401) | RLS jest automatycznie sprawdzane; S-03 dostaje gotowy runner | Plan |
| Migracja na produkcję | Ręcznie `supabase link` + `db push` **przed** pushem kodu | Kod nigdy nie trafia na produkcję przed tabelą; bez sekretów bazy w CI | Plan |
| Usuwanie | Polityka `delete` = `false`; brak `is_active` | Dezaktywacja to S-09; indeksy bez filtra aktywności już obejmą nieaktywnych | Plan |

## Scope

**In scope:**
- tabela `clients` z RLS (8 polityk) i indeksami duplikatów;
- `nip.ts`, schemat zod, mapa błędów i `src/types.ts`;
- serwis oraz `POST /api/clients` i `PUT /api/clients/[id]`;
- `/clients` w `PROTECTED_ROUTES`;
- shadcn `dialog`/`switch`/`table`, strona `/clients`, wyspa z dialogiem, nawigacja w Topbar i stany w `/dev/ui`;
- Vitest i rozszerzony `smoke.mjs`;
- README i wdrożenie migracji na produkcję.

**Out of scope:**
- dezaktywacja, przywracanie i usuwanie klienta (S-09);
- dodatkowe pola klienta;
- wyszukiwanie i paginacja;
- weryfikacja NIP w GUS/VAT;
- migracje w CI;
- duplikat nazwy względem klienta z NIP;
- przenoszenie komponentów pól z `components/auth/`.

## Architecture / Approach

Baza wymusza izolację (RLS `(select auth.uid()) = user_id`, `user_id default auth.uid()`) i unikalność (`(user_id, nip) where nip is not null`, `(user_id, lower(name)) where nip is null`). Aplikacja normalizuje dane do postaci kanonicznej tym samym schematem zod w API i w dialogu. Serwis `src/lib/services/clients.ts` jest jedynym miejscem zapytań: mapuje `23505` na `duplicate_nip`/`duplicate_name`, a niewidoczny wiersz na `not_found`. Strona `/clients` renderuje listę SSR i przekazuje ją do wyspy, a wyspa po zapisie aktualizuje stan odpowiedzią API.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Warstwa danych i reguły | Migracja z RLS i indeksami, typy, logika NIP, schemat, Vitest | Błąd w politykach RLS przecieka do wszystkich kolejnych wycinków |
| 2. API i ochrona tras | Serwis, endpointy JSON, ochrona `/clients`, smoke izolacji | Mapowanie `23505` zależy od nazw indeksów |
| 3. UI listy i dialogu | `/clients`, dialog dodawania i edycji, Topbar, `/dev/ui` | Fokus i dostępność dialogu; zakaz literałów kolorów |
| 4. Wdrożenie | README o migracjach, `db push` na produkcję, push kodu | Kolejność: kod przed migracją psuje `/clients` na produkcji |

**Prerequisites:** S-01 done (jest); Docker z lokalnym Supabase; dostęp do produkcyjnego projektu Supabase (`project-ref`, hasło bazy) dla `supabase link`.
**Estimated effort:** ~2–3 sesje w 4 fazach.

## Open Risks & Assumptions

- Smoke na produkcji zakłada konta testowe `smoke-*@example.com` w produkcyjnym Supabase. Akceptowalne przy MVP, ale konta zostają w bazie.
- Zakładamy, że Supabase podaje nazwę naruszonego indeksu w treści błędu `23505`; jeśli nie, mapowanie trzeba oprzeć na `details`.
- `db push` na produkcję wymaga jawnej zgody użytkownika przed wykonaniem.

## Success Criteria (Summary)

- Użytkownik dodaje i edytuje klientów w dialogu; `PL 123-456-32-18` zapisuje się jako `1234563218`, a duplikat dostaje komunikat pod właściwym polem.
- Drugie konto nie widzi ani nie edytuje klientów pierwszego, co potwierdza automatycznie smoke.
- Migracja jest na produkcji przed kodem, a smoke przechodzi na `naleznosci.domblacha.workers.dev`.
