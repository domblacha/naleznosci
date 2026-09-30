# Paleta w tokenach i ekrany konta na tokenach — plan implementacji

## Overview

Ekrany konta (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) i ich powłoka (`Layout`, `Banner`, `Topbar`, minimalnie `index.astro`) przechodzą z literałów „cosmic” (hexy, klasy palety Tailwind, gradient na tekście) na tokeny ról z `src/styles/global.css` i komponenty shadcn z `src/components/ui/`. Potem do tokenów trafia wybrana paleta (stone + amber, ostre rogi, domyślnie jasny motyw). Naprawiamy stany: loading, focus-visible i dostępność błędów. Na koniec zostaje reguła w `CLAUDE.md` oraz check ESLint, żeby S-02 (`add-and-edit-clients`) odziedziczył kontrakt zamiast literałów.

## Current State Analysis

Pełny audyt: `research.md` (`## Charges` C1–C5).

- Mechanika tokenów działa (`:root` / `.dark` → `@theme inline`, `global.css:6-111`), ale w 13 plikach widoku nie ma ani jednej klasy roli. Skan zahardkodowanych wartości daje 37 trafień.
- Jedyny komponent `ui` to `Button`. `SubmitButton` nadpisuje jego kolory przez `cn()` (`SubmitButton.tsx:18`). Pole formularza i karta są robione ręcznie, a karta jest skopiowana 4 razy.
- `bg-cosmic` (`global.css:113-115`) to jedyny literał w pliku tokenów.
- Błąd pola nie ma `aria-invalid` ani `aria-describedby` (`FormField.tsx:42-55`).
- `useFormStatus` przy natywnym `action="/api/auth/…"` nie śledzi wysyłki (`SubmitButton.tsx:12`, `SignInForm.tsx:43`), więc stan „Logowanie…” jest nieosiągalny.
- `Banner.astro:27-41` ma 9 hexów w scoped CSS. Używany jest tylko wariant `error` (`Layout.astro:23`).
- `CLAUDE.md` nie ma żadnej reguły UI.

## Desired End State

- Skan literałów na plikach widoku (lista w *Critical Implementation Details*) zwraca **0** trafień, a `bg-cosmic` nie istnieje.
- Ekrany konta i ekran główny są jasne: białe tło, karta `Card`, bursztynowy przycisk `Button` (wariant `default`), ostre rogi. Wszystkie kolory pochodzą z tokenów.
- `global.css` ma w `:root` / `.dark` wartości z `theme-values.css` z komentarzem o źródle. `Layout.astro` nadal nie ma klasy `dark`.
- Po kliknięciu „Zaloguj się” / „Załóż konto” przy poprawnych danych przycisk przechodzi w stan pending (spinner i tekst) i się blokuje. Po powrocie przyciskiem Wstecz przeglądarki nie zostaje zablokowany.
- Pole z błędem ma `aria-invalid="true"` i `aria-describedby` wskazujące komunikat. Fokus klawiatury jest widoczny na każdym kontrolu (pola, przełącznik hasła, przycisk, linki) i pochodzi z `--ring`.
- `/dev/ui` pokazuje lokalnie macierz 7 stanów. Na produkcji zwraca 404.
- `npm run lint` odrzuca literał koloru w klasie widoku, a `CLAUDE.md` ma blok UI.

### Key Discoveries:

- `src/components/ui/button.tsx:8` — bazowe `focus-visible:ring-ring/50`, `aria-invalid:border-destructive` i `disabled:opacity-50` działają dopiero wtedy, gdy widok nie nadpisuje kolorów.
- `src/styles/global.css:76-79` — addytywna skala promieni (`calc(var(--radius) - 4px)`) przy `--radius: 0` daje nieprawidłowy CSS, a przy `0rem` karta (`rounded-xl`) dostaje 4px.
- `src/pages/auth/confirm-email.astro:4` — treść zależy od `import.meta.env.DEV` (C4, deferred).
- `src/lib/config-status.ts:23` + `Layout.astro:22-35` — banner `error` renderuje się przy braku konfiguracji Supabase.
- `components.json:18` — alias `hooks` wskazuje `@/hooks`, ale `CLAUDE.md` każe trzymać hooki w `src/components/hooks/`. Obowiązuje `CLAUDE.md`.
- `eslint.config.js` — flat config z `eslint-plugin-astro` (parser daje węzły `JSXAttribute` także dla `.astro`), lint-staged uruchamia `eslint --fix` na `*.{ts,tsx,astro}`.

