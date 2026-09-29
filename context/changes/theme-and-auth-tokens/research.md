---
date: 2026-09-29 (godzina nieznana — zegar niedostępny w tej sesji)
researcher: Claude (Opus 5.5) dla Dominik Blacha
git_commit: 369f0f7
branch: main
repository: 10x-kurs
topic: "Audyt UI ekranów konta pod kontrakt design systemu (tokeny + komponenty shadcn)"
tags: [research, ui, design-tokens, shadcn, auth, 10x-ui]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Follow-up: użytkownik wybrał motyw shadcn (stone + amber, radius 0) — wartości w theme-values.css; Open Question 1 częściowo rozstrzygnięte"
---

# Research: Audyt UI ekranów konta pod kontrakt design systemu

**Date**: 2026-09-29 (godzina nieznana)
**Researcher**: Claude (Opus 5.5) dla Dominik Blacha
**Git Commit**: 369f0f7 (z migawki git status na starcie sesji; drzewo robocze ma tylko nieśledzony folder tej zmiany)
**Branch**: main
**Repository**: 10x-kurs

## Research Question

Dwukierunkowy audyt `/10x-ui` dla widoku konta (`src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/*`) i jego powłoki (`src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/components/Banner.astro`):

1. **Źródło → widoki:** które tokeny z `src/styles/global.css` i które komponenty z `src/components/ui/` widoki faktycznie czytają?
2. **Widok → źródło:** który token lub komponent powinien pokryć każdy literał w widoku?
3. **Przypadkowa architektura:** co widzi użytkownik, który trafia na widok zalogowany, bez rejestracji, z linku albo po błędzie serwera?

Wynik: 3–5 zarzutów w `## Charges` z plikiem, linią i skutkiem dla użytkownika.

## Summary

- **Plik tokenów jest martwy dla tego widoku.** W 13 skanowanych plikach (3 strony auth, 6 komponentów auth, Layout, Topbar, Banner, `index.astro`) nie ma ani jednej klasy koloru opartej na roli (`bg-primary`, `text-muted-foreground`, `bg-card`, `border-input`, `text-destructive` itd.). Jedyny zaimportowany komponent `ui` to `Button` (`src/components/auth/SubmitButton.tsx:3`), a jego tokenowe kolory nadpisuje `className="… bg-purple-600 … text-white …"` (`SubmitButton.tsx:18`) przez `cn()`/tailwind-merge (`src/components/ui/button.tsx:47`).
- **Ciemny wygląd jest zbudowany z literałów na jasnych tokenach.** Tokeny `:root` są jasne (`--background: oklch(1 0 0)`, `global.css:8`), `body` dostaje `bg-background text-foreground` (`global.css:122`), ale każda strona auth nakłada `bg-cosmic`, czyli gradient z trzema kolorami hex (`global.css:113-115`), oraz biały tekst i karty `bg-white/10`. Wartości `.dark` (`global.css:41-73`) istnieją, ale w przejrzanych plikach nic nie ustawia klasy `dark` (`Layout.astro:14,21` — `<html lang="pl">` i `<body>` bez klasy; brak skryptu motywu).
- **Skan zahardkodowanych wartości:** 37 trafień w 13 plikach (per plik w tabeli niżej). Ostatni zapis skanu przed pierwszą edycją.
- **Brakujące komponenty:** w `src/components/ui/` jest tylko `button.tsx`. `FormField.tsx` ręcznie buduje `<label>` + `<input>` (`FormField.tsx:37-55`); karta `rounded-2xl border border-white/10 bg-white/10 p-8 … backdrop-blur-xl` jest powtórzona 4 razy (signin:12, signup:12, confirm-email:23, index:10); powierzchnie błędów/komunikatów (`ServerError.tsx:11`, `Banner.astro:27-41`) nie korzystają z żadnego komponentu.
- **Przypadkowa architektura:** produkcyjny wariant `confirm-email` mówi „Wysłaliśmy link potwierdzający” (`confirm-email.astro:14-17`), a produkcja ma wyłączone potwierdzanie e-maila (README §Secrets; decyzja odłożona w `context/archive/2026-09-29-polish-auth-shell/plan.md:39`). Stan ładowania przycisku opiera się na `useFormStatus` przy formularzu z natywnym `action="/api/auth/…"` (`SubmitButton.tsx:12`, `SignInForm.tsx:43`) — wnioskuję, że `pending` nigdy nie staje się `true` (do potwierdzenia w przeglądarce).
- **Reguły agenta:** `CLAUDE.md` nie zachęca do wartości jednorazowych, ale też nie ma żadnej reguły UI (gdzie tokeny, gdzie komponenty, zakaz literałów). Brak reguły = brak blokady dryfu w S-02.

