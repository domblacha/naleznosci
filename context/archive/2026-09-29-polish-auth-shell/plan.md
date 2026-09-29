# Polski interfejs konta i pusty ekran główny — plan implementacji

## Overview

Wycinek S-01 (`context/foundation/roadmap.md`, Change ID `polish-auth-shell`): użytkownik rejestruje się, loguje i wylogowuje w polskim interfejsie, a po zalogowaniu trafia na chroniony, pusty ekran główny pod `/`. Boilerplate startera znika. Trasy API auth przestają przekazywać do UI surowe angielskie komunikaty Supabase i dostają walidację zod oraz `prerender = false` zgodnie z `CLAUDE.md`. PRD: FR-001, NFR „Interfejs … w języku polskim”, Access Control.

## Current State Analysis

Auth działa w całości, ale:

- Cały widoczny tekst UI poza bannerem konfiguracji jest po angielsku: Layout, 5 stron/komponentów Astro, 3 wyspy React i 2 trasy API (szczegóły: `research.md` §1).
- Trasy API przekazują surowe `error.message` Supabase w `?error=` (`src/pages/api/auth/signin.ts:16`, `signup.ts:16`), a strony renderują je bez tłumaczenia (`src/pages/auth/signin.astro:5,14`). Przez URL da się też wstawić dowolny tekst do czerwonego komunikatu.
- `/` to publiczny landing startera (`src/pages/index.astro` → `src/components/Welcome.astro`), `/dashboard` to chroniona strona demo. Po logowaniu i wylogowaniu API przekierowuje na `/` (`signin.ts:19`, `signout.ts:9`).
- Middleware chroni trasy przez `startsWith` (`src/middleware.ts:4,18`) i nie przekierowuje zalogowanego użytkownika ze stron logowania i rejestracji.
- Trasy API nie mają `prerender = false` ani walidacji zod. `zod` nie jest bezpośrednią zależnością (w `node_modules` jest tylko tranzytywnie, 4.6.2).
- `scripts/smoke.mjs:38-59` sprawdza obecny kontrakt tras (statusy + `Location`, bez treści).

## Desired End State

- Anonimowy użytkownik wchodzący na `/` dostaje 302 na `/auth/signin`. Zalogowany widzi pusty ekran główny „Należności” z nagłówkiem (e-mail + „Wyloguj”).
- Zalogowany użytkownik wchodzący na `/auth/signin` lub `/auth/signup` dostaje 302 na `/`. `/auth/confirm-email` jest dostępna niezależnie od sesji.
- Logowanie → `/`; rejestracja → `/auth/confirm-email`; wylogowanie → `/auth/signin`.
- Trasy `/api/auth/*` walidują wejście zodem, eksportują `prerender = false` i zwracają błędy jako `?error=<kod>`. Strony zamieniają kod na polski komunikat po stronie serwera. Nieznany kod daje polski komunikat domyślny.
- Wszystkie teksty UI (etykiety, placeholdery, walidacja, `aria-label`, tytuły stron, `lang`) są po polsku.
- `Welcome.astro`, `LibBadge.astro` i `dashboard.astro` nie istnieją. `npm run lint`, `npm run build` i `npm run smoke` przechodzą.

### Key Discoveries:

- `src/middleware.ts:18` — dopasowanie `startsWith`: dodanie `"/"` do `PROTECTED_ROUTES` chroniłoby wszystko, także `/auth/*` i `/api/auth/*`, i zapętliłoby przekierowania. `/` wymaga dopasowania ścisłego.
- Produkcja ma wyłączone potwierdzanie e-maila (`README.md` §Secrets), więc `signUp` od razu ustawia sesję. Dlatego przekierowanie zalogowanego nie może obejmować `/auth/confirm-email` — inaczej strona po rejestracji byłaby nieosiągalna.
- `node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts:6` — typ `ErrorCode`; serwer może zwrócić też kody spoza listy (`:2`), a `error.code` bywa `undefined`.
- `FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx` nie mają własnych tekstów — tłumaczenie odbywa się w miejscach wywołania.
- `Topbar.astro` jest dziś renderowany wyłącznie przez `Welcome.astro:2,18`.