## What We're NOT Doing

- **C4** — treść i logika `confirm-email` (komunikat o linku przy wyłączonym potwierdzaniu). Zostaje jako deferred w `research.md`, jest kandydatem na osobną małą zmianę przed S-02. W tej zmianie strona dostaje tylko tokeny i `Card` (emoji i teksty bez zmian).
- Przełącznik motywu i włączanie `.dark`. Wartości `.dark` są podmieniane, ale nic ich nie włącza, a kontrast sprawdzamy tylko dla jasnego motywu.
- Nowe role `--warning` / `--info` / `--success`. `Banner` `info`/`warning` mapujemy na `muted`.
- Pełny audyt 7 stanów ekranu głównego (`index.astro`). To osobna zmiana po S-03. Tu `index` i `Topbar` dostają tylko tło, kartę i tokeny.
- Playwright ani żaden inny test runner zrzutów. Bramka to kitchen sink i ręczne zrzuty.
- Zmiany tekstów, walidacji i API auth.
- Poprawianie odcienia `--secondary` (zinc 286 w motywie stone). Wartości motywu przenosimy dosłownie, poza `--radius`.

## Implementation Approach

Kolejność wynika z wariantu kontraktu „świeży starter z martwym plikiem tokenów”:

1. Widoki zaczynają czytać **istniejące** role (neutralną paletę) przez komponenty shadcn.
2. Podmiana wartości palety staje się wtedy jedną edycją `global.css`, która przemalowuje wszystko naraz.
3. Stany i dostępność.
4. Guard (reguła i check), żeby kontrakt przetrwał następną sesję.

Mapowanie zarzutów: C1 → fazy 1+2, C2 → faza 1 (+ `aria` w fazie 3), C3 → faza 1, C5 → faza 3, C4 → deferred.

Po każdej fazie wizualnej: zrzut na desktopie i przy szerokości 375px oraz ponowny skan literałów.

## Critical Implementation Details

**Skan literałów (lista plików widoku).** Ta sama komenda po każdej fazie. W fazie 3 dochodzi `src/pages/dev/ui.astro`.

```bash
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b' \
  src/pages/auth/*.astro src/pages/index.astro src/components/auth/*.tsx \
  src/components/Banner.astro src/components/Topbar.astro src/layouts/Layout.astro
```

**`shadcn add` a `global.css`.** CLI może dopisać zmienne lub importy do `src/styles/global.css` i zmienić zależności. Po `add` sprawdź `git diff src/styles/global.css` i cofnij zmiany wykraczające poza zakres. Wartości palety wchodzą dopiero w fazie 2. Nowa zależność Radix dla `Label` jest oczekiwana.

**Stan pending (kolejność).** `pending` ustawia się w `onSubmit` **dopiero po** udanej walidacji i bez `preventDefault`. Natywny POST już trwa, więc zablokowanie przycisku po re-renderze go nie anuluje. Hook resetuje `pending` na zdarzeniu `pageshow` z `event.persisted === true`. Bez tego przycisk przywrócony z bfcache (Wstecz po przekierowaniu) zostaje zablokowany.

**Selektory ESLint.** `no-restricted-syntax` przyjmuje selektory esquery. Regex w selektorze (`[value=/…/]`) nie może zawierać `/`, a backslashe w stringu JS trzeba podwoić. Regułę trzeba zweryfikować próbą: tymczasowy literał `bg-purple-600` w `.tsx` i `.astro` musi dać błąd.

---

## Phase 1: Komponenty shadcn i widoki na istniejących tokenach

### Overview