## Charges

| # | Kategoria | Dowód (plik:linia) | Skutek dla użytkownika | Co powinno to pokryć | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | Missing tokens | `src/styles/global.css:113-115` (`bg-cosmic` z hex), `src/pages/auth/signin.astro:11-13,17,19`, `signup.astro:11-13,17,19`, `confirm-email.astro:22-23,25,28-29`, `src/components/auth/SubmitButton.tsx:18,22`, `Topbar.astro:5-8` | Każdy ekran konta ma własny odcień niebieskiego/fioletu i nic nie ustala, co jest akcją główną, a co tłem; zmiana marki albo trybu ciemnego wymaga edycji każdego pliku, a S-02 skopiuje te same literały do formularza klienta. | `bg-background`/`text-foreground` dla tła, `bg-card`/`text-card-foreground`/`border-border` dla karty, `text-foreground` dla nagłówka (bez gradientu), `text-muted-foreground` dla tekstów pomocniczych, `text-primary` dla linków, `Button` w wariancie `default` (bez nadpisywania kolorów); wartości palety w `:root` (i ewentualnie `.dark`) | do planu |
| C2 | Missing shared component | `src/components/auth/FormField.tsx:5-6,37,41,51-54,59`; karta powtórzona: `signin.astro:12`, `signup.astro:12`, `confirm-email.astro:23`, `index.astro:10` | Pole formularza i karta są zrobione ręcznie, więc każdy następny formularz (klient, faktura) będzie je budował od nowa. Błąd pola jest tylko wizualny: `<input>` nie ma `aria-invalid` ani `aria-describedby` wskazującego komunikat (`FormField.tsx:42-55`), więc czytnik ekranu nie zapowiada, co jest nie tak. | `npx shadcn@latest add input label card`; `FormField` składa `Label` + `Input` (z `aria-invalid`, `aria-describedby`) zamiast własnych klas; strony auth używają `Card` | do planu |
| C3 | Missing tokens + component (powierzchnie komunikatów) | `src/components/auth/ServerError.tsx:11`, `src/components/Banner.astro:27-41` (9 hexów w scoped CSS), `FormField.tsx:59` (`text-red-300`) | Błąd serwera i banner konfiguracji mają kolory spoza systemu: czerwień błędu w formularzu to inny odcień niż `--destructive`, a banner ma jasne pastelowe tła niezależne od motywu. Po zmianie palety błędy wyglądałyby jak z innej aplikacji. | `npx shadcn@latest add alert` (wariant `destructive` na `--destructive`) dla `ServerError`; `Banner` na tokenach — `error` → `destructive`; dla `info`/`warning` w `global.css` nie ma tokenów (`global.css:6-39`), więc albo dodać `--warning`/`--info`, albo zmapować na `muted`/`accent` | do planu |
| C4 | Accidental architecture | `src/pages/auth/confirm-email.astro:4,13-17`; `src/pages/api/auth/signup.ts:24`; README §Secrets („email confirmation disabled”) | W produkcji po rejestracji użytkownik czyta „Wysłaliśmy link potwierdzający… Kliknij go, aby aktywować konto”, choć żaden link nie przychodzi, a konto już działa. Ta sama strona otwarta z linku bez rejestracji ogłasza sukces lub wysłanie maila. | Ekran zależny od faktycznej konfiguracji (albo jeden prawdziwy komunikat „Konto utworzone”), nie od `import.meta.env.DEV` | **deferred** — to zmiana treści i logiki, nie tokenów; wcześniej świadomie odłożona (`archive/…polish-auth-shell/plan.md:39`). Kandydat na małą osobną zmianę przed S-02 |
| C5 | Stany (loading / focus-visible / disabled) | `src/components/auth/SubmitButton.tsx:12,17,20-24` + `SignInForm.tsx:43`, `SignUpForm.tsx:68` (natywny `action` jako string); `FormField.tsx:6` (`focus:ring-purple-400`); `global.css:25` (`--ring: oklch(0.708 0 0)`) | Po kliknięciu „Zaloguj się” przycisk najpewniej nie przechodzi w stan „Logowanie…” ani nie blokuje się, bo `useFormStatus` śledzi tylko formularze z akcją-funkcją React, a tu jest natywny POST — użytkownik nie wie, czy klik zadziałał, i może wysłać formularz dwa razy (**wniosek, do potwierdzenia w przeglądarce**). Pierścień fokusu pola jest fioletowym literałem, a przycisku szarym `--ring` na ciemnym tle — dwa różne sygnały fokusu. | Stan pending z własnego `useState` ustawianego w `onSubmit` po udanej walidacji; fokus pól i przycisku z `--ring` (wbudowany w shadcn `Input`/`Button`); macierz 7 stanów jako kryterium fazy stanów | do planu |

