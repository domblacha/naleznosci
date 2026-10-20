# Rebrand na Należności — Implementation Plan

## Overview

Repo wciąż nosi ślady szablonu 10x Astro Starter: nazwę paczki, faviconę 10x, link w banerze Supabase prowadzący do repo startera oraz README opisujące starter. Plan usuwa te ślady i opisuje aplikację jako Należności — narzędzie do eskalacji przeterminowanych faktur dla jednoosobowej działalności.

## Current State Analysis

`git grep -i -E '10x|astro-starter|przeprogramowani|starter|template\.png|favicon'` poza `context/` i `.claude/skills/` znajduje wyłącznie:

- `src/lib/config-status.ts:16` — `docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration"`.
- `src/layouts/Layout.astro:18` — `<link rel="icon" type="image/png" href="/favicon.png" />`; `public/favicon.png` to ikona 10x (PNG 32×32).
- `package.json:2` i `package-lock.json:2,8` — `"name": "10x-astro-starter"`.
- `README.md:1` (tytuł), `:3` (`![](./public/template.png)`), `:5` (opis startera), `:26–27` (`git clone`/`cd` startera), `:254` (notatka o smoke teście „guard the development of the starter itself”), oraz końcowa sekcja `## License` (MIT) bez pliku `LICENSE` w repo.

Pozostałe elementy są już przemianowane: `wrangler.jsonc` ma Worker `naleznosci`, domyślny `<title>` w `Layout.astro:9` to „Należności”, `origin` wskazuje `https://github.com/domblacha/naleznosci.git`.

## Desired End State

- Ten sam `git grep` (poza `context/`, `.claude/skills/` i `package-lock.json`) nie zwraca żadnych trafień dotyczących startera; w `package-lock.json` nazwa to `naleznosci`.
- Karta przeglądarki pokazuje faviconę SVG: zaokrąglony kwadrat w kolorze primary z białą literą „N”.
- Baner „Supabase nie jest skonfigurowany” linkuje do `https://github.com/domblacha/naleznosci#supabase-configuration`.
- README zaczyna się od `# Należności`, opisuje aplikację, a instrukcje klonowania wskazują repo `domblacha/naleznosci`.

### Key Discoveries:

- `--primary: oklch(0.555 0.163 48.998)` w `src/styles/global.css:19` ≈ `#bb4d00`; `--primary-foreground` ≈ `#fffbeb` — favicona używa tych przeliczeń (SVG w `public/` nie przechodzi przez tokeny Tailwinda ani regułę ESLint o literałach kolorów, która dotyczy widoków).
- Żaden test nie sprawdza `docsUrl` ani ścieżki favicony — zmiana nie wymaga aktualizacji testów.
- Repo `domblacha/naleznosci` jest prywatne: link z banera otworzy się tylko osobom z dostępem. Akceptowalne — baner pojawia się wyłącznie przy brakującej konfiguracji, czyli u dewelopera.
- Opis aplikacji do README bazuje na `context/foundation/prd.md` („Vision & Problem Statement”).

## What We're NOT Doing

- Nie ruszamy `.claude/skills/10x-*` ani `context/` (narzędzia kursu i archiwum zmian).
- Nie dodajemy pliku `LICENSE` — sekcja licencji znika z README.
- Nie generujemy dodatkowych formatów ikon (`apple-touch-icon`, `favicon.ico`, manifest PWA).
- Nie tłumaczymy README na polski — zostaje po angielsku, jak obecnie (sekcja „Migracje” bez zmian).
- Nie zmieniamy treści banera ani logiki `config-status.ts` poza URL-em.

## Implementation Approach

Dwie fazy: najpierw kod i zasoby (weryfikowane lintem, `astro check`, testami i buildem), potem dokumentacja z końcowym `git grep` jako bramką kompletności.

## Phase 1: Kod i zasoby

### Overview

Podmiana linku w banerze, nowa favicona SVG zamiast PNG 10x, nowa nazwa paczki.

### Changes Required:

#### 1. Link w banerze Supabase

**File**: `src/lib/config-status.ts`

**Intent**: Baner konfiguracji ma prowadzić do README tej aplikacji, nie startera.

**Contract**: `docsUrl` wpisu „Supabase” = `"https://github.com/domblacha/naleznosci#supabase-configuration"` (kotwica istnieje w README jako `## Supabase Configuration`).

#### 2. Favicona SVG

**File**: `public/favicon.svg` (nowy), `public/favicon.png` (usunięty)

**Intent**: Prosta, czytelna w 16px ikona w kolorze aplikacji zamiast logo 10x.

**Contract**: `viewBox="0 0 32 32"`; `<rect>` 32×32 z `rx="6"` i `fill="#bb4d00"`; litera „N” narysowana ścieżką (`<path>`, bez `<text>`/fontu) w `#fffbeb`, wyśrodkowana z marginesem ~8 jednostek. Bez `@media` w SVG.

#### 3. Link do favicony w layoucie

**File**: `src/layouts/Layout.astro`

**Intent**: Wskazać nowy plik.