Dodajemy brakujące komponenty i przepinamy wszystkie pliki widoku oraz powłokę na role z obecnego `:root`. Ekrany zmieniają się z ciemnych „cosmic” na jasne neutralne. To zamierzony stan przejściowy przed fazą 2.

### Changes Required:

#### 1. Komponenty shadcn

**File**: `src/components/ui/{input,label,card,alert}.tsx` (nowe)

**Intent**: Dostarczyć pole, etykietę, kartę i komunikat z design systemu zamiast ręcznych odpowiedników (C2, C3).

**Contract**: `npx shadcn@latest add input label card alert` (styl `new-york` z `components.json`). Plików nie edytujemy ręcznie.

#### 2. Usunięcie `bg-cosmic`

**File**: `src/styles/global.css`

**Intent**: Usunąć jedyny literał z pliku tokenów. Tło stron daje `body { bg-background }`.

**Contract**: Blok `@utility bg-cosmic` (`:113-115`) usunięty. Żaden plik nie odwołuje się do `bg-cosmic`.

#### 3. Strony auth i ekran główny

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/pages/index.astro`

**Intent**: Karta ze szklanego `div` staje się `Card`, nagłówek z gradientem przechodzi na `text-foreground`, teksty pomocnicze na `text-muted-foreground`, a linki na `text-primary` (C1, C2).

**Contract**: Wrapper strony bez klasy tła (dziedziczy `bg-background`). Treść w `Card` (+ `CardHeader`/`CardTitle`/`CardContent` według potrzeby). Nagłówek `h1` zostaje `h1`. Linki `text-primary underline-offset-4 hover:underline`. Emoji i teksty `confirm-email` bez zmian (C4 deferred).

#### 4. Pole formularza

**File**: `src/components/auth/FormField.tsx`

**Intent**: Złożyć pole z `Label` + `Input` zamiast ręcznych klas. Stan błędu na `destructive`.

**Contract**: Props bez zmian w tej fazie. Ikona na `text-muted-foreground`, `Input` z lewym paddingiem na ikonę, komunikat błędu `text-destructive` z ikoną `CircleAlert`. Stała `inputBase` znika.

#### 5. Przycisk, błąd serwera, podpowiedź hasła, przełącznik

**File**: `src/components/auth/SubmitButton.tsx`, `src/components/auth/ServerError.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/PasswordToggle.tsx`

**Intent**: `SubmitButton` używa `Button` bez nadpisywania kolorów. `ServerError` staje się `Alert variant="destructive"`. Podpowiedź hasła i ikona przełącznika przechodzą na `text-muted-foreground` (C1, C3).

**Contract**: `SubmitButton` `className` tylko z layoutem (`w-full`). Spinner na `border-current` albo `Loader2`, bez literałów koloru. `ServerError` zwraca `null` przy braku komunikatu jak dotąd.

#### 6. Banner i Topbar

**File**: `src/components/Banner.astro`, `src/components/Topbar.astro`

**Intent**: Banner bez scoped CSS i hexów. Topbar na tokenach karty.

**Contract**: `Banner` zachowuje `variant: "info" | "warning" | "error"` i `role`. `error` → `bg-destructive/10 text-destructive border-destructive`, `info`/`warning` → `bg-muted text-foreground border-border`. Link w bannerze dziedziczy kolor i jest podkreślony. `<style>` usunięte, klasy przez `class:list`. `Topbar` → `bg-card text-card-foreground border`, e-mail `text-muted-foreground`, „Wyloguj” jako `Button variant="link"` `type="submit"`.

### Success Criteria:

#### Automated Verification:

- Pliki komponentów istnieją: `ls src/components/ui/{input,label,card,alert}.tsx`
- Skan literałów (Critical Implementation Details) zwraca 0 linii
- `bg-cosmic` nie występuje: `grep -rn "bg-cosmic" src` zwraca 0 linii
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` i `/` renderują się jasno i czytelnie: zrzut na desktopie i przy 375px
- Logowanie z błędnym hasłem pokazuje komunikat w `Alert` destructive, a błędy pól są czerwone (`destructive`)
- `git diff src/styles/global.css` zawiera tylko usunięcie `bg-cosmic`, bez zmian od `shadcn add`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Wartości palety (stone + amber, ostre rogi)

