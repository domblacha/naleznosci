# Polski interfejs konta i pusty ekran główny — Plan Brief

> Full plan: `context/changes/polish-auth-shell/plan.md`
> Research: `context/changes/polish-auth-shell/research.md`

## What & Why

Wycinek S-01 roadmapy: użytkownik rejestruje się, loguje i wylogowuje w polskim interfejsie, a po zalogowaniu trafia na chroniony, pusty ekran główny bez boilerplate'u startera. To polska powłoka i chroniony ekran, na których opierają się kolejne widoki (klienci, faktury). PRD: FR-001, NFR „interfejs po polsku”, Access Control.

## Starting Point

Auth działa, ale cały UI jest po angielsku, a surowe komunikaty Supabase trafiają do UI przez `?error=`. `/` to publiczny landing startera, `/dashboard` to strona demo. Trasy API nie mają zod ani `prerender = false`. Kontrakt tras sprawdza `scripts/smoke.mjs`.

## Desired End State

Anonim na `/` trafia na polską stronę logowania. Zalogowany widzi pusty ekran „Należności” z e-mailem i przyciskiem „Wyloguj”, a ze stron logowania i rejestracji jest odsyłany na `/`. Błędy auth wyświetlają się jako polskie komunikaty z mapy kodów. Nieznany kod lub tekst podstawiony w URL daje komunikat domyślny. Landing, `LibBadge` i `/dashboard` nie istnieją, a smoke test opisuje nowy kontrakt.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trasa ekranu głównego | `/` chronione ścisłym dopasowaniem; `/dashboard` usunięte | Jedna trasa, brak landingu; `startsWith("/")` zapętliłby przekierowania | Plan |
| Po rejestracji | Zostaje `/auth/confirm-email`, przetłumaczona, z obecnym podziałem DEV/produkcja | Właściciel planuje włączyć potwierdzanie e-maila w produkcji | Plan |
| Konwencje API | `prerender = false` + walidacja zod (`npm install zod`) | Te same pliki i tak się zmieniają; S-02 dostaje gotowy wzorzec | Plan |
| Zalogowany na `/auth/*` | Przekierowanie na `/` tylko z `/auth/signin` i `/auth/signup` | Bez mylącego formularza; confirm-email musi pozostać dostępna, bo rejestracja od razu tworzy sesję | Plan |
| Komunikaty błędów | `?error=<kod>` + mapa w `src/lib/auth-errors.ts`, tłumaczenie po stronie serwera | Polskie teksty, brak wstrzykiwania dowolnej treści przez URL | Research |
| Warstwa i18n | Brak — teksty inline | PRD przewiduje tylko polski | Research |
| Wylogowanie | 302 na `/auth/signin` | Unika podwójnego przekierowania przez chronione `/` | Plan |

## Scope

**In scope:**
- middleware (ochrona `/`, przekierowanie zalogowanego)
- pusty ekran główny z Topbarem
- usunięcie `Welcome`, `LibBadge` i `dashboard`
- kody błędów, zod i `prerender` w `/api/auth/*`
- tłumaczenie Layoutu, stron auth, formularzy, `PasswordToggle` i Topbara
- smoke test, README, CLAUDE.md

**Out of scope:**
- redesign wizualny
- biblioteka i18n
- zmiana logiki confirm-email i włączenie potwierdzania e-maila
- reset hasła
- treść ekranu głównego poza pustym stanem
- test runner

## Architecture / Approach

Formularze zostają wyspami React z natywnym POST do `/api/auth/*`. Trasy walidują wejście zodem i przy błędzie przekierowują z `?error=<kod>`. Strona Astro zamienia kod na tekst przez `authErrorMessage()` i przekazuje go wyspie jak dotąd. Middleware najpierw rozwiązuje użytkownika, potem odsyła zalogowanego ze stron logowania i rejestracji, a na końcu chroni `/` (dopasowanie ścisłe) i prefiksy z `PROTECTED_ROUTES`. Stała minimalnej długości hasła leży w module bez zod, żeby wyspa nie wciągała zod do bundla klienta.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Trasy i ekran główny | Chronione `/`, usunięty boilerplate, nowy smoke test i dokumentacja | Pętla przekierowań przy złym dopasowaniu `/` |
| 2. Kody błędów i konwencje API | zod, `prerender`, `?error=<kod>`, polska mapa błędów | Supabase zwraca kod spoza mapy lub `undefined` — pokrywa to komunikat domyślny |
| 3. Polskie teksty UI | Pełny polski UI, `lang="pl"`, poprawna odmiana „znak/znaki/znaków” | Pominięty tekst (grep i ręczne przejście przepływu) |

**Prerequisites:** lokalny Supabase z wyłączonym potwierdzaniem e-maila (do smoke testu), czyste drzewo robocze.
**Estimated effort:** ~1–2 sesje, 3 małe fazy.

## Open Risks & Assumptions

- Dopóki potwierdzanie e-maila w produkcji jest wyłączone, użytkownik produkcyjny po rejestracji zobaczy „Sprawdź skrzynkę”, choć ma już sesję. To świadomie przyjęty stan przejściowy.
- Komunikat „Supabase is not configured”, opisany w archiwum `production-deploy` jako objaw brakujących sekretów, zmieni się na polski tekst dla kodu `config_missing`.
- Push na `main` od razu wdraża na produkcję. Zakładki do `/dashboard` przestaną działać, co jest akceptowalne, bo aplikacja nie ma jeszcze użytkowników.

## Success Criteria (Summary)

- Cały przepływ konta (rejestracja → logowanie → ekran główny → wylogowanie) jest po polsku, także błędy z Supabase.
- Po zalogowaniu użytkownik trafia na pusty, chroniony ekran główny bez śladów startera.
- `npm run lint`, `npm run build` i `npm run smoke` przechodzą.