**Odłożone poza charges (bez numeru):** `src/pages/index.astro` (3 trafienia skanu, karta i `bg-cosmic`) nie należy do tego widoku, ale korzysta z tej samej powłoki. Jeśli `bg-cosmic` zniknie albo zmieni się paleta, ekran główny przestanie pasować do reszty. Plan musi albo przestawić go minimalnie (tło + karta), albo świadomie zostawić do zmiany po S-03 (patrz `change.md`).

## Detailed Findings

### Źródło tokenów (`src/styles/global.css`)

- Układ kontraktu jest poprawny: wartości w `:root` (`:6-39`) i `.dark` (`:41-73`), publikacja przez `@theme inline` jako `var(--…)` (`:75-111`). W bloku `@theme inline` nie ma surowych kolorów, więc przełączenie `.dark` zadziała, gdy ktoś je włączy.
- Paleta to domyślny shadcn `neutral` (`components.json:9`): wszystkie kolory poza `--destructive` i `--chart-*` mają chromę `0` (szarości). `--primary` = `oklch(0.205 0 0)` (prawie czarny) w jasnym motywie (`:14`).
- Wariant ciemny (`.dark`) nie jest nigdzie włączany: `Layout.astro:14` renderuje `<html lang="pl">`, `:21` `<body>` bez klas; `@custom-variant dark (&:is(.dark *))` (`:4`) wymaga klasy przodka. Przejrzane pliki: wszystkie w `src/layouts`, `src/pages`, `src/components` (wyszukiwanie IDE niedostępne w tej sesji — ocena na podstawie odczytu wszystkich 13 plików plus `middleware.ts`).
- `@utility bg-cosmic` (`:113-115`) to jedyny literał w pliku tokenów: trzy hexy poza systemem ról, użyty w 4 plikach (signin:11, signup:11, confirm-email:22, index:7).
- Brak tokenów `--warning`, `--success`, `--info` (`:6-39`); `Banner` ma warianty `info`/`warning`, które nie mają odpowiednika.

### Źródło → widoki (użycie tokenów i komponentów)