### Overview

Przenosimy wybrany motyw do tokenów. Wszystkie widoki przemalowują się bez edycji plików widoku.

### Changes Required:

#### 1. Wartości tokenów

**File**: `src/styles/global.css`

**Intent**: Podmienić wartości w `:root` i `.dark` na wartości z `context/changes/theme-and-auth-tokens/theme-values.css` i zostawić ślad źródła.

**Contract**: Nazwy zmiennych i blok `@theme inline` bez zmian w części kolorów. Nad `:root` krótki komentarz: źródło to motyw shadcn stone + amber wybrany 2026-09-29, wartości dosłownie z `theme-values.css`. Jedyna świadoma różnica względem pliku to `--radius: 0rem` zamiast `0` (jednostka potrzebna, żeby `calc()` dawał długość).

#### 2. Skala promieni

**File**: `src/styles/global.css` (`@theme inline`)

**Intent**: Pochodne promienie mają skalować się z `--radius`, żeby `0rem` dawało ostre rogi wszędzie, także w `Card` (`rounded-xl`).

**Contract**: Proporcjonalna skala, przy `0.625rem` identyczna z obecną (6/8/10/14px):

```css
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
```

#### 3. Metadane shadcn

**File**: `components.json`

**Intent**: Zgodność konfiguracji z faktyczną bazą palety dla przyszłych `shadcn add`.

**Contract**: `tailwind.baseColor: "stone"`.

### Success Criteria:

#### Automated Verification:

- `grep -n "oklch(0.555 0.163 48.998)" src/styles/global.css` znajduje `--primary` w `:root`
- `grep -n "calc(var(--radius) \* 1.4)" src/styles/global.css` znajduje proporcjonalne `--radius-xl`
- `grep -n "dark" src/layouts/Layout.astro` zwraca 0 linii
- Skan literałów zwraca 0 linii
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Przycisk główny jest bursztynowy z jasnym tekstem, a tło i karta białe z ciepłym obramowaniem: zrzut na desktopie i przy 375px
- Rogi karty, pól, przycisku i alertu są ostre (DevTools: obliczone `border-radius` = `0px`)
- Ekran główny i Topbar pasują do ekranów konta

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Stany, dostępność i kitchen sink

### Overview

Naprawiamy stan pending (C5), dostępność błędów pól i fokus. Dodajemy lokalną stronę `/dev/ui` z macierzą 7 stanów jako bramkę wizualną.

### Changes Required:

#### 1. Hook stanu wysyłki

**File**: `src/components/hooks/use-submit-pending.ts` (nowy)

**Intent**: Wspólny stan „formularz wysłany” dla formularzy z natywnym POST, zamiast `useFormStatus`.

**Contract**: `useSubmitPending(): { pending: boolean; markPending: () => void }`. Reset na `pageshow` z `persisted` (patrz Critical Implementation Details).

#### 2. Formularze i przycisk

**File**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SubmitButton.tsx`

**Intent**: Formularz wywołuje `markPending()` po udanej walidacji, a przycisk dostaje stan z propsa.

**Contract**: `SubmitButton` dostaje prop `pending: boolean` i przestaje importować `useFormStatus`. Przy `pending` przycisk jest `disabled`, pokazuje `Loader2` (`animate-spin`) i `pendingText`, a jego szerokość nie skacze.

#### 3. Dostępność pola

**File**: `src/components/auth/FormField.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Czytnik ekranu ogłasza błąd i podpowiedź powiązane z polem (C2).

**Contract**: `Input` z `aria-invalid={!!error}` i `aria-describedby` = `${id}-error` przy błędzie, `${id}-hint` przy podpowiedzi, inaczej brak. `hint` zmienia typ z `ReactNode` na `string`, a `FormField` sam renderuje podpowiedź (`text-muted-foreground`, z `id`). `SignUpForm` przekazuje tekst z `charactersLeft()`.

