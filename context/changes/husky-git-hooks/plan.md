# Aktywacja husky: pre-commit i pre-push — plan implementacji

## Overview

Husky i lint-staged są zainstalowane, ale git ich nie uruchamia, więc lokalna bramka commita z `test-plan.md` §5 istnieje tylko na papierze. Włączamy husky skryptem `prepare`, rozszerzamy pre-commit o pliki JS i `astro check`, dodajemy pre-push z `npm test` i opisujemy bramki w dokumentacji.

## Current State Analysis

- `husky@9.1.7` i `lint-staged` są w devDependencies (`package.json`), a `.husky/pre-commit` zawiera `npx lint-staged`. W `package.json` nie ma jednak skryptu `prepare`, a `git config core.hooksPath` jest puste. Git nie wywołuje więc żadnego hooka z `.husky/`.
- Konfiguracja lint-staged (`package.json`, klucz `lint-staged`): `*.{ts,tsx,astro}` → `eslint --fix` oraz `*.{json,css,md}` → `prettier --write`. Pliki `js/jsx/mjs` (np. `scripts/smoke.mjs`, `eslint.config.js`, `astro.config.mjs`) nie przechodzą przez lint przy commicie.
- ESLint ma `eslint-plugin-prettier` (`eslint.config.js`, ostatni element konfiguracji), więc `eslint --fix` formatuje także kod. Osobne wywołanie prettiera na plikach kodu byłoby zbędne.
- Brak `.husky/pre-push`.
- Pomiar lokalny: `astro check` trwa ok. 4,8 s, `npm test` ok. 5,2 s (oba na całym projekcie).
- `.claude/hooks/end-of-turn.sh:8` zakłada, że „the commit gate catches the rest”, a `test-plan.md:107` deklaruje „local (lint-staged)” — oba odwołują się do bramki, która dziś nie działa.
- CI (`.github/workflows/ci.yml`) robi `npm ci` w jobach `checks`, `integration` i `deploy`. Po dodaniu `prepare` uruchomi to `husky`, który w CI tylko ustawia `core.hooksPath` i kończy się sukcesem.

## Desired End State

Po `npm install` (lub `npm ci`) git w świeżym klonie korzysta z hooków z `.husky/`:

- **pre-commit:** `npx lint-staged` (eslint `--fix` na zastagowanych `*.{js,jsx,mjs,ts,tsx,astro}`, prettier na `*.{json,css,md}`), a potem `npx astro check` na całym projekcie. Błąd na którymkolwiek kroku odrzuca commit.
- **pre-push:** `npm test`. Padający test jednostkowy odrzuca push.

`test-plan.md` §5, README i CLAUDE.md opisują te bramki zgodnie ze stanem faktycznym.

### Key Discoveries:

- Brak `prepare` w `package.json` to jedyny powód, dla którego `.husky/pre-commit` nie działa (`git config core.hooksPath` → pusty wynik).
- `eslint-plugin-prettier` w `eslint.config.js` sprawia, że „prettier” dla plików kodu realizuje `eslint --fix`.
- `end-of-turn.sh` lintuje także `*.cjs`, ale notatki zmiany wymieniają tylko `js/jsx/mjs/ts/tsx/astro`. Trzymamy się notatek: w repo nie ma plików `.cjs`.

## What We're NOT Doing

- Uruchamianie `astro check` warunkowo, tylko gdy commit zawiera kod (przez `lint-staged.config.mjs`). Decyzja: zawsze, w `.husky/pre-commit`.
- `HUSKY=0` ani żadne inne zmiany w `.github/workflows/ci.yml`.
- Automatyczny test git hooków (np. w `scripts/__tests__`). Dowód działania jest ręczny, w Fazie 1.
- `npm run test:integration` w pre-push: wymaga lokalnego Supabase i zostaje w CI.
- Osobny `prettier --write` dla plików kodu (pokrywa go `eslint --fix`).
- Zmiany w hookach agenta (`.claude/hooks/`).

## Implementation Approach

Konfiguracja zostaje w `package.json` i `.husky/`. Najpierw włączamy i rozszerzamy hooki, potem udowadniamy ręcznie, że każdy rodzaj błędu blokuje commit lub push. Dopiero gdy działają, aktualizujemy dokumenty.

## Critical Implementation Details

