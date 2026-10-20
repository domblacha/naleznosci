# Usunięcie ekranu confirm-email — Plan Brief

> Full plan: `context/changes/remove-confirm-email-screen/plan.md`

## What & Why

Po rejestracji użytkownik ma trafiać od razu na `/`. Na produkcji potwierdzanie maila jest wyłączone, więc `signUp()` zwraca sesję i użytkownik jest już zalogowany — ekran „Rejestracja udana, możesz się zalogować” to zbędne kliknięcie.

## Starting Point

`src/pages/api/auth/signup.ts` po sukcesie zawsze przekierowuje na `/auth/confirm-email`, choć ciasteczka sesji są już zapisane przez `createClient` (`src/lib/supabase.ts`). Strona ta jest wymieniona w smoke teście, README i CLAUDE.md.

## Desired End State

Rejestracja kończy się na stronie głównej z zalogowanym użytkownikiem. Gdyby kiedyś włączono potwierdzanie maila (brak sesji), użytkownik wraca na `/auth/signin` z istniejącym komunikatem „Potwierdź swój adres e-mail, zanim się zalogujesz.”. Strona `/auth/confirm-email` nie istnieje.

## Key Decisions Made

| Decision                | Choice                                   | Why (1 sentence)                                                                 |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| Redirect po rejestracji | Zależny od `data.session`                | Odporny na późniejsze włączenie „Confirm email” w Supabase.                      |
| Fallback bez sesji      | `/auth/signin?error=email_not_confirmed` | Istniejący komunikat z `auth-errors.ts`, zero nowego UI dla gałęzi dziś martwej. |
| Smoke test              | Location `/` + nowy krok `GET /` → 200   | Sprawdza, że sesja faktycznie się zapisała, a nie tylko nagłówek redirectu.      |
| Liczba faz              | Jedna                                    | Kilka linii zmian w jednej spójnej całości.                                      |

## Scope

**In scope:**

- Warunek redirectu w `signup.ts`
- Usunięcie `src/pages/auth/confirm-email.astro`
- `scripts/smoke.mjs` (2× Location, nowy krok)
- `README.md` (tabela Auth routes), `CLAUDE.md` (lista stron auth)

**Out of scope:**

- Weryfikacja maila, SMTP, trasa `/auth/confirm` (wariant B)
- Mechanizm `?info=` / informacyjny komunikat na signin
- Zmiany w `supabase/config.toml`, middleware, `SignUpForm.tsx`, `auth-errors.ts`

## Architecture / Approach

`signUp()` już zwraca `data.session` i zapisuje ciasteczka; zmienia się wyłącznie docelowy URL redirectu w trasie API. Middleware przepuszcza zalogowanego użytkownika na `/` bez zmian.

## Phases at a Glance

| Phase                                         | What it delivers                                 | Key risk                                                   |
| --------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| 1. Redirect po rejestracji i usunięcie ekranu | Rejestracja → `/`, strona usunięta, smoke i docs | Smoke wymaga działającego lokalnego Supabase i dev serwera |

**Prerequisites:** lokalny Supabase (`npx supabase start`) do smoke testu; świeży branch `feat/remove-confirm-email-screen` z aktualnego `main`.
**Estimated effort:** jedna krótka sesja.

## Open Risks & Assumptions

- Zakładamy, że na produkcji „Confirm email” pozostaje wyłączone; jeśli ktoś je włączy, użytkownik zobaczy czerwony komunikat na signin zamiast informacyjnego.
- Rejestracja na cudzy adres lub z literówką nadal jest możliwa (tak jak dziś).

## Success Criteria (Summary)

- Nowy użytkownik po rejestracji widzi od razu stronę główną jako zalogowany.
- `npm run smoke` przechodzi z nowymi oczekiwaniami.
- W repo nie ma odwołań do `confirm-email`.