#### 4. Przełącznik hasła

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Widoczny fokus z `--ring` i tokenowy hover.

**Contract**: `Button variant="ghost" size="icon"` (mniejszy rozmiar przez klasy layoutu), pozycjonowany absolutnie jak dotąd. `aria-label` bez zmian.

#### 5. Kitchen sink

**File**: `src/pages/dev/ui.astro` (nowy)

**Intent**: Jedna strona z wszystkimi stanami komponentów ekranów konta do zrzutów i review, także przy S-02.

**Contract**: Na produkcji `404`: na początku frontmattera `if (!import.meta.env.DEV) return new Response(null, { status: 404 })`. Renderuje w `Layout` z podpisanymi sekcjami:

- `FormField`: default, error, z podpowiedzią;
- `SubmitButton`: default, `pending`;
- `Button disabled`;
- `ServerError` z przykładowym komunikatem;
- `Banner` we wszystkich 3 wariantach;
- `PasswordToggle`;
- link `text-primary`;
- `Card`;
- notatka „empty: N/A — formularze nie listują danych”.

Komponenty React z jawnym `client:load` (zgodnie z `CLAUDE.md`).

### Success Criteria:

#### Automated Verification:

- `grep -rn "useFormStatus" src` zwraca 0 linii
- Skan literałów rozszerzony o `src/pages/dev/ui.astro` zwraca 0 linii
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- `/dev/ui` zwraca 404 w buildzie produkcyjnym: `npm run preview` + `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/dev/ui` → `404`
- Smoke auth przechodzi (dev + Supabase z wyłączonym potwierdzaniem): `npm run smoke`

#### Manual Verification:

- `/dev/ui` pokazuje wszystkie 7 stanów (default, hover, focus-visible, disabled, error, loading, empty = N/A): zrzut na desktopie i przy 375px
- Tab przez `/auth/signup`: widoczny pierścień `--ring` na każdym polu, przełączniku hasła, przycisku i linku
- Poprawne dane + „Zaloguj się”: przycisk pokazuje „Logowanie...” i jest zablokowany do przekierowania. Błędne dane + Wstecz: przycisk nie jest zablokowany
- DevTools → Accessibility: pole z błędem ma `aria-invalid=true`, a opis wskazuje tekst błędu
- Kontrast w jasnym motywie ≥ 4.5:1 dla `primary-foreground` na `primary`, `muted-foreground` na `background`/`card` i tekstu `destructive` na `destructive/10`. Wynik zapisany w notatce fazy

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Guard — reguła ESLint i blok UI w CLAUDE.md

### Overview

Kontrakt musi przetrwać następną sesję: commit z literałem koloru w widoku ma nie przejść, a agent ma wiedzieć, gdzie szukać tokenów i komponentów.

### Changes Required:

#### 1. Reguła ESLint

**File**: `eslint.config.js`

**Intent**: Blokować literały kolorów, klasy palety Tailwind i wartości arbitralne w klasach widoków.

**Contract**: Nowy obiekt konfiguracji dla `src/pages/**/*.{astro,tsx}`, `src/components/**/*.{astro,tsx}` i `src/layouts/**/*.astro` z `ignores: ["src/components/ui/**"]`. Reguła `no-restricted-syntax` z selektorami na `Literal` i `TemplateElement` wewnątrz `JSXAttribute` o nazwie `class`/`className`/`class:list` oraz wewnątrz argumentów wywołań `cn()`. Wzorzec taki sam jak w skanie literałów (bez `/`), a komunikat po polsku wskazuje tokeny i `src/components/ui/`. Nie może kolidować z istniejącą konfiguracją `astroConfig` (osobny obiekt, bez nadpisywania innych reguł).

#### 2. Blok UI w regułach agenta

**File**: `CLAUDE.md`

**Intent**: Powiedzieć następnemu agentowi, gdzie jest kontrakt i co jest zakazane.