- **pre-commit sprawdza drzewo robocze, nie stan zastagowany:** `astro check` widzi cały katalog roboczy, więc błąd typu w niezastagowanym pliku też zablokuje commit. To świadoma konsekwencja decyzji „zawsze w `.husky/pre-commit`” i trzeba ją opisać w README. Obejście w razie potrzeby to `git commit --no-verify`.
- **Commity z IDE i nvm:** node pochodzi z nvm (`~/.nvm/versions/node/v24.21.0`). Jeśli GUI WebStorma nie widzi `npx`, husky 9 wczytuje `~/.config/husky/init.sh`, gdzie można załadować nvm. Wystarczy wzmianka w README, bez zmian w repo.

## Phase 1: Aktywacja git hooków

### Overview

Włączyć husky, rozszerzyć pre-commit i dodać pre-push, a następnie ręcznie udowodnić, że każdy hook blokuje błędną zmianę.

### Changes Required:

#### 1. Skrypt `prepare` i globy lint-staged

**File**: `package.json`

**Intent**: Dodać `prepare`, żeby `npm install` i `npm ci` instalowały hooki, oraz objąć ESLintem przy commicie także pliki JS.

**Contract**: `scripts.prepare = "husky"`. Klucz `lint-staged`: glob `*.{ts,tsx,astro}` zmienia się na `*.{js,jsx,mjs,ts,tsx,astro}` → `["eslint --fix"]`. Wpis `*.{json,css,md}` → `["prettier --write"]` bez zmian.

#### 2. Hook pre-commit

**File**: `.husky/pre-commit`

**Intent**: Po lint-staged uruchomić `astro check` na całym projekcie, żeby błędy typów nie trafiały do commita.

**Contract**: Dwie linie: `npx lint-staged`, potem `npx astro check`. Husky 9 uruchamia skrypt z `sh -e`, więc błąd pierwszej komendy przerywa hook. Plik zostaje wykonywalny.

#### 3. Hook pre-push

**File**: `.husky/pre-push` (nowy)

**Intent**: Uruchamiać testy jednostkowe przed wysłaniem zmian na zdalne repo.

**Contract**: Jedna linia `npm test`, plik wykonywalny (`chmod +x`), format jak `.husky/pre-commit` (bez shebanga, styl husky 9).

#### 4. Instalacja hooków lokalnie

**Intent**: Uruchomić `npm run prepare` raz w bieżącym klonie, żeby ręczna weryfikacja działała na prawdziwym gicie.

**Contract**: Po wykonaniu `git config core.hooksPath` zwraca `.husky/_`. Katalog `.husky/_` generuje husky i ma on własny `.gitignore`, więc nic nie trafia do commita.

### Success Criteria:

#### Automated Verification:

- `npm run prepare` kończy się kodem 0
- `git config core.hooksPath` zwraca `.husky/_`
- `.husky/pre-push` istnieje i jest wykonywalny (`test -x .husky/pre-push`)
- `npm run lint` przechodzi
- `npm test` przechodzi

#### Manual Verification:

- Commit zastagowanego pliku `.mjs` z błędem ESLint (np. nieużyta zmienna) jest odrzucony przez lint-staged
- Commit pliku `.ts` z błędem typu, którego ESLint nie zgłasza (np. `const x: number = "a"`), jest odrzucony przez `astro check`
- `git push --dry-run` z padającym testem jednostkowym jest odrzucony przez pre-push
- Poprawny commit przechodzi: lint-staged, potem `astro check`, w kilka sekund

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie. Pliki próbne usuń, a commity próbne wycofaj przed commitem fazy.

---

## Phase 2: Dokumentacja bramek

### Overview

Opisać działające git hooki w `test-plan.md` §5, README i CLAUDE.md.

### Changes Required:

#### 1. Test plan §5

**File**: `context/foundation/test-plan.md`

**Intent**: Uzgodnić tabelę Quality Gates ze stanem faktycznym: lokalne bramki to git hooki husky, a unit uruchamia się także przed pushem.

**Contract**: W §5 wiersz „lint + astro check” w kolumnie Where ma wartość `local git pre-commit (husky: lint-staged + astro check) + CI`. Wiersz „unit (`npm test`)” w kolumnie Where ma wartość `local git pre-push (husky) + CI na PR i przed deploy`. Pole `Last updated` w nagłówku dostaje datę zmiany.

#### 2. README

**File**: `README.md`

**Intent**: Opisać git hooki obok akapitu o hookach agenta pod „Available Scripts”.