## What We're NOT Doing

- Przeprojektowanie wizualne (motyw `bg-cosmic`, karty `bg-white/10` zostają).
- Biblioteka i18n ani obsługa innych języków — teksty inline plus jedna mapa kodów błędów.
- Zmiana logiki `confirm-email.astro` (podział `import.meta.env.DEV`) — tylko tłumaczenie obu wariantów. Włączenie potwierdzania e-maila w produkcji to osobna, przyszła decyzja.
- Reset hasła (poza MVP wg PRD).
- Treść ekranu głównego poza pustym stanem — lista faktur przychodzi w późniejszych wycinkach.
- Zmiany w archiwalnych dokumentach (`context/archive/**`).

## Implementation Approach

Najpierw zmieniamy trasy i powłokę, bo to jedyna część, która zmienia kontrakt sprawdzany przez smoke test. Potem przestawiamy trasy API na kody błędów z walidacją zod. Na końcu tłumaczymy pozostałe teksty, czego smoke nie widzi. Każda faza kończy się zielonym `npm run smoke`.

## Critical Implementation Details

- **Kolejność w middleware**: najpierw rozwiązanie użytkownika (jak dziś), potem przekierowanie zalogowanego z `/auth/signin` i `/auth/signup` (dopasowanie ścisłe), potem ochrona tras. Przekierowanie zalogowanego nie może obejmować `/auth/confirm-email` ani `/api/auth/*`.
- **Wyspy a zod**: stała minimalnej długości hasła jest współdzielona przez schemat serwerowy i `SignUpForm.tsx`, ale musi leżeć w module bez importu zod, żeby wyspa nie wciągnęła zod do bundla klienta.

## Faza 1: Trasy i ekran główny

### Overview

`/` staje się chronionym, pustym ekranem głównym. Znikają landing i strona demo, zmieniają się przekierowania, smoke test i dokumentacja opisują nowy kontrakt.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Chronić ekran główny `/` bez pułapki `startsWith` i odsyłać zalogowanego użytkownika ze stron logowania i rejestracji na `/`.

**Contract**: Trasa chroniona = `pathname === "/"` albo prefiks z `PROTECTED_ROUTES` (lista zostaje jako miejsce na przyszłe trasy; `/dashboard` z niej znika). Anonim na trasie chronionej → 302 `/auth/signin` (bez zmian). Zalogowany na dokładnie `/auth/signin` lub `/auth/signup` → 302 `/`.

#### 2. Ekran główny

**File**: `src/pages/index.astro`

**Intent**: Zastąpić landing startera pustym ekranem głównym aplikacji z nagłówkiem użytkownika. Nowe teksty od razu po polsku.

**Contract**: `Layout` z tytułem „Należności”, `Topbar` na górze, poniżej pusty stan (nagłówek „Należności” i jedno zdanie, że tu pojawią się faktury). Styl zgodny z istniejącymi stronami (`bg-cosmic`, karta `bg-white/10`).

#### 3. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Dostosować pasek do roli nagłówka chronionego ekranu. Gałąź „niezalogowany” i link do `/dashboard` przestają mieć sens.

**Contract**: Renderuje e-mail użytkownika i formularz POST `/api/auth/signout`. Bez gałęzi anonimowej i bez linku do `/dashboard`. Tłumaczenie etykiet — Faza 3.

#### 4. Usunięcie boilerplate'u

**File**: `src/components/Welcome.astro`, `src/components/ui/LibBadge.astro`, `src/pages/dashboard.astro`

**Intent**: Usunąć marketing startera, nieużywany komponent i stronę demo, której rolę przejmuje `/`.

**Contract**: Pliki usunięte; `grep -rn "Welcome\|LibBadge\|dashboard" src/` nie zwraca trafień.

#### 5. Przekierowanie po wylogowaniu

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Wylogowanie kieruje prosto na logowanie, bez podwójnego przekierowania przez chronione `/`.

**Contract**: Sukces i brak konfiguracji → 302 `/auth/signin`.

#### 6. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Zakodować nowy kontrakt tras.