**Contract**: Nowa sekcja `## UI` (poza `Key conventions`, bez bloku 10x-cli). Treść:

- wartości w `src/styles/global.css` (`:root`/`.dark`, publikowane przez `@theme inline`); nowe kolory tylko jako role, nigdy surowe wartości w `@theme inline`;
- komponenty w `src/components/ui/` — sprawdź przed stworzeniem nowego, brakujące dodawaj przez `npx shadcn@latest add`;
- bez literałów kolorów, klas palety Tailwind i wartości arbitralnych w widokach; egzekwuje to ESLint;
- nie nadpisuj kolorów komponentów `ui` przez `className`;
- `/dev/ui` to kitchen sink stanów, rozszerzaj go przy nowym komponencie formularza.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi na czystym drzewie: `npm run lint`
- Próba: tymczasowy `className="bg-purple-600"` w pliku `src/components/auth/*.tsx` oraz `class="text-blue-200"` w `src/pages/auth/*.astro` dają błąd `no-restricted-syntax` w `npm run lint`. Po próbie cofnięte
- Próba: ten sam literał w `src/components/ui/button.tsx` nie daje błędu (wyjątek działa). Po próbie cofnięte
- `grep -n "## UI" CLAUDE.md` znajduje sekcję

#### Manual Verification:

- Blok UI w `CLAUDE.md` jest krótki, jednoznaczny i wskazuje ścieżki, które istnieją
- Komunikat błędu ESLint jest zrozumiały i mówi, czego użyć zamiast literału

---

## Phase 5: Styl shadcn lyra zamiast new-york

### Overview

Dodane po fazie 2 na prośbę użytkownika. Przełączamy styl komponentów z `new-york` na `lyra` i przegenerowujemy komponenty `ui`, żeby wizualnie pasowały do ostrych rogów i palety stone + amber. Faza jest ostatnia, bo dotyka wygenerowanych plików `ui`, a fazy 3–4 z nich tylko korzystają (bez edycji plików `ui`). Po niej wracają bramki skanu literałów, lintu i buildu.

### Changes Required:

#### 1. Metadane shadcn

**File**: `components.json`

**Intent**: Nowe `shadcn add` mają generować styl lyra.

**Contract**: `style: "lyra"`. Reszta pól bez zmian (`baseColor: "stone"` z fazy 2). Jeśli CLI wymaga innego zapisu stylu lub dodatkowych pól (np. czcionka), użyj tego, co podaje `npx shadcn@latest --help` / dokumentacja lyra, i odnotuj różnicę.

#### 2. Przegenerowanie komponentów

**File**: `src/components/ui/{button,input,label,card,alert}.tsx`

**Intent**: Komponenty w stylu lyra zamiast new-york.

**Contract**: `npx shadcn@latest add button input label card alert --overwrite`. Plików nie edytujemy ręcznie. Po `add` sprawdź `git diff src/styles/global.css package.json`: zmiany od CLI wykraczające poza styl (kolory, `--radius`, nowe zmienne) cofnij, wartości palety zostają z fazy 2. Jeśli lyra wymaga czcionki lub zmiennej w `global.css`, dodaj tylko to i opisz w notatce fazy.

#### 3. Reguła w CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Reguła shadcn nie może wskazywać nieaktualnego stylu.

**Contract**: W punkcie `shadcn/ui` w `Key conventions` zamiast `"new-york" style variant` wpisz `"lyra" style variant`.

#### 4. Dopasowanie widoków

**File**: `src/components/auth/*.tsx`, `src/components/*.astro`, `src/pages/**/*.astro`

**Intent**: Widoki działają z nowymi komponentami bez literałów koloru.

**Contract**: Tylko poprawki wymuszone zmianą API/klas komponentów (np. rozmiary, warianty). Bez nowych nadpisań kolorów przez `className`.

### Success Criteria:

#### Automated Verification:

- `grep -n '"style"' components.json` pokazuje `lyra`
- `grep -rn "new-york" components.json CLAUDE.md src` zwraca 0 linii
- Skan literałów zwraca 0 linii (dla `src/pages/dev/ui.astro` także)
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke auth przechodzi: `npm run smoke`