| Plik | Klasy ról (token) | Importy z `@/components/ui` | Trafienia skanu |
| --- | --- | --- | --- |
| `src/pages/auth/signin.astro` | 0 | 0 | 4 |
| `src/pages/auth/signup.astro` | 0 | 0 | 4 |
| `src/pages/auth/confirm-email.astro` | 0 | 0 | 4 |
| `src/components/auth/FormField.tsx` | 0 | 0 | 5 |
| `src/components/auth/SubmitButton.tsx` | 0 (tokenowe kolory `Button` nadpisane) | 1 (`Button`) | 2 |
| `src/components/auth/ServerError.tsx` | 0 | 0 | 1 |
| `src/components/auth/PasswordToggle.tsx` | 0 | 0 | 1 |
| `src/components/auth/SignUpForm.tsx` | 0 | 0 | 1 |
| `src/components/auth/SignInForm.tsx` | 0 | 0 | 0 |
| `src/components/Banner.astro` | 0 (scoped CSS z hex) | 0 | 9 |
| `src/components/Topbar.astro` | 0 | 0 | 3 |
| `src/layouts/Layout.astro` | 0 (tokeny tylko pośrednio przez `body` w `global.css:122`) | 0 | 0 |
| `src/pages/index.astro` (powłoka, poza widokiem) | 0 | 0 | 3 |
| **Razem** | **0** | **1** | **37** |

Jedyne miejsca, gdzie tokeny faktycznie trafiają na ekran: `* { border-border outline-ring/50 }` i `body { bg-background text-foreground }` (`global.css:118-123`) — pod `bg-cosmic` tło `body` nie jest widoczne; oraz w `Button` klasy nienadpisane przez `SubmitButton`: `focus-visible:ring-ring/50`, `disabled:opacity-50` (`button.tsx:8`).

### Widok → źródło (literały i ich tokeny)

- Tło strony: `bg-cosmic` (signin:11, signup:11, confirm-email:22) → `bg-background`.
- Karta: `border-white/10 bg-white/10 … text-white backdrop-blur-xl` (signin:12, signup:12, confirm-email:23) → `Card` (`bg-card text-card-foreground border`).
- Nagłówek: `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent` (signin:13, signup:13, confirm-email:25) → `text-foreground` (gradient na tekście to dokładnie wzorzec „AI landing” z listy „Failures to refuse”).
- Teksty pomocnicze: `text-blue-100/60` (signin:17, signup:17), `text-blue-100/80` (confirm-email:28, `FormField.tsx:37`), `text-blue-100/50` (`SignUpForm.tsx:64`), `text-white/40` (`FormField.tsx:41`, `PasswordToggle.tsx:13`) → `text-muted-foreground`.
- Linki: `text-purple-300 hover:underline` (signin:19, signup:19, confirm-email:29), `text-purple-300 … hover:text-purple-100` (`Topbar.astro:8`) → `text-primary` / `Button variant="link"`.
- Pole: `bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-purple-400` (`FormField.tsx:6,53`) → shadcn `Input` (`border-input`, `placeholder:text-muted-foreground`, `focus-visible:ring-ring`).
- Błąd pola: `border-red-400/60 focus:ring-red-400` (`FormField.tsx:53`), `text-red-300` (`:59`) → `aria-invalid` + `border-destructive` / `text-destructive` (shadcn `Input` już stylizuje `aria-invalid:`).
- Błąd serwera: `border-red-500/30 bg-red-900/30 text-red-300` (`ServerError.tsx:11`) → `Alert variant="destructive"`.
- Przycisk: `bg-purple-600 text-white hover:bg-purple-500 rounded-lg` (`SubmitButton.tsx:18`) → `Button` bez nadpisań kolorów (`bg-primary text-primary-foreground hover:bg-primary/90`); spinner `border-white/30 border-t-white` (`:22`) → `border-current` lub ikona `Loader2` z `animate-spin`.
- Topbar: `border-white/10 bg-white/5 text-white/80` (`:5`), `text-blue-100/70` (`:6`) → `bg-card`/`border`/`text-muted-foreground`.
- Banner: 9 hexów (`Banner.astro:28-40`) → `destructive` (error) + nowe tokeny albo `muted` (info/warning).

### Przypadkowa architektura — ścieżki wejścia