**Contract**: Kroki w kolejności:
1. anonim `GET /` → 302 `/auth/signin`;
2. anonim `GET /auth/signin` → 200;
3. `POST /api/auth/signup` → 302 `/auth/confirm-email`;
4. złe hasło → 302 `/auth/signin?error=`;
5. poprawne hasło → 302 `/`;
6. zalogowany `GET /` → 200;
7. zalogowany `GET /auth/signin` → 302 `/`;
8. `POST /api/auth/signout` → 302 `/auth/signin`;
9. `GET /` po wylogowaniu → 302 `/auth/signin`.

#### 7. Dokumentacja

**File**: `README.md`, `CLAUDE.md`

**Intent**: Usunąć odwołania do `/dashboard` i opisać nowy ekran główny oraz regułę ochrony.

**Contract**: README §„Auth routes” — wiersz `/` (chroniony ekran główny) zamiast `/dashboard`, zdanie o `PROTECTED_ROUTES` uwzględnia ścisłą ochronę `/`. `CLAUDE.md:25` — „Protected page example” wskazuje `src/pages/index.astro`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Brak odwołań do usuniętych plików i `/dashboard` w `src/`: `grep -rn "Welcome\|LibBadge\|dashboard" src/` zwraca pusty wynik
- Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke`

#### Manual Verification:

- Po zalogowaniu w przeglądarce widać pusty ekran główny z e-mailem i przyciskiem wylogowania, bez treści startera
- Wejście na `/auth/signup` jako zalogowany przenosi na `/`, a `/auth/confirm-email` nadal się otwiera

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed przejściem dalej.

---

## Faza 2: Kody błędów i konwencje API

### Overview

Trasy API zwracają kody błędów zamiast surowych komunikatów, walidują wejście zodem i eksportują `prerender = false`. Strony zamieniają kod na polski tekst.

### Changes Required:

#### 1. Zależność zod

**File**: `package.json`

**Intent**: Dodać `zod` jako bezpośrednią zależność (reguła walidacji z `CLAUDE.md`).

**Contract**: `npm install zod` (wersja 4.x, zgodna z tą już obecną tranzytywnie).

#### 2. Mapa kodów błędów

**File**: `src/lib/auth-errors.ts` (nowy)

**Intent**: Jedno miejsce tłumaczące kod błędu auth na polski komunikat, odporne na nieznane kody i wartości podstawione w URL.

**Contract**: `authErrorMessage(code: string | null): string | null` — `null` dla braku kodu, polski tekst dla znanego kodu, komunikat domyślny dla każdego innego. Obsługiwane kody co najmniej:
- `invalid_credentials` — „Nieprawidłowy e-mail lub hasło.”
- `user_already_exists` i `email_exists` — konto z tym adresem już istnieje;
- `weak_password` — hasło zbyt słabe;
- `email_address_invalid`, `validation_failed` i własny `invalid_input` — podaj poprawny e-mail i hasło;
- `over_request_rate_limit` i `over_email_send_rate_limit` — zbyt wiele prób, spróbuj za chwilę;
- `signup_disabled` — rejestracja wyłączona;
- `email_not_confirmed` — potwierdź adres e-mail;
- własny `config_missing` — logowanie niedostępne, brak konfiguracji;
- domyślny: „Coś poszło nie tak. Spróbuj ponownie.”

#### 3. Schematy walidacji

**File**: `src/lib/auth-schemas.ts` (nowy) oraz moduł stałych bez zod (np. `src/lib/auth-config.ts`)

**Intent**: Walidacja wejścia tras API wg konwencji projektu, z jedną definicją minimalnej długości hasła dla serwera i formularza.

**Contract**:
- Schemat logowania: `email` (poprawny e-mail) i `password` (niepusty).
- Schemat rejestracji: `email` i `password` o długości co najmniej `MIN_PASSWORD_LENGTH` (6).
- `MIN_PASSWORD_LENGTH` eksportowany z modułu bez importu zod.

#### 4. Trasy API

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signout.ts`

**Intent**: Zgodność z konwencją API i przekazywanie kodów zamiast tekstu.