#### Manual Verification:

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/` i `/dev/ui` wyglądają spójnie w stylu lyra: zrzut na desktopie i przy 375px
- Fokus, disabled, error i pending nadal działają (regresja względem fazy 3)
- Rogi nadal ostre (`border-radius` = `0px`)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów jednostkowych w repo. Nie dodajemy go w tej zmianie. Logika hooka jest trywialna i weryfikowana ręcznie (pending + bfcache).

### Integration Tests:

- `npm run smoke`: pełny przepływ auth przez HTTP po zmianach formularzy (faza 3).

### Manual Testing Steps:

1. Po fazach 1–3: zrzuty `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/` (i `/dev/ui` od fazy 3) na desktopie i przy 375px.
2. Klawiatura: Tab przez formularz rejestracji, fokus widoczny na każdym kontrolu.
3. Pending: wysyłka poprawnego formularza, potem Wstecz po błędzie.
4. Kontrast kluczowych par tokenów w jasnym motywie.

## Performance Considerations

Brak istotnych. Usunięcie `backdrop-blur-xl` i gradientu nieco odciąża rendering.

## Migration Notes

Brak danych do migracji. Rollback to revert commitów fazy. Po wdrożeniu na `main` (auto-deploy) użytkownicy produkcji zobaczą jasny motyw.

## References

- Research i zarzuty: `context/changes/theme-and-auth-tokens/research.md`
- Wartości motywu: `context/changes/theme-and-auth-tokens/theme-values.css`
- Poprzednia zmiana powłoki auth: `context/archive/2026-09-29-polish-auth-shell/plan.md`
- Tokeny: `src/styles/global.css:6-111`
- Bazowy przycisk: `src/components/ui/button.tsx:7-33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komponenty shadcn i widoki na istniejących tokenach

#### Automated

- [x] 1.1 Pliki komponentów istnieją: `ls src/components/ui/{input,label,card,alert}.tsx` — 1b59228
- [x] 1.2 Skan literałów (Critical Implementation Details) zwraca 0 linii — 1b59228
- [x] 1.3 `bg-cosmic` nie występuje: `grep -rn "bg-cosmic" src` zwraca 0 linii — 1b59228
- [x] 1.4 Lint przechodzi: `npm run lint` — 1b59228
- [x] 1.5 Build przechodzi: `npm run build` — 1b59228

#### Manual

- [x] 1.6 `/auth/signin`, `/auth/signup`, `/auth/confirm-email` i `/` renderują się jasno i czytelnie: zrzut na desktopie i przy 375px — 1b59228
- [x] 1.7 Logowanie z błędnym hasłem pokazuje komunikat w `Alert` destructive, a błędy pól są czerwone (`destructive`) — 1b59228
- [x] 1.8 `git diff src/styles/global.css` zawiera tylko usunięcie `bg-cosmic`, bez zmian od `shadcn add` — 1b59228

### Phase 2: Wartości palety (stone + amber, ostre rogi)

#### Automated

- [x] 2.1 `grep -n "oklch(0.555 0.163 48.998)" src/styles/global.css` znajduje `--primary` w `:root` — 475128e
- [x] 2.2 `grep -n "calc(var(--radius) \* 1.4)" src/styles/global.css` znajduje proporcjonalne `--radius-xl` — 475128e
- [x] 2.3 `grep -n "dark" src/layouts/Layout.astro` zwraca 0 linii — 475128e
- [x] 2.4 Skan literałów zwraca 0 linii — 475128e
- [x] 2.5 Lint przechodzi: `npm run lint` — 475128e
- [x] 2.6 Build przechodzi: `npm run build` — 475128e

#### Manual

- [x] 2.7 Przycisk główny jest bursztynowy z jasnym tekstem, a tło i karta białe z ciepłym obramowaniem: zrzut na desktopie i przy 375px — 475128e
- [x] 2.8 Rogi karty, pól, przycisku i alertu są ostre (DevTools: obliczone `border-radius` = `0px`) — 475128e
- [x] 2.9 Ekran główny i Topbar pasują do ekranów konta — 475128e