**Contract**: Nowy akapit: `npm install` instaluje hooki (skrypt `prepare`). pre-commit uruchamia lint-staged (eslint `--fix` na `js/jsx/mjs/ts/tsx/astro`, prettier na `json/css/md`) i `astro check` na całym drzewie roboczym, także niezastagowanym. pre-push uruchamia `npm test`. Obejście: `--no-verify`. Dla commitów z IDE przy nvm: `~/.config/husky/init.sh`.

#### 3. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Uaktualnić odnośnik w sekcji References, który mówi dziś tylko o pre-commit.

**Contract**: Linia `Scripts and pre-commit hooks (husky + lint-staged): @package.json` wymienia pre-commit (lint-staged + astro check) i pre-push (`npm test`) oraz katalog `.husky/`.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/test-plan.md README.md CLAUDE.md` przechodzi

#### Manual Verification:

- Wiersze §5 w `test-plan.md` zgadzają się z treścią `.husky/pre-commit` i `.husky/pre-push`
- Akapit README opisuje wszystkie trzy elementy: instalację przez `prepare`, sprawdzanie całego drzewa przez `astro check` i `--no-verify`

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów. Decyzja: hooki dowodzimy ręcznie, bo test uruchamiający git i `astro check` w tymczasowym repo byłby wolny i kruchy jak na kilka linii konfiguracji.

### Integration Tests:

- Bez zmian. `npm run test:integration` zostaje w CI.

### Manual Testing Steps:

1. Na branchu `feat/husky-git-hooks` dodaj `scripts/tmp-lint.mjs` z nieużytą zmienną, zastaguj, `git commit` → odrzucony przez eslint. Usuń plik.
2. Dodaj `src/lib/tmp-type.ts` z `const x: number = "a"; export { x };`, zastaguj, `git commit` → lint-staged przechodzi, `astro check` odrzuca. Usuń plik.
3. Dodaj padający test w `src/lib/tmp.test.ts`, `git commit --no-verify`, `git push --dry-run` → pre-push odrzuca. Wycofaj commit (`git reset --hard HEAD~1`) i upewnij się, że plik zniknął.
4. Zwykły commit zmian fazy przechodzi przez oba kroki pre-commita.

## Performance Considerations

Pre-commit kosztuje ok. 5 s (`astro check`) plus czas ESLinta na zastagowanych plikach, a pre-push ok. 5 s. To akceptowalne. `astro check` uruchamia się także przy commitach samej dokumentacji, co jest świadomym wyborem.

## Migration Notes

Istniejące klony dostają hooki po najbliższym `npm install`. Do tego czasu git ich nie uruchamia.

## References

- Notatki zmiany: `context/changes/husky-git-hooks/change.md`
- Poprzednia zmiana (hooki agenta, husky poza zakresem): `context/archive/2026-10-20-testing-quality-gates/plan.md:66`
- Bramki: `context/foundation/test-plan.md:103-111`
- Założenie o bramce commita: `.claude/hooks/end-of-turn.sh:8`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Aktywacja git hooków

#### Automated

- [x] 1.1 `npm run prepare` kończy się kodem 0
- [x] 1.2 `git config core.hooksPath` zwraca `.husky/_`
- [x] 1.3 `.husky/pre-push` istnieje i jest wykonywalny (`test -x .husky/pre-push`)
- [x] 1.4 `npm run lint` przechodzi
- [x] 1.5 `npm test` przechodzi

#### Manual

- [x] 1.6 Commit zastagowanego pliku `.mjs` z błędem ESLint (np. nieużyta zmienna) jest odrzucony przez lint-staged
- [x] 1.7 Commit pliku `.ts` z błędem typu, którego ESLint nie zgłasza (np. `const x: number = "a"`), jest odrzucony przez `astro check`
- [x] 1.8 `git push --dry-run` z padającym testem jednostkowym jest odrzucony przez pre-push
- [ ] 1.9 Poprawny commit przechodzi: lint-staged, potem `astro check`, w kilka sekund

### Phase 2: Dokumentacja bramek

#### Automated

- [ ] 2.1 `npx prettier --check context/foundation/test-plan.md README.md CLAUDE.md` przechodzi

#### Manual

- [ ] 2.2 Wiersze §5 w `test-plan.md` zgadzają się z treścią `.husky/pre-commit` i `.husky/pre-push`
- [ ] 2.3 Akapit README opisuje wszystkie trzy elementy: instalację przez `prepare`, sprawdzanie całego drzewa przez `astro check` i `--no-verify`