**Contract**:
- Każda trasa eksportuje `export const prerender = false`.
- signin i signup parsują `formData` schematem (`safeParse`). Błąd walidacji → 302 na własną stronę z `?error=invalid_input`.
- Brak klienta Supabase → `?error=config_missing`.
- Błąd Supabase → `?error=<error.code ?? "unknown">`.
- Przekierowania sukcesu bez zmian: signin → `/`, signup → `/auth/confirm-email`, signout → `/auth/signin`.

#### 5. Strony formularzy

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Zamienić kod z URL na polski komunikat po stronie serwera, zanim trafi do wyspy.

**Contract**: `serverError={authErrorMessage(Astro.url.searchParams.get("error"))}`. Prop wysp (`serverError?: string | null`) bez zmian.

#### 6. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić, że błąd przychodzi jako kod, a walidacja serwerowa działa.

**Contract**:
- Krok „złe hasło” oczekuje prefiksu `/auth/signin?error=invalid_credentials`.
- Nowy krok przed rejestracją: `POST /api/auth/signup` z pustym hasłem → 302 `/auth/signup?error=invalid_input`.

### Success Criteria:

#### Automated Verification:

- `zod` jest w `dependencies`: `grep '"zod"' package.json`
- Każda trasa API eksportuje `prerender`: `grep -L "export const prerender = false" src/pages/api/auth/*.ts` zwraca pusty wynik
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke`

#### Manual Verification:

- Logowanie złym hasłem pokazuje „Nieprawidłowy e-mail lub hasło.”
- Rejestracja istniejącym adresem pokazuje polski komunikat o istniejącym koncie
- Ręcznie wpisane `/auth/signin?error=cokolwiek` pokazuje polski komunikat domyślny, nie tekst z URL

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed przejściem dalej.

---

## Faza 3: Polskie teksty UI

### Overview

Tłumaczenie wszystkich pozostałych tekstów widocznych dla użytkownika i czytników ekranu.

### Changes Required:

#### 1. Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Poprawny język dokumentu i nazwa produktu zamiast nazwy startera.

**Contract**: `<html lang="pl">`; domyślny `title` = „Należności”.

#### 2. Strony auth

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Polskie tytuły, nagłówki i linki przełączające. Confirm-email zachowuje oba warianty i ich logikę.

**Contract**:
- signin: „Zaloguj się”, „Nie masz konta? Zarejestruj się”.
- signup: „Załóż konto”, „Masz już konto? Zaloguj się”.
- confirm-email, wariant DEV: „Rejestracja udana” / konto utworzone / „Przejdź do logowania”.
- confirm-email, wariant produkcyjny: „Sprawdź skrzynkę” / wysłaliśmy link potwierdzający / „Wróć do logowania”.

#### 3. Formularze i przełącznik hasła

**File**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/PasswordToggle.tsx`

**Intent**: Polskie etykiety, placeholdery, komunikaty walidacji, tekst przycisków i stanów „w toku” oraz `aria-label`. Podpowiedź o brakujących znakach z poprawną polską odmianą.

**Contract**:
- `SignUpForm` używa `MIN_PASSWORD_LENGTH` z modułu z Fazy 2 zamiast lokalnej stałej.
- Podpowiedź w mianowniku odmienia liczbę brakujących znaków (zakres 1–5): „Jeszcze 1 znak”, „Jeszcze 3 znaki”, „Jeszcze 5 znaków”. Konstrukcje z dopełniaczem („Brakuje …”) nie ilustrują odmiany, więc ich nie używamy.
- `PasswordToggle`: „Ukryj hasło” / „Pokaż hasło”.

#### 4. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Polska etykieta przycisku wylogowania.

**Contract**: „Wyloguj”.

### Success Criteria:

#### Automated Verification:

- Brak angielskich tekstów UI w plikach auth i powłoki: `grep -rnE "Sign in|Sign up|Sign out|Signing in|Creating account|Create account|Email is|Enter a valid|Your password|Show password|Hide password|Check your|Registration successful|lang=\"en\"|10x Astro" src/` zwraca pusty wynik
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke`

#### Manual Verification:

- Przejście rejestracja → confirm-email → logowanie → ekran główny → wylogowanie jest w całości po polsku (także walidacja klienta i stany „w toku”)
- Podpowiedź przy haśle poprawnie odmienia 1, 2 i 5 brakujących znaków
- Czytnik ekranu lub inspektor pokazuje polski `aria-label` przełącznika hasła i `lang="pl"`

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak test runnera w projekcie; dodawanie go nie należy do S-01. Mapę błędów i odmianę weryfikujemy ręcznie oraz smoke testem.

### Integration Tests:

- `npm run smoke` przeciwko `npm run dev` z lokalnym Supabase (potwierdzanie e-maila wyłączone) po każdej fazie. Opcjonalnie po Fazie 3 także przeciwko `npm run build && npm run preview`.

### Manual Testing Steps:

1. Jako anonim wejdź na `/` — trafiasz na polską stronę logowania.
2. Zarejestruj się — widzisz polską stronę confirm-email; wejdź na `/auth/signin` — przenosi na `/`.
3. Wyloguj się, zaloguj złym hasłem — polski komunikat; zaloguj poprawnie — pusty ekran główny.
4. Wpisz `/auth/signin?error=<script>` — widać tylko polski komunikat domyślny.

## Performance Considerations

Brak istotnych. Zod działa tylko po stronie serwera; wyspy nie importują zod.

## Migration Notes

Brak migracji danych. Po wdrożeniu (push na `main` = produkcja) zakładki do `/dashboard` przestaną działać (404) — aplikacja nie ma jeszcze użytkowników, akceptowalne.

## References

- Research: `context/changes/polish-auth-shell/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001, NFR, Access Control)
- Kody błędów Supabase: `node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts:6`
- Kontrakt tras: `scripts/smoke.mjs:38-59`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Trasy i ekran główny

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — c08ba45
- [x] 1.2 Build przechodzi: `npm run build` — c08ba45
- [x] 1.3 Brak odwołań do usuniętych plików i `/dashboard` w `src/` — c08ba45
- [x] 1.4 Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke` — c08ba45

#### Manual

- [x] 1.5 Po zalogowaniu widać pusty ekran główny z e-mailem i wylogowaniem, bez treści startera — c08ba45
- [x] 1.6 Zalogowany na `/auth/signup` trafia na `/`, a `/auth/confirm-email` nadal się otwiera — c08ba45

### Phase 2: Kody błędów i konwencje API

#### Automated

- [x] 2.1 `zod` jest w `dependencies` — 1909c0a
- [x] 2.2 Każda trasa API eksportuje `prerender = false` — 1909c0a
- [x] 2.3 Lint przechodzi: `npm run lint` — 1909c0a
- [x] 2.4 Build przechodzi: `npm run build` — 1909c0a
- [x] 2.5 Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke` — 1909c0a

#### Manual

- [x] 2.6 Logowanie złym hasłem pokazuje „Nieprawidłowy e-mail lub hasło.” — 1909c0a
- [x] 2.7 Rejestracja istniejącym adresem pokazuje polski komunikat o istniejącym koncie — 1909c0a
- [x] 2.8 `/auth/signin?error=cokolwiek` pokazuje polski komunikat domyślny — 1909c0a

### Phase 3: Polskie teksty UI

#### Automated

- [x] 3.1 Brak angielskich tekstów UI w `src/` (grep) — 335ff58
- [x] 3.2 Lint przechodzi: `npm run lint` — 335ff58
- [x] 3.3 Build przechodzi: `npm run build` — 335ff58
- [x] 3.4 Smoke test przechodzi przeciwko `npm run dev`: `npm run smoke` — 335ff58

#### Manual

- [x] 3.5 Pełny przepływ konta jest po polsku, także walidacja i stany „w toku” — 335ff58
- [x] 3.6 Podpowiedź przy haśle poprawnie odmienia 1, 2 i 5 brakujących znaków — 335ff58
- [x] 3.7 Polski `aria-label` przełącznika hasła i `lang="pl"` — 335ff58
