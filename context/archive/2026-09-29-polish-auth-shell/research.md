---
date: 2026-09-29T19:24:47+02:00
researcher: Claude (Opus 5.5) for Dominik Blacha
git_commit: f798752
branch: main
repository: 10x-kurs (naleznosci)
topic: "S-01 polish-auth-shell — co trzeba zmienić, by auth działał po polsku i prowadził na pusty, chroniony ekran główny bez boilerplate'u startera"
tags: [research, auth, i18n, layout, middleware, smoke-test]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
---

# Research: S-01 polish-auth-shell

**Date**: 2026-09-29T19:24:47+02:00
**Researcher**: Claude (Opus 5.5) for Dominik Blacha
**Git Commit**: f798752 (working tree: niezacommitowana zmiana w `src/styles/global.css`, patrz niżej)
**Branch**: main
**Repository**: 10x-kurs (Worker `naleznosci`)

## Research Question

Wycinek S-01 z `context/foundation/roadmap.md:87-97`: „Użytkownik może zarejestrować się, zalogować i wylogować w polskim interfejsie, a po zalogowaniu trafia na chroniony, pusty ekran główny aplikacji (bez boilerplate'u startera)”. PRD: FR-001 (`prd.md:81`), NFR „Interfejs … w języku polskim” (`prd.md:133`), Access Control (`prd.md:147`).

Pytania:
1. Gdzie są wszystkie teksty UI po angielsku (w tym komunikaty błędów)?
2. Który plik/trasa jest boilerplate'em do usunięcia, a co jest „ekranem głównym”?
3. Jak dziś działają przekierowania auth i co od nich zależy (smoke test)?
4. Jakie konwencje z `CLAUDE.md` obecny kod auth narusza, a zmiana w nie trafi?

## Summary

- Auth działa w całości (rejestracja, logowanie, wylogowanie, ochrona `/dashboard`), ale **cały widoczny tekst UI poza bannerem konfiguracji jest po angielsku** — w 8 plikach stron/komponentów auth i powłoki (`signin.astro`, `signup.astro`, `confirm-email.astro`, `dashboard.astro`, `Topbar.astro`, `SignInForm.tsx`, `SignUpForm.tsx`, `PasswordToggle.tsx`), w 2 trasach API (`signin.ts`, `signup.ts`) i w `Welcome.astro` (do usunięcia), plus `lang="en"` i tytuł startera w `src/layouts/Layout.astro:10,14`.
- **Komunikaty błędów Supabase trafiają do UI dosłownie po angielsku**: API przekazuje `error.message` w query `?error=` (`src/pages/api/auth/signin.ts:16`, `signup.ts:16`), a strony renderują go bez tłumaczenia (`src/pages/auth/signin.astro:5,14`). Tłumaczenie wymaga mapowania po `error.code` (typ `ErrorCode` w `@supabase/auth-js`, m.in. `invalid_credentials`, `user_already_exists`, `weak_password`, `email_address_invalid`, `over_request_rate_limit`, `signup_disabled`).
- **Boilerplate startera**: `src/components/Welcome.astro` (hero „10x Astro Starter” + 3 karty reklamujące stack), używany wyłącznie przez `src/pages/index.astro:2,7`; `src/components/ui/LibBadge.astro` nie jest importowany w żadnym pliku `src/` (grep); domyślny tytuł „10x Astro Starter” w `Layout.astro:10`.
- **Nie ma dziś „ekranu głównego” aplikacji.** `/` to publiczny landing startera, `/dashboard` to chroniona strona demo. Po zalogowaniu i wylogowaniu API przekierowuje na `/` (`signin.ts:19`, `signout.ts:9`) — czyli na landing, nie na chroniony ekran. Wybór trasy ekranu głównego to decyzja dla planu (patrz „Open Questions”).
- **Smoke test koduje obecne trasy**: `/` → 200 dla anonima, `/dashboard` → 302 `/auth/signin`, logowanie → 302 `/`, wylogowanie → 302 `/` (`scripts/smoke.mjs:39-58`). Każda zmiana tras wymaga równoległej zmiany smoke testu.
- **Rozjazd z produkcją**: strona `/auth/confirm-email` pokazuje „Check your email” poza trybem DEV (`src/pages/auth/confirm-email.astro:4,13-18`), a w produkcji potwierdzanie e-maila jest wyłączone (`README.md` §Secrets; `context/archive/2026-09-23-production-deploy/deployment-log.md:19`). Użytkownik produkcyjny dostaje fałszywą instrukcję.
- **Uwaga — stan working tree**: niezacommitowana zmiana usuwa `@import "tailwindcss";` i `@import "tw-animate-css";` z `src/styles/global.css:1-2` (`git diff`). Bez nich klasy Tailwind nie zostaną wygenerowane. Nie jest to część tej zmiany; trzeba ją świadomie cofnąć albo wyjaśnić przed implementacją.

## Detailed Findings

### 1. Teksty UI po angielsku

Strony Astro:
- `src/layouts/Layout.astro:10` — domyślny `title = "10x Astro Starter"`; `:14` — `<html lang="en">`. Banner konfiguracji (`:22-35`) i `src/lib/config-status.ts:15-17` są **już po polsku**.
- `src/pages/auth/signin.astro:8,12,16,18` — „Sign in”, „Don't have an account?”, „Sign up”.
- `src/pages/auth/signup.astro:8,12,16,18` — „Sign up”, „Already have an account?”, „Sign in”.
- `src/pages/auth/confirm-email.astro:9-11,15-17` — oba warianty treści.
- `src/pages/dashboard.astro:7,11,14,16,22` — „Dashboard”, „Welcome,”, „This page is only for authenticated users.”, „Sign out”.
- `src/components/Topbar.astro:11,15,22,25,28` — „Dashboard”, „Sign out”, „Not signed in”, „Sign in”, „Sign up”. Topbar jest dziś renderowany wyłącznie wewnątrz `Welcome.astro:2,18`.

Wyspy React (wszystkie `client:load`, `signin.astro:14`, `signup.astro:14`):
- `src/components/auth/SignInForm.tsx:21,23,26` (walidacja), `:47,53,60,67` (etykiety/placeholdery), `:82-83` (przycisk + stan pending).
- `src/components/auth/SignUpForm.tsx:26,28,32,34,38,40` (walidacja), `:60-61` (podpowiedź z angielską odmianą „character/characters” — po polsku potrzebne 3 formy: znak/znaki/znaków), `:70,76,83,90,107,114` (etykiety/placeholdery), `:129-130` (przycisk).
- `src/components/auth/PasswordToggle.tsx:14` — `aria-label` „Hide password”/„Show password”.
- `FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx` nie zawierają własnych tekstów (renderują propsy).

Komunikaty z serwera:
- `src/pages/api/auth/signin.ts:11` i `signup.ts:11` — „Supabase is not configured” (stały tekst EN).
- `signin.ts:16`, `signup.ts:16` — surowe `error.message` z Supabase (EN). Obecny mechanizm pozwala też wstrzyknąć dowolny tekst przez `?error=` w URL (React escapuje go, więc to nie XSS, ale dowolna treść w czerwonym komunikacie). Przejście na kody błędów (`?error=invalid_credentials` → polski tekst z mapy) rozwiązuje oba problemy naraz.
- Znane kody w zainstalowanej wersji: `node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts:6` (typ `ErrorCode`; komentarz w `:2` zaznacza, że serwer może zwrócić też inne kody → potrzebny komunikat domyślny).

### 2. Boilerplate i ekran główny

- `src/pages/index.astro:1-8` renderuje tylko `<Welcome />` w `Layout`.
- `src/components/Welcome.astro:1-114` — marketing startera (hero, CTA, 3 karty). Jedyny konsument: `index.astro`.
- `src/components/ui/LibBadge.astro` — brak importów w `src/` (sprawdzone grepem po `LibBadge`; nieużywany).
- `src/components/Banner.astro` — **nie** jest boilerplate'em: używa go `Layout.astro:3,23` do bannera brakującej konfiguracji.
- `src/components/Topbar.astro` — nadaje się jako zalążek nagłówka aplikacji (e-mail użytkownika + wylogowanie), ale wymaga tłumaczenia i przeniesienia z `Welcome` do layoutu/ekranu głównego.
- `src/pages/dashboard.astro` — chroniona strona demo; zawiera już e-mail i przycisk wylogowania.
- Styl: wszystkie strony używają ciemnego motywu `bg-cosmic` (`src/styles/global.css:110-112`) i przezroczystych kart `bg-white/10`. Przeprojektowanie wizualne nie należy do zakresu S-01 (roadmapa: „tłumaczenie i sprzątanie”, `roadmap.md:96`).

### 3. Przekierowania i ochrona tras

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; `:18` — dopasowanie przez `startsWith`. **Pułapka**: dodanie `"/"` do tej listy chroniłoby każdą ścieżkę (także `/auth/*` i `/api/auth/*`) i spowodowałoby pętlę przekierowań na `/auth/signin`. Jeśli ekranem głównym ma być `/`, potrzebne jest dopasowanie ścisłe dla `/` (np. `pathname === "/"`) albo lista tras publicznych.
- `:20` — anonim na chronionej trasie → 302 `/auth/signin` (zgodne z `prd.md:147`).
- Middleware nie przekierowuje **zalogowanego** użytkownika wchodzącego na `/auth/signin` / `/auth/signup` (brak takiej gałęzi w `:6-25`). PRD tego nie wymaga; to opcja do decyzji.
- `src/pages/api/auth/signin.ts:19` — sukces → `/`; `signout.ts:9` → `/`; `signup.ts:19` → `/auth/confirm-email`.
- Przy wyłączonym potwierdzaniu e-maila `supabase.auth.signUp` zwraca sesję, a klient SSR zapisuje ją w cookies (`src/lib/supabase.ts:14-18`) — **wniosek, niezweryfikowany uruchomieniem**: po rejestracji użytkownik jest już zalogowany, a mimo to trafia na stronę „sprawdź skrzynkę”. Przekierowanie po rejestracji prosto na ekran główny (lub na logowanie z komunikatem) to decyzja dla planu.

### 4. Zgodność z konwencjami `CLAUDE.md`

- `CLAUDE.md` wymaga w każdej trasie API `export const prerender = false` i walidacji zod. Żaden z 3 plików `src/pages/api/auth/*.ts` nie ma ani jednego, ani drugiego (`signin.ts:1-20`, `signup.ts:1-20`, `signout.ts:1-10`). Funkcjonalnie `prerender` jest nieszkodliwy, bo `output: "server"` (`astro.config.mjs:11`).
- `zod` **nie** jest bezpośrednią zależnością w `package.json`; w `node_modules` jest obecny tylko tranzytywnie. Dodanie walidacji zod wymaga `npm install zod`.
- Czy dociągać te konwencje w S-01 — do decyzji w planie (dotyka tych samych plików, które i tak trzeba zmienić dla polskich komunikatów błędów).

### 5. Weryfikacja

- Brak test runnera; jedynym automatycznym sprawdzeniem przepływu auth jest `npm run smoke` (`package.json` scripts; `scripts/smoke.mjs`). Smoke sprawdza tylko statusy i nagłówki `Location` (`smoke.mjs:35,64-66`), nie treść — tłumaczenie tekstów go nie zepsuje, zmiana tras już tak.
- Smoke test używa `/dashboard` jako trasy chronionej w 3 krokach (`:40,56,58`) i `/` jako trasy publicznej 200 (`:39`).

## Code References

- `src/layouts/Layout.astro:10,14` — tytuł domyślny startera, `lang="en"`
- `src/middleware.ts:4,18-22` — lista tras chronionych, dopasowanie `startsWith`, redirect anonima
- `src/pages/index.astro:1-8` — landing startera
- `src/components/Welcome.astro:1-114` — boilerplate do usunięcia
- `src/components/ui/LibBadge.astro:1-13` — nieużywany komponent startera
- `src/components/Topbar.astro:5-33` — pasek użytkownika (EN), zalążek nagłówka
- `src/pages/dashboard.astro:7-27` — chroniona strona demo (EN)
- `src/pages/auth/signin.astro:5-22`, `signup.astro:5-22` — strony formularzy (EN), przekazują `?error=` do wysp
- `src/pages/auth/confirm-email.astro:4-18` — treść zależna od `import.meta.env.DEV`
- `src/pages/api/auth/signin.ts:11,16,19` — błąd konfiguracji, surowy `error.message`, redirect `/`
- `src/pages/api/auth/signup.ts:11,16,19` — j.w., redirect `/auth/confirm-email`
- `src/pages/api/auth/signout.ts:9` — redirect `/`
- `src/components/auth/SignInForm.tsx:21-27,47-83` — walidacja i etykiety (EN)
- `src/components/auth/SignUpForm.tsx:26-41,57-63,70-130` — walidacja, podpowiedź z odmianą, etykiety (EN)
- `src/components/auth/PasswordToggle.tsx:14` — `aria-label` (EN)
- `src/lib/config-status.ts:15-17` — już po polsku
- `scripts/smoke.mjs:39-58` — kontrakt tras
- `node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts:6` — `ErrorCode`

## Architecture Insights

- Formularze to wyspy React z walidacją po stronie klienta i natywnym POST do `/api/auth/*` (`SignInForm.tsx:43`); błędy serwera wracają przez query string. Ten wzorzec (form POST + redirect) można zachować — wystarczy zmienić treść `?error=` z tekstu na kod.
- Teksty są rozsiane inline w 11 plikach (Layout, 8 plików UI, 2 trasy API); nie ma warstwy i18n. Przy jednym języku (PRD nie przewiduje innych) wystarczy tłumaczenie inline plus jedna mapa `kod błędu → polski komunikat` w `src/lib/`, współdzielona przez API (lub strony). Biblioteka i18n byłaby nadmiarowa.
- Minimalna długość hasła jest zapisana tylko po stronie klienta (`SignUpForm.tsx:8`, 6 znaków); serwer polega na regułach Supabase (`weak_password`).

## Historical Context (from prior changes)

- `context/archive/2026-09-23-production-deploy/plan.md:13` — opisuje komunikat „Supabase is not configured” z `signin.ts:10-12` jako sposób wykrycia brakujących sekretów. Twierdzenie nadal aktualne (kod bez zmian). Przetłumaczenie tego komunikatu zmieni tekst, po którym rozpoznaje się ten przypadek.
- `context/archive/2026-09-23-production-deploy/plan.md:107,122,304` i `deployment-log.md:19` — w produkcji *Confirm email* = OFF, rejestracja = ON. Potwierdzone także w `README.md` §Secrets. Źródło rozjazdu z `confirm-email.astro` opisanego wyżej.
- `context/changes/bootstrap-verification/verification.md` — nie dotyczy tego zakresu (nie analizowano szczegółowo).

## Related Research

Brak innych plików `research.md` w `context/changes/**` i `context/archive/**`.

## Open Questions

1. **Która trasa jest ekranem głównym?** (a) `/` staje się chronionym ekranem głównym (landing znika; anonim → `/auth/signin`; wymaga ścisłego dopasowania `/` w middleware i zmiany smoke testu `:39`), albo (b) zostaje `/dashboard` (po polsku), a `/` przekierowuje zależnie od sesji. Owner: user.
2. **Co po rejestracji?** Przy wyłączonym potwierdzaniu e-maila: od razu ekran główny, logowanie z komunikatem czy zachować `/auth/confirm-email` (po polsku, z poprawioną treścią)? Owner: user.
3. **Czy w S-01 dociągamy konwencje API z `CLAUDE.md`** (`prerender = false`, zod + dodanie zależności `zod`)? Owner: user.
4. **Czy zalogowany użytkownik na `/auth/*` ma być przekierowywany na ekran główny?** Niewymagane przez PRD. Owner: user.
5. **Niezacommitowane usunięcie importów Tailwind w `src/styles/global.css`** — zamierzone czy przypadkowe? Trzeba to rozstrzygnąć przed implementacją, bo inaczej zniknie całe stylowanie. Owner: user.
