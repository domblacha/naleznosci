# Usunięcie ekranu confirm-email — Implementation Plan

## Overview

Po rejestracji użytkownik trafia od razu na `/` zamiast na ekran `/auth/confirm-email`. Na produkcji potwierdzanie maila jest wyłączone, więc `signUp()` zwraca sesję i użytkownik jest już zalogowany — dodatkowy ekran „możesz się teraz zalogować” jest zbędnym krokiem. Strona `confirm-email.astro` znika.

## Current State Analysis

- `src/pages/api/auth/signup.ts:18-24` — wynik `signUp()` jest odczytywany tylko jako `{ error }`; przy sukcesie zawsze `redirect("/auth/confirm-email")`.
- `src/lib/supabase.ts` — `setAll` zapisuje ciasteczka sesji przez `context.cookies`, więc po udanym `signUp()` z sesją użytkownik jest zalogowany już dziś (redirect po prostu tego nie wykorzystuje).
- `src/pages/auth/confirm-email.astro` — dwa warianty treści zależne od `import.meta.env.DEV`; jedyny odnośnik do strony to redirect w `signup.ts`.
- `src/lib/auth-errors.ts:15` — istnieje kod `email_not_confirmed` z komunikatem „Potwierdź swój adres e-mail, zanim się zalogujesz.”, wyświetlany przez `/auth/signin?error=…`.
- `scripts/smoke.mjs:95` (user B w `clientSteps`) i `:674` (główny przepływ) oczekują `location: "/auth/confirm-email"`. Domyślny `jar` (`scripts/smoke.mjs:8,26`) jest współdzielony między krokami, więc ciasteczka z signupu trafiają do kolejnych żądań.
- Żaden test Vitest (unit ani integration) nie dotyka trasy signup ani strony confirm-email.
- `README.md:161` (tabela Auth routes) i `CLAUDE.md:32` (lista stron auth) wymieniają `confirm-email`.

## Desired End State

- Rejestracja z sesją → 302 na `/`, strona główna renderuje się bez osobnego logowania.
- Rejestracja bez sesji (gdyby w Supabase włączono „Confirm email”) → 302 na `/auth/signin?error=email_not_confirmed`.
- `/auth/confirm-email` nie istnieje (404).
- Smoke test, README i CLAUDE.md odzwierciedlają nowy przepływ.

### Key Discoveries:

- Ciasteczka sesji ustawia już `createClient` (`src/lib/supabase.ts:13-17`) — żadna zmiana w warstwie Supabase nie jest potrzebna.
- Gotowy komunikat fallbacku: `email_not_confirmed` w `src/lib/auth-errors.ts:15`.
- Smoke: `request()` bez `jar` używa współdzielonego `jar` (`scripts/smoke.mjs:26`), więc krok `GET /` tuż po signupie sprawdza faktyczną sesję.

## What We're NOT Doing

- Nie włączamy weryfikacji maila, nie konfigurujemy SMTP ani trasy `/auth/confirm` (wariant B, osobna zmiana).
- Nie dodajemy mechanizmu `?info=` ani informacyjnego wariantu komunikatu na `/auth/signin` — fallback używa istniejącego `?error=email_not_confirmed`.
- Nie zmieniamy `supabase/config.toml` (lokalnie `enable_confirmations = false` zostaje).
- Nie zmieniamy `SignUpForm.tsx`, middleware ani `auth-errors.ts`.

## Implementation Approach

Jedna faza: zmiana warunku redirectu w `signup.ts` na podstawie `data.session`, usunięcie strony, aktualizacja smoke testu i dokumentacji. Zmiana jest mała i spójna — jeden commit.

## Phase 1: Redirect po rejestracji i usunięcie ekranu

### Overview

Rejestracja kończy się na `/` (lub na signin z komunikatem, gdy brak sesji); ekran confirm-email zostaje usunięty wraz z odwołaniami.

### Changes Required:

#### 1. Trasa rejestracji

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Wykorzystać sesję zwróconą przez `signUp()` — użytkownik z sesją jest zalogowany, więc trafia prosto na stronę główną; bez sesji wraca na logowanie z istniejącym komunikatem o potwierdzeniu maila.

**Contract**: `POST /api/auth/signup` przy sukcesie: `data.session` niepuste → 302 `/`; `data.session` puste → 302 `/auth/signin?error=email_not_confirmed`. Ścieżki błędów (`invalid_input`, `config_missing`, `error.code`) bez zmian.

#### 2. Usunięcie strony

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Strona nie jest już nigdzie używana.

**Contract**: Plik usunięty; `/auth/confirm-email` zwraca 404.

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Dostosować oczekiwania do nowego redirectu i sprawdzić, że po rejestracji użytkownik jest faktycznie zalogowany.

**Contract**: Kroki „user B: signup” (`:95`) i „signup creates account” (`:674`) oczekują `{ status: 302, location: "/" }`. Bezpośrednio po „signup creates account” nowy krok `["home renders right after signup", () => request("/"), { status: 200 }]` (domyślny `jar`).

#### 4. Dokumentacja

**File**: `README.md`, `CLAUDE.md`

**Intent**: Usunąć wzmianki o nieistniejącej stronie.

**Contract**: `README.md` — usunąć wiersz `/auth/confirm-email` z tabeli Auth routes i dopisać przy `/auth/signup`, że po rejestracji użytkownik jest od razu zalogowany i trafia na `/`. `CLAUDE.md:32` — `src/pages/auth/{signin,signup}.astro`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Brak odwołań do strony w kodzie: `grep -rn "confirm-email" src scripts README.md CLAUDE.md` nic nie zwraca
- Smoke test przechodzi na dev serwerze z lokalnym Supabase: `npm run smoke`

#### Manual Verification:

- Rejestracja nowego konta w przeglądarce kończy się na `/` z widokiem zalogowanego użytkownika, bez ekranu „Rejestracja udana”
- Wejście na `/auth/confirm-email` zwraca 404

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej przez człowieka.

---

## Testing Strategy

### Unit Tests:

- Brak — trasa signup nie ma testów jednostkowych, a logika to jeden warunek redirectu.

### Integration Tests:

- `npm run smoke` pokrywa przepływ: signup → 302 `/` → `GET /` 200 (sesja zapisana) oraz scenariusz user B.

### Manual Testing Steps:

1. `npm run dev`, wejdź na `/auth/signup`, zarejestruj nowy adres.
2. Sprawdź, że lądujesz na `/` jako zalogowany użytkownik.
3. Wejdź na `/auth/confirm-email` — oczekiwane 404.
4. Ubij dev server po zakończeniu (lessons: „Dev server aplikacji”).

## References

- Change notes: `context/changes/remove-confirm-email-screen/change.md`
- Komunikat fallbacku: `src/lib/auth-errors.ts:15`
- Klient Supabase z ciasteczkami: `src/lib/supabase.ts:5-21`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Redirect po rejestracji i usunięcie ekranu

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 4b100f1
- [x] 1.2 Typy przechodzą: `npx astro check` — 4b100f1
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — 4b100f1
- [x] 1.4 Build przechodzi: `npm run build` — 4b100f1
- [x] 1.5 Brak odwołań do strony w kodzie: `grep -rn "confirm-email" src scripts README.md CLAUDE.md` nic nie zwraca — 4b100f1
- [x] 1.6 Smoke test przechodzi na dev serwerze z lokalnym Supabase: `npm run smoke` — 4b100f1

#### Manual

- [x] 1.7 Rejestracja nowego konta w przeglądarce kończy się na `/` z widokiem zalogowanego użytkownika, bez ekranu „Rejestracja udana” — 4b100f1
- [x] 1.8 Wejście na `/auth/confirm-email` zwraca 404 — 4b100f1