- **Zalogowany na `/auth/signin` lub `/auth/signup`:** 302 na `/` (`middleware.ts:7,23-25`). OK.
- **Zalogowany lub anonim na `/auth/confirm-email`:** strona zawsze się renderuje (`middleware.ts:7` jej nie obejmuje — świadomie, `archive/…polish-auth-shell/plan.md:30`). Treść zależy tylko od `import.meta.env.DEV` (`confirm-email.astro:4`), nie od tego, czy ktoś się właśnie zarejestrował → C4.
- **Błąd serwera:** API przekierowuje na stronę z `?error=<kod>` (`signup.ts:11,16,21`), strona zamienia kod na polski tekst po stronie serwera (`auth-errors.ts:18-21`) i przekazuje go do wyspy (`signin.astro:6-7,16`). Surowy JSON ani tekst z URL nie trafiają do UI. OK.
- **Brak konfiguracji Supabase:** `Layout.astro:22-35` renderuje `Banner variant="error"` nad każdą stroną z `role="alert"` (`Banner.astro:11`) — działa, problemem są tylko kolory (C3).
- **Ładowanie:** C5.

### Stany (wstęp do macierzy 7 stanów)

| Stan | Obecnie | Źródło |
| --- | --- | --- |
| default | literały | C1 |
| hover | literały (`hover:bg-purple-500`, `hover:text-white/70`, `hover:underline`) | `SubmitButton.tsx:18`, `PasswordToggle.tsx:13` |
| focus-visible | pole: `focus:ring-purple-400` (literał, `focus:` zamiast `focus-visible:`); przycisk: `--ring`; `PasswordToggle` i linki: brak własnego stylu (tylko globalne `outline-ring/50` z `global.css:119`) | `FormField.tsx:6,53`, `button.tsx:8`, `PasswordToggle.tsx:13` |
| disabled | `disabled={pending}` + `disabled:opacity-50`, ale `pending` najpewniej nigdy `true` | `SubmitButton.tsx:17`, C5 |
| error | komunikat przy polu z ikoną i tekstem (nie tylko kolor), ale bez `aria-invalid`/`aria-describedby`; kolory literałami | `FormField.tsx:58-62`, C2/C3 |
| empty | N/A dla formularzy logowania/rejestracji (brak danych do listowania) | — |
| loading | spinner zdefiniowany, najpewniej nieosiągalny | C5 |

## Code References

- `src/styles/global.css:6-39` — tokeny jasne (`:root`), paleta neutral
- `src/styles/global.css:41-73` — tokeny `.dark`, nigdzie niewłączane
- `src/styles/global.css:75-111` — `@theme inline`, publikacja przez `var()` (poprawna)
- `src/styles/global.css:113-115` — `bg-cosmic`, trzy hexy
- `src/components/ui/button.tsx:8,12,47` — bazowe klasy fokusu/disabled, wariant default na `primary`, `cn()` scala nadpisania
- `src/components/auth/SubmitButton.tsx:12,17-18,22` — `useFormStatus`, nadpisanie kolorów `Button`
- `src/components/auth/FormField.tsx:5-6,37-62` — ręczny label/input, brak `aria-invalid`/`aria-describedby`
- `src/components/auth/ServerError.tsx:11` — czerwone literały
- `src/components/Banner.astro:15-41` — scoped CSS z hex
- `src/pages/auth/confirm-email.astro:4-18` — treść zależna od `import.meta.env.DEV`
- `src/pages/api/auth/signup.ts:24` — sukces → `/auth/confirm-email`
- `src/middleware.ts:7,23-29` — przekierowania zalogowanego i ochrona `/`
- `src/layouts/Layout.astro:14,21-35` — brak klasy `dark`, banner konfiguracji
- `components.json:3,9` — `new-york`, `baseColor: neutral`

## Architecture Insights

