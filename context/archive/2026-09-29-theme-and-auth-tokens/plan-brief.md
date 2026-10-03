# Paleta w tokenach i ekrany konta na tokenach — Plan Brief

> Full plan: `context/changes/theme-and-auth-tokens/plan.md`
> Research: `context/changes/theme-and-auth-tokens/research.md`

## What & Why

Ekrany konta mają już plik tokenów i `Button` z shadcn, ale z żadnego z nich nie korzystają: 37 literałów kolorów w 13 plikach, ręczne pole formularza, karta skopiowana 4 razy. Przepinamy je na tokeny ról i komponenty shadcn, wgrywamy wybraną paletę i zostawiamy guard. Chcemy to zrobić przed S-02 (`add-and-edit-clients`), żeby formularz klienta odziedziczył kontrakt, a nie literały.

## Starting Point

`global.css` publikuje role (`:root`/`.dark` → `@theme inline`) poprawnie, ale widoki używają `bg-cosmic`, `bg-white/10`, `text-purple-300` itd. `SubmitButton` nadpisuje kolory `Button`, a stan „Logowanie…” jest nieosiągalny (`useFormStatus` przy natywnym POST). Błędy pól nie mają `aria-*`, a `CLAUDE.md` nie ma reguły UI.

## Desired End State

Jasne ekrany konta i ekran główny: białe tło, `Card`, bursztynowy przycisk, ostre rogi. Każdy kolor pochodzi z tokenu, a skan literałów daje 0. Przycisk pokazuje stan wysyłki, błędy pól są ogłaszane czytnikom ekranu, a fokus jest widoczny wszędzie. Lokalna strona `/dev/ui` pokazuje wszystkie stany. ESLint blokuje literał koloru w widoku, a `CLAUDE.md` mówi agentowi, gdzie szukać tokenów i komponentów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Paleta | shadcn stone + amber, wartości dosłownie z `theme-values.css` | Wybór użytkownika, te same nazwy zmiennych, więc `@theme inline` bez zmian kolorów. | Research |
| Domyślny motyw | Jasny (`:root`), bez klasy `dark` | `.dark` zostaje na przyszły przełącznik, poza zakresem. | Research |
| Zakres powłoki | `index.astro` + `Topbar` minimalnie (tło, karta, tokeny) | Po zmianie palety ekran główny nie może odstawać, a pełny audyt dopiero po S-03. | Research |
| C4 (`confirm-email`) | Deferred | Zmiana treści i logiki, nie tokenów; kandydat na osobną zmianę przed S-02. | Research |
| Kolejność | Najpierw widoki na istniejących tokenach, potem wartości palety | Wariant „świeży starter z martwym plikiem tokenów”: paleta staje się jedną edycją. | Research |
| Promienie | `--radius: 0rem` + proporcjonalna skala (`* 0.6/0.8/1/1.4`) | Przy `0.625rem` identyczna z dzisiejszą, przy `0` ostre wszystko, także `rounded-xl` karty. | Plan |
| Banner `info`/`warning` | Mapowane na `muted` (`error` → `destructive`) | Bez nowych ról spoza motywu; dziś używany jest tylko `error`. | Plan |
| Guard | Reguła ESLint `no-restricted-syntax` + blok UI w `CLAUDE.md` | Działa w lint, lint-staged i IDE, bez nowej zależności. | Plan |
| Kitchen sink | `/dev/ui` tylko lokalnie (404 na produkcji) | Stany loading/disabled/error widoczne naraz do zrzutów i przy S-02, bez wycieku na produkcję. | Plan |
| Stan pending | Własny hook w `src/components/hooks/` z resetem na `pageshow` | `useFormStatus` nie śledzi natywnego POST, a bfcache blokowałby przycisk po powrocie Wstecz. | Plan |

## Scope

**In scope:**
- `shadcn add input label card alert`
- Strony auth, `index`, `FormField`, `SubmitButton`, `ServerError`, `PasswordToggle`, `SignUpForm`, `Banner`, `Topbar` na tokenach
- Usunięcie `bg-cosmic`, wartości palety w `global.css`, `components.json` → `stone`
- Hook pending, `aria-invalid`/`aria-describedby`, fokus z `--ring`
- `/dev/ui` z macierzą 7 stanów
- Reguła ESLint + sekcja `## UI` w `CLAUDE.md`

**Out of scope:**
- C4 (treść `confirm-email`), przełącznik motywu i włączanie `.dark`
- Role `--warning`/`--info`
- Pełny audyt 7 stanów ekranu głównego (po S-03)
- Playwright i test runner zrzutów, zmiany tekstów/walidacji/API, korekta `--secondary`

## Architecture / Approach

Wartości w `:root`/`.dark` → publikacja przez `@theme inline` → klasy ról (`bg-primary`, `text-muted-foreground`, `border-input`) → komponenty w `src/components/ui/` → widoki bez literałów. Widoki składają `Card`, `Label`+`Input`, `Alert` i `Button` bez nadpisywania kolorów. Zmiana palety to wyłącznie edycja `global.css`. ESLint pilnuje, żeby żaden widok (poza `ui/`) nie wrócił do literałów.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komponenty i widoki na tokenach | 4 komponenty shadcn, 0 literałów, ekrany jasne neutralne | `shadcn add` może zmienić `global.css` (sprawdzić diff) |
| 2. Wartości palety | Stone + amber, ostre rogi, `baseColor: stone` | Skala promieni: `Card` musi mieć `0px` |
| 3. Stany i kitchen sink | Pending, `aria-*`, fokus, `/dev/ui` (404 w prod) | Pending zablokowany po bfcache; kontrast amber |
| 4. Guard | Reguła ESLint + blok UI w `CLAUDE.md` | Selektory esquery w `.astro` — potwierdzić próbą |

**Prerequisites:** Lokalny Supabase (albo chmurowy) z wyłączonym potwierdzaniem e-maila do `npm run smoke`, `npm run dev` do zrzutów.
**Estimated effort:** ~2 sesje, 4 fazy (fazy 1 i 3 największe).

## Open Risks & Assumptions

- Kontrast `primary-foreground` na amber-700 szacowany na ~5:1. Potwierdzamy narzędziem w fazie 3.
- Po pushu na `main` produkcja od razu dostaje jasny motyw (auto-deploy, bez bramki).
- `confirm-email` w produkcji nadal mówi o linku, którego nie ma (C4). Zmiana to świadomie odkłada.

## Success Criteria (Summary)

- Użytkownik widzi spójne, jasne ekrany konta i ekran główny w jednej palecie, z ostrymi rogami i jednym kolorem akcji.
- Po kliknięciu „Zaloguj się” widać, że coś się dzieje, a błędy i fokus działają z klawiatury i czytnika ekranu.
- Następny agent (S-02) dostaje tokeny, komponenty, `/dev/ui` i regułę, a literał koloru nie przejdzie lintu.