**Contract**: linia 18 → `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

#### 4. Nazwa paczki

**File**: `package.json`, `package-lock.json`

**Intent**: Nazwa projektu zgodna z aplikacją.

**Contract**: `"name": "naleznosci"` w `package.json`; `package-lock.json` odświeżony przez `npm install` (obie wystąpienia `name` na `naleznosci`, bez innych zmian w drzewie zależności — jeśli diff locka zawiera coś więcej niż nazwę, cofnij i popraw tylko te dwa pola).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi i zawiera faviconę: `npm run build && test -f dist/client/favicon.svg && test ! -e dist/client/favicon.png`
- Diff `package-lock.json` zmienia wyłącznie pole `name`: `git diff package-lock.json`

#### Manual Verification:

- Po `npm run dev` karta przeglądarki pokazuje pomarańczową ikonę z białym „N” (czytelną w rozmiarze karty)
- Po tymczasowym usunięciu `SUPABASE_KEY` z `.dev.vars` link w banerze prowadzi do `github.com/domblacha/naleznosci#supabase-configuration` (przywróć klucz i ubij dev server po sprawdzeniu)

**Implementation Note**: Po fazie i zielonych sprawdzeniach automatycznych zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: README

### Overview

README opisuje Należności zamiast startera.

### Changes Required:

#### 1. Nagłówek i opis

**File**: `README.md`, `public/template.png` (usunięty)

**Intent**: Pierwsze linie mówią, czym jest aplikacja.

**Contract**: tytuł `# Należności`; usunięty obrazek `![](./public/template.png)` i plik `public/template.png`; zamiast „A modern, opinionated starter template…” 2–3 zdania po angielsku na podstawie PRD: aplikacja dla jednoosobowej działalności, śledzi przeterminowane faktury, eskaluje je według konfigurowalnych progów dni po terminie, wylicza odsetki ustawowe i rekompensatę, generuje jedno zbiorcze ponaglenie na klienta.

#### 2. Getting Started

**File**: `README.md`

**Intent**: Instrukcje klonowania wskazują to repo.

**Contract**: `git clone https://github.com/domblacha/naleznosci.git` i `cd naleznosci`.

#### 3. Notatka o smoke teście

**File**: `README.md` (sekcja `## Smoke test`)

**Intent**: Zachować wskazówkę, kiedy uruchamiać smoke i że nie zastępuje testów, bez odwołań do startera.

**Contract**: blok `> **Note:**` przeredagowany: smoke to szybki test regresji przepływu auth i głównych kroków aplikacji po aktualizacjach zależności lub zmianach adaptera Cloudflare; uzupełnia `npm test` i `npm run test:integration`, nie zastępuje ich.

#### 4. Licencja

**File**: `README.md`

**Intent**: Nie deklarować licencji, której nikt świadomie nie wybrał dla prywatnej aplikacji.

**Contract**: usunięta sekcja `## License` wraz z treścią „MIT”.

### Success Criteria:

#### Automated Verification:

- Brak śladów startera: `git grep -nI -i -E '10x|astro-starter|przeprogramowani|starter|template\.png|favicon\.png' -- ':!context' ':!.claude/skills'` nie zwraca trafień
- Brak sekcji licencji: `! grep -n '^## License' README.md`
- Formatowanie README: `npx prettier --check README.md`

#### Manual Verification:

- README czyta się jako dokumentacja Należności: tytuł, opis i Getting Started są spójne, a kotwica `#supabase-configuration` nadal działa na GitHubie

**Implementation Note**: Po fazie i zielonych sprawdzeniach automatycznych zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak nowych — zmiana nie dotyka logiki; istniejący `npm test` pilnuje regresji.

### Manual Testing Steps:

1. `npm run dev`, otworzyć `/auth/signin` i sprawdzić faviconę w karcie.
2. Bez `SUPABASE_KEY` sprawdzić href linku w banerze.
3. Przejrzeć wyrenderowane README na GitHubie po pushu brancha.

## References

- Change identity: `context/changes/rebrand-naleznosci/change.md`
- Opis produktu: `context/foundation/prd.md` („Vision & Problem Statement”)
- Kolor primary: `src/styles/global.css:19`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kod i zasoby

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Typy przechodzą: `npx astro check`
- [x] 1.3 Testy jednostkowe przechodzą: `npm test`
- [x] 1.4 Build przechodzi i zawiera faviconę: `npm run build && test -f dist/client/favicon.svg && test ! -e dist/client/favicon.png`
- [x] 1.5 Diff `package-lock.json` zmienia wyłącznie pole `name`: `git diff package-lock.json`

#### Manual

- [x] 1.6 Po `npm run dev` karta przeglądarki pokazuje pomarańczową ikonę z białym „N” (czytelną w rozmiarze karty)
- [x] 1.7 Po tymczasowym usunięciu `SUPABASE_KEY` z `.dev.vars` link w banerze prowadzi do `github.com/domblacha/naleznosci#supabase-configuration` (przywróć klucz i ubij dev server po sprawdzeniu)

### Phase 2: README

#### Automated

- [ ] 2.1 Brak śladów startera: `git grep -nI -i -E '10x|astro-starter|przeprogramowani|starter|template\.png|favicon\.png' -- ':!context' ':!.claude/skills'` nie zwraca trafień
- [ ] 2.2 Brak sekcji licencji: `! grep -n '^## License' README.md`
- [ ] 2.3 Formatowanie README: `npx prettier --check README.md`

#### Manual

- [ ] 2.4 README czyta się jako dokumentacja Należności: tytuł, opis i Getting Started są spójne, a kotwica `#supabase-configuration` nadal działa na GitHubie