- **Wariant kontraktu (potwierdzony):** świeży starter z martwym plikiem tokenów. Mechanika tokenów (`:root` → `@theme inline`) jest gotowa i poprawna; widoki jej nie czytają. Faza 1 to przestawienie widoków na istniejące role, dopiero potem wybór wartości palety.
- **Konsekwencja przestawienia na obecne tokeny:** ekrany zmienią się z ciemnego „cosmic” na jasny neutralny szary (wartości `:root`), bo `.dark` nie jest włączany. To jest decyzja produktowa, nie efekt uboczny — patrz Open Questions.
- **tailwind-merge ukrywa dryf:** `SubmitButton` wygląda jak użycie komponentu z design systemu, ale `cn()` usuwa jego tokenowe kolory. Przy przeglądzie „czy używa `Button`?” to przechodzi; tylko skan literałów to wyłapuje.
- **Guard:** repo ma ESLint (`eslint.config.*`) i lint-staged dla `*.{ts,tsx,astro}` (`package.json` → `lint-staged`). Skan literałów da się podpiąć bez nowej zależności (np. `no-restricted-syntax` na literałach klas albo skrypt grep w lint-staged) — do decyzji w planie.

## Historical Context (from prior changes)

- `context/archive/2026-09-29-polish-auth-shell/plan.md:37` — „Przeprojektowanie wizualne (motyw `bg-cosmic`, karty `bg-white/10` zostają)” — **wspierane**: stan kodu to potwierdza; ta zmiana jest właśnie tym odłożonym przeprojektowaniem.
- `…/plan.md:39` — „Zmiana logiki `confirm-email.astro` (podział `import.meta.env.DEV`) — tylko tłumaczenie … Włączenie potwierdzania e-maila w produkcji to osobna, przyszła decyzja” — **wspierane**; podstawa oznaczenia C4 jako deferred.
- `…/plan.md:30` — produkcja ma wyłączone potwierdzanie, `signUp` od razu ustawia sesję, więc `/auth/confirm-email` jest poza przekierowaniem zalogowanego — **wspierane** (`middleware.ts:7`).
- `…/plan.md:75` — ekran główny „styl zgodny z istniejącymi stronami (`bg-cosmic`, karta `bg-white/10`)” — **wspierane**; wyjaśnia, dlaczego `index.astro` dzieli literały z auth.
- `context/foundation/roadmap.md:45` — S-02 `add-and-edit-clients` jest następnym wycinkiem; pierwszy formularz domenowy odziedziczy wzorzec `FormField`.

## Related Research

- `context/archive/2026-09-29-polish-auth-shell/research.md` — audyt tekstów i tras auth (bez części wizualnej).

## Open Questions

1. **Kierunek kolorystyczny (decyzja użytkownika, blokuje fazę wartości tokenów, nie fazę przepięcia widoków):** czy aplikacja zostaje ciemna (wtedy albo `class="dark"` na `<html>` jako stały motyw, albo ciemne wartości w `:root`), czy przechodzi na jasny motyw? Jaki kolor marki dla `--primary` (dziś neutralny prawie-czarny)?
2. **`index.astro` w zakresie?** Minimalne przestawienie tła i karty (żeby po zmianie palety nie odstawał) czy świadome odłożenie do audytu po S-03?
3. **Tokeny `--warning`/`--info` dla `Banner`:** dodać nowe role czy zmapować `info`/`warning` na `muted`/`accent`? Dziś w kodzie jest używany tylko wariant `error` (`Layout.astro:23`).
4. **C5 do potwierdzenia w przeglądarce:** czy `useFormStatus().pending` staje się `true` przy natywnym `action="/api/auth/…"`. Jeśli nie, stan ładowania trzeba oprzeć o własny stan.
5. **Guard:** reguła ESLint vs. skrypt grep w lint-staged — obie bez nowej zależności; wybór w planie.

## Follow-up 2026-09-29: wybrany motyw