### Phase 3: Stany, dostępność i kitchen sink

#### Automated

- [x] 3.1 `grep -rn "useFormStatus" src` zwraca 0 linii — c1a339e
- [x] 3.2 Skan literałów rozszerzony o `src/pages/dev/ui.astro` zwraca 0 linii — c1a339e
- [x] 3.3 Lint przechodzi: `npm run lint` — c1a339e
- [x] 3.4 Build przechodzi: `npm run build` — c1a339e
- [x] 3.5 `/dev/ui` zwraca 404 w buildzie produkcyjnym: `npm run preview` + `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/dev/ui` → `404` — c1a339e
- [x] 3.6 Smoke auth przechodzi (dev + Supabase z wyłączonym potwierdzaniem): `npm run smoke` — c1a339e

#### Manual

- [x] 3.7 `/dev/ui` pokazuje wszystkie 7 stanów (default, hover, focus-visible, disabled, error, loading, empty = N/A): zrzut na desktopie i przy 375px — c1a339e
- [x] 3.8 Tab przez `/auth/signup`: widoczny pierścień `--ring` na każdym polu, przełączniku hasła, przycisku i linku — c1a339e
- [x] 3.9 Poprawne dane + „Zaloguj się”: przycisk pokazuje „Logowanie...” i jest zablokowany do przekierowania. Błędne dane + Wstecz: przycisk nie jest zablokowany — c1a339e
- [x] 3.10 DevTools → Accessibility: pole z błędem ma `aria-invalid=true`, a opis wskazuje tekst błędu — c1a339e
- [x] 3.11 Kontrast w jasnym motywie ≥ 4.5:1 dla `primary-foreground` na `primary`, `muted-foreground` na `background`/`card` i tekstu `destructive` na `destructive/10`. Wynik zapisany w notatce fazy — c1a339e

### Phase 4: Guard — reguła ESLint i blok UI w CLAUDE.md

#### Automated

- [x] 4.1 Lint przechodzi na czystym drzewie: `npm run lint` — 65d4c9d
- [x] 4.2 Próba: tymczasowy `className="bg-purple-600"` w pliku `src/components/auth/*.tsx` oraz `class="text-blue-200"` w `src/pages/auth/*.astro` dają błąd `no-restricted-syntax` w `npm run lint`. Po próbie cofnięte — 65d4c9d
- [x] 4.3 Próba: ten sam literał w `src/components/ui/button.tsx` nie daje błędu (wyjątek działa). Po próbie cofnięte — 65d4c9d
- [x] 4.4 `grep -n "## UI" CLAUDE.md` znajduje sekcję — 65d4c9d

#### Manual

- [x] 4.5 Blok UI w `CLAUDE.md` jest krótki, jednoznaczny i wskazuje ścieżki, które istnieją — 65d4c9d
- [x] 4.6 Komunikat błędu ESLint jest zrozumiały i mówi, czego użyć zamiast literału — 65d4c9d

### Phase 5: Styl shadcn lyra zamiast new-york

#### Automated

- [x] 5.1 `grep -n '"style"' components.json` pokazuje `lyra`
- [x] 5.2 `grep -rn "new-york" components.json CLAUDE.md src` zwraca 0 linii
- [x] 5.3 Skan literałów zwraca 0 linii (dla `src/pages/dev/ui.astro` także)
- [x] 5.4 Lint przechodzi: `npm run lint`
- [x] 5.5 Build przechodzi: `npm run build`
- [x] 5.6 Smoke auth przechodzi: `npm run smoke`

#### Manual

- [x] 5.7 `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/` i `/dev/ui` wyglądają spójnie w stylu lyra: zrzut na desktopie i przy 375px
- [x] 5.8 Fokus, disabled, error i pending nadal działają (regresja względem fazy 3)
- [x] 5.9 Rogi nadal ostre (`border-radius` = `0px`)