**Decyzja użytkownika:** paleta shadcn wklejona w rozmowie, zapisana dosłownie w `context/changes/theme-and-auth-tokens/theme-values.css`. Rozpoznanie (wniosek z wartości, nie deklaracja źródła): baza `stone`, akcent `amber` — `--primary` = `oklch(0.555 0.163 48.998)` w `:root`, `oklch(0.473 0.137 46.201)` w `.dark`.

Wpływ na Open Questions:

- **OQ1 — częściowo rozstrzygnięte.** Kolor marki: bursztyn. Zestaw obejmuje zarówno `:root`, jak i `.dark`, a te same nazwy zmiennych co obecny `global.css:6-73`, więc faza wartości to podmiana wartości bez zmiany `@theme inline` (`global.css:75-111`). **Nadal otwarte:** który motyw jest domyślny. Bez zmian w `Layout.astro` `.dark` się nie włączy, więc ekrany będą jasne (białe tło, bursztynowy przycisk). Ciemny wygląd wymaga `class="dark"` na `<html>` (`Layout.astro:14`).
- **OQ3 — bez zmian.** Motyw nie zawiera `--warning`/`--info`/`--success`; `Banner` `info`/`warning` nadal nie ma ról.

Nowe ustalenia z wartości:

- **`--radius: 0` (bezjednostkowe).** `@theme inline` liczy `--radius-sm: calc(var(--radius) - 4px)` i `--radius-md: calc(var(--radius) - 2px)` (`global.css:76-77`). `calc(0 - 4px)` łączy liczbę z długością, więc jest nieprawidłowe; właściwość korzystająca z tej zmiennej spada do wartości początkowej (`0`). Efekt wizualny jest ten sam (ostre rogi), ale opiera się na błędnym CSS; `--radius-xl` (`calc(0 + 4px)`) jest tak samo nieprawidłowe. Bezpieczniej zapisać `--radius: 0rem` (wtedy `sm`/`md` dają wartości ujemne, które `border-radius` odrzuca → też `0`; `xl` = `4px`). Do rozstrzygnięcia w planie; wpływa na kartę (`rounded-xl` w shadcn `Card`) i komunikaty.
- **Ostre rogi dotyczą wszystkich komponentów shadcn** (`button.tsx:8` `rounded-md`, przyszłe `Input`/`Card`/`Alert`). Literały `rounded-lg`/`rounded-2xl` w widokach (`FormField.tsx:6`, `ServerError.tsx:11`, `SubmitButton.tsx:18`, `signin.astro:12`) nie korzystają z `--radius` i zostałyby zaokrąglone — kolejny dowód do C1.
- **Kontrast (szacunek, do potwierdzenia narzędziem w fazie stanów):** `--primary-foreground` na `--primary` w `:root` to prawie biały na amber-700 (~5:1), w `.dark` na amber-800 (~7:1); `--muted-foreground` (stone-500) na białym ~4,8:1. Bez sprawdzenia w przeglądarce traktować jako wstępne.
**Decyzje użytkownika (ta sama rozmowa):**

- **OQ1 — rozstrzygnięte:** domyślny motyw jasny (`:root`), bez klasy `dark` w `Layout.astro`. `.dark` zostaje w pliku; dopóki nic go nie włącza, kontrast i zrzuty sprawdzamy tylko dla jasnego.
- **OQ2 — rozstrzygnięte:** `index.astro` i `Topbar.astro` wchodzą minimalnie (tło, karta, Topbar na tokenach). Punkt „Odłożone poza charges” dotyczący `index.astro` przestaje być odłożony w tej części; pełny audyt stanów ekranu głównego nadal po S-03.
- **Otwarte bez zmian:** OQ3 (role `warning`/`info` dla `Banner`), OQ4 (C5 w przeglądarce), OQ5 (forma guarda), zapis `--radius`.

- **`--secondary`/`--secondary-foreground` mają odcień 286 (zimny, zinc),** a reszta neutralnych 49–106 (ciepły, stone). To wartości z wklejonego motywu; odnotowuję, nie poprawiam — `secondary` nie jest dziś używany w widoku.
