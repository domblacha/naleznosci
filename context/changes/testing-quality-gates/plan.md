# Bramki jakości — testy integracyjne w CI i hooki agenta — Implementation Plan

## Overview

Faza 3 test-planu (`context/foundation/test-plan.md` §3, §5). Testy integracyjne
(Vitest + lokalny Supabase) zaczynają biec w CI na każdym PR i na push do `main`
jako osobny job `integration`, od którego zależy `deploy` — czerwony test ryzyk
#4–#6 zatrzymuje wdrożenie, a nie tylko zostaje zalogowany. `npm test` pozostaje
wymaganą bramką. Agent dostaje szybki sygnał w pętli edycji przez hooki Claude
Code (`PostToolUse` + `Stop`) wygenerowane i udowodnione skillem
`/10x-configure-hook`.

## Current State Analysis

- Job `checks` (`.github/workflows/ci.yml:12-26`) biegnie na `pull_request` i push
  na `main`; uruchamia `npm test` (`:25`), nie uruchamia Supabase ani
  `npm run test:integration`. `deploy` ma `needs: checks` (`:29`).
- Zestaw integracyjny jest gotowy na CI bez zmian w kodzie testów:
  `global-setup.ts:32-53` bierze env z `process.env` albo z
  `npx supabase status -o env`, `:56-68` odmawia hosta innego niż localhost,
  `setup.ts:4-7` mockuje `@/lib/supabase` (brak `astro:env`, brak `.env`).
- `supabase start` stosuje migracje z `supabase/migrations/` na świeżej bazie.
  `config.toml:60-65` wskazuje seed `./seed.sql`, którego nie ma w repo.
- Kontrakt `it.fails` (`src/lib/services/db-gaps.int.test.ts:52, 57, 67, 84`) daje
  kod wyjścia 0 („102 passed | 4 expected fail”); po załataniu luki test się
  zaczerwieni — to zamierzony sygnał z §6.5, nie fałszywa blokada.
- Branch protection niedostępne (`README.md:180`): jedyne techniczne wymuszenie to
  `needs` w `deploy`.
- Hooków agenta brak: `.claude/hooks/` pusty, brak `.claude/settings.json`; `jq`
  dostępny (`/usr/bin/jq`); `.claude/` nie jest ignorowany przez `.gitignore`.
- Czasy lokalne: eslint jednego pliku ~2,3 s, `vitest related --project unit`
  ~0,4 s, `npm test` 0,45 s, `astro check` 5,7 s, `npm run test:integration` 3,9 s.
- `scripts/__tests__/` istnieje, ale jest pusty, a projekt `unit`
  (`vitest.config.ts:13`) obejmuje tylko `src/**/*.test.ts`.

## Desired End State

- Każdy PR ma osobny status `integration`; czerwony test integracyjny czyni go
  czerwonym. Push na `main` uruchamia `checks` i `integration` równolegle, a
  `deploy` startuje tylko, gdy oba są zielone.
- Edycja pliku przez agenta (Edit/Write) odpala eslint tego pliku i powiązane testy
  unit; błąd wraca do agenta w tej samej turze. Koniec tury ze zmianami sprawdza
  lint zmienionych plików, cały `npm test` i `astro check`, z jedną szansą na
  poprawkę (`stop_hook_active`).
- Hooki są udowodnione testem `scripts/__tests__/agent-hooks.test.ts` uruchamianym
  przez `npm test` (a więc i w CI).
- README i test-plan opisują nowe bramki.

### Key Discoveries:

- `global-setup.ts:37-47` samo mapuje `supabase status -o env` — workflow nie musi
  przekazywać `API_URL`/`ANON_KEY`.
- Testy używają `gotrue`, `postgrest` i `kong` (`harness.ts:43-55`, `:98-108`) —
  tych usług nie wolno wykluczać z `supabase start -x`.
- Konta tworzy admin API z `email_confirm: true` (`harness.ts:42-56`) — `mailpit`
  zbędny.
- Supabase CLI jest w `devDependencies` — po `npm ci` wystarczy `npx supabase`
  (tak działa już `deploy`).

## What We're NOT Doing

- Branch protection / wymagane statusy w ustawieniach GitHuba (niedostępne na
  darmowym planie).
- `vitest related --project integration` w hooku agenta (zależność od lokalnego
  stosu i współdzielonego stanu bazy).
- Zmiany w git hookach (husky/lint-staged) — skill tylko rekomenduje.
- Cache obrazów Dockera w CI — dopiero gdy zmierzony czas joba okaże się problemem.
- Migracja `[inbucket]` → `[local_smtp]` w `config.toml` (tylko ostrzeżenie CLI).
- Łatanie luk z `db-gaps.int.test.ts` i HTTP smoke w CI.
- Sekrety produkcyjne w jobie `integration` (straż lokalności i tak by je odrzuciła).

## Implementation Approach

Dwie niezależne fazy. Faza 1 to czysta zmiana workflow + pusty seed, dowodzona
przebiegiem na PR. Faza 2 deleguje generację hooków do `/10x-configure-hook` —
skill niesie protokół sygnałów Claude Code, audyt i przypadki dowodowe; plan
przekazuje mu decyzje (zakres per edycja / koniec tury, miejsce testu) i definiuje
kontrakt oraz kryteria sukcesu.

## Faza 1: Integracja w CI

### Overview

Osobny job `integration` uruchamia lokalny Supabase i `npm run test:integration`
na PR i push do `main`; `deploy` czeka na niego.

### Changes Required:

#### 1. Seed

**File**: `supabase/seed.sql`

**Intent**: Usunąć wskazanie na nieistniejący plik, które może przerwać pierwszy
`supabase start` na świeżym runnerze.

**Contract**: Plik z jednym komentarzem SQL (brak danych); `config.toml` bez zmian.

#### 2. Job `integration`

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać zestaw integracyjny na świeżej bazie z migracjami repo,
równolegle do `checks`, bez sekretów.

**Contract**: Nowy job `integration` (`runs-on: ubuntu-latest`, te same triggery co
workflow): checkout → setup-node (`.nvmrc`, cache npm) → `npm ci` →
`npx supabase start` z wykluczeniem usług nieużywanych przez testy → `npm run
test:integration`. Bez `astro sync`, lint i build. Bez `env` z sekretami.
`deploy.needs` zmienia się na `[checks, integration]`; warunek `if` deployu bez
zmian. Krótki komentarz przy `-x` wyjaśnia, czemu `gotrue`, `postgrest`, `kong`
zostają.

```yaml
# Tests use auth (gotrue), PostgREST and the kong gateway; everything else is skipped.
- run: npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

#### 3. README — tabela CI

**File**: `README.md` (sekcja „Deployment”, tabela Event/Jobs)

**Intent**: Opisać nowy job i zależność `deploy`.

**Contract**: Wiersz „Pull request” wymienia `checks` i `integration`
(`supabase start` → `npm run test:integration`); wiersz „Push to `main`” mówi, że
`deploy` startuje po zielonych `checks` i `integration`. Zdanie o kolejności
`deploy` uzupełnione o to, że czerwony test integracyjny blokuje wdrożenie.

### Success Criteria:

#### Automated Verification:

- Workflow parsuje się i ma job `integration` oraz `deploy.needs: [checks, integration]`: `node -e` z pakietem `yaml` (dostępny w `node_modules`) czyta `jobs.integration` i `jobs.deploy.needs`
- `npx supabase start -x <ta sama lista>` lokalnie na zatrzymanym stosie podnosi stos, a `npm run test:integration` przechodzi (102 passed | 4 expected fail)
- `npm run lint` i `npm test` przechodzą

#### Manual Verification:

- Na PR job `integration` jest zielony i widoczny jako osobny status; zanotowany czas joba
- Tymczasowy commit z celowo zepsutą asercją w teście integracyjnym czyni `integration` czerwonym; commit wycofany przed merge
- Po merge na `main` `deploy` startuje dopiero po zielonych `checks` i `integration`

**Implementation Note**: Lokalny test `supabase start -x` wykonuj tylko po
`npx supabase stop` bez `--no-backup` — dane dev zostają (lessons: „Migracje
lokalnie”). Po weryfikacji automatycznej zatrzymaj się na potwierdzenie ręczne.

---

## Faza 2: Hooki agenta przez `/10x-configure-hook`

### Overview

Wywołaj `/10x-configure-hook` z decyzjami poniżej. Skill wykrywa harness (Claude
Code), audytuje pustą konfigurację, generuje skrypty i commitowany test dowodowy.

### Changes Required:

#### 1. Konfiguracja i skrypty hooków (generuje skill)

**File**: `.claude/settings.json`, `.claude/hooks/*.sh`

**Intent**: Szybki sygnał po każdej edycji i siatka bezpieczeństwa na koniec tury,
zgodnie z §5 test-planu („post-edit hook (lint + powiązane testy)”).

**Contract** (decyzje przekazane skillowi):
- `PostToolUse`, matcher `Edit|Write`: tylko edytowany plik — `eslint` (rozszerzenia
  z `eslint.config.js`: `.ts`, `.tsx`, `.astro`, `.js`/`.mjs`) i
  `vitest related <plik> --run --project unit`. Bez integracji.
- `Stop`: pliki z `git diff --name-only HEAD` + nieśledzone; lint tych plików, cały
  `npm test` (szybki — 0,45 s), `astro check`; respektuje `stop_hook_active`.
- Sygnał do agenta zgodnie z referencją skilla (`references/anthropic.md`);
  timeouty w sekundach; ścieżki przez `git rev-parse --show-toplevel`.

#### 2. Test dowodowy i jego wpięcie w `npm test`

**File**: `scripts/__tests__/agent-hooks.test.ts`, `vitest.config.ts`

**Intent**: Dowód hooków, który da się powtórzyć po każdej zmianie skryptów, biegnący
w istniejącej bramce `npm test` (a więc w CI) — bez nowego joba.

**Contract**: Przypadki 1–9 z kroku 7 skilla (broken, clean, skipped type,
nonexistent, empty/invalid payload, retry flag, edycja z pominięciem hooka,
rozwiązywanie checkoutu, brak narzędzia). Projekt `unit` w `vitest.config.ts`
dostaje `scripts/**/*.test.ts` w `include`. Tytuły testów po angielsku (lessons).
Test działa na tymczasowej kopii / throwaway repo, nigdy na drzewie dewelopera.

#### 3. Test-plan i README

**File**: `context/foundation/test-plan.md`, `README.md`

**Intent**: Utrwalić, że bramki z fazy 3 działają.

**Contract**: §3 — status fazy 3 `complete` przy zamknięciu zmiany; §5 — wiersz
integracji „required” (CI na PR i przed deploy), wiersz post-edit hook
„recommended” z opisem `PostToolUse` + `Stop`; §6.5 — nota fazy 3: job
`integration`, `deploy` zależy od niego, `it.fails` zaczerwieni CI po załataniu
luki (zdejmij `.fails`), hooki dowodzi `scripts/__tests__/agent-hooks.test.ts`.
README — krótka wzmianka o hookach agenta w „Available Scripts” albo osobnym
akapicie (skąd się biorą, jak je sprawdzić: `/hooks`).

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi i uruchamia `scripts/__tests__/agent-hooks.test.ts`
- Celowe zepsucie jednego skryptu (np. usunięcie ochrony `stop_hook_active`) czerwieni odpowiedni przypadek; po przywróceniu znów zielono
- Baseline: skrypt `Stop` na czystym drzewie kończy się sukcesem
- `npm run lint` i `npx astro check` przechodzą
- `git check-ignore -v .claude/settings.json` nic nie zwraca (konfiguracja jest commitowana)

#### Manual Verification:

- W nowej sesji Claude Code `/hooks` pokazuje `PostToolUse` i `Stop` z projektu
- Agent poproszony o edycję z błędem lintu dostaje sygnał i poprawia go w tej samej turze
- Plik nadpisany przez shell z błędem lintu zostaje odesłany przez hook `Stop`

**Implementation Note**: Po weryfikacji automatycznej zatrzymaj się na
potwierdzenie ręczne.

---

## Testing Strategy

### Unit Tests:

- `scripts/__tests__/agent-hooks.test.ts` — przypadki dowodowe skilla z prawdziwymi
  skryptami, `git` i `jq`; stubowany tylko wolny/nieobecny linter.

### Integration Tests:

- Istniejący zestaw `npm run test:integration` jest przedmiotem bramki — bez nowych
  testów integracyjnych.

### Manual Testing Steps:

1. Otwórz PR i sprawdź osobny status `integration` oraz jego czas.
2. Wypchnij tymczasowy commit z zepsutą asercją integracyjną — status czerwony; cofnij.
3. Po merge sprawdź, że `deploy` czeka na oba joby.
4. W nowej sesji: edycja z błędem lintu, potem nadpisanie pliku przez shell — oba
   sygnały wracają do agenta.

## Performance Considerations

- Koszt joba `integration` zdominuje pobranie obrazów Supabase; `-x` ogranicza
  liczbę obrazów. Testy trwają ~4 s.
- `Stop` ~10 s (lint zmienionych + `npm test` + `astro check`) tylko przy turach ze
  zmianami; per edycja ~3 s.

## Migration Notes

Brak zmian schematu. Rollback: przywrócenie `needs: checks` w `deploy` i usunięcie
`.claude/settings.json` wyłącza bramki bez wpływu na produkcję.

## References

- Research: `context/changes/testing-quality-gates/research.md`
- Test-plan: `context/foundation/test-plan.md` §3, §5, §6.5
- Workflow: `.github/workflows/ci.yml:12-29`
- Env integracji: `src/test/integration/global-setup.ts:32-68`
- Kontrakt `it.fails`: `src/lib/services/db-gaps.int.test.ts:52-91`
- Skill: `~/.claude/skills/10x-configure-hook/SKILL.md`, `references/anthropic.md`
- Poprzednia decyzja (zastępowana): `context/archive/2026-10-04-deploy-pipeline-with-migrations/plan.md:39`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integracja w CI

#### Automated

- [x] 1.1 Workflow parsuje się i ma job `integration` oraz `deploy.needs: [checks, integration]`
- [x] 1.2 `npx supabase start -x <ta sama lista>` lokalnie podnosi stos, a `npm run test:integration` przechodzi (102 passed | 4 expected fail)
- [x] 1.3 `npm run lint` i `npm test` przechodzą

#### Manual

- [x] 1.4 Na PR job `integration` jest zielony i widoczny jako osobny status; zanotowany czas joba (3 min 1 s)
- [ ] 1.5 Tymczasowy commit z zepsutą asercją czyni `integration` czerwonym; commit wycofany przed merge
- [ ] 1.6 Po merge na `main` `deploy` startuje dopiero po zielonych `checks` i `integration`

### Phase 2: Hooki agenta przez `/10x-configure-hook`

#### Automated

- [ ] 2.1 `npm test` przechodzi i uruchamia `scripts/__tests__/agent-hooks.test.ts`
- [ ] 2.2 Celowe zepsucie jednego skryptu czerwieni odpowiedni przypadek; po przywróceniu znów zielono
- [ ] 2.3 Baseline: skrypt `Stop` na czystym drzewie kończy się sukcesem
- [ ] 2.4 `npm run lint` i `npx astro check` przechodzą
- [ ] 2.5 `git check-ignore -v .claude/settings.json` nic nie zwraca

#### Manual

- [ ] 2.6 W nowej sesji `/hooks` pokazuje `PostToolUse` i `Stop` z projektu
- [ ] 2.7 Agent poproszony o edycję z błędem lintu dostaje sygnał i poprawia go w tej samej turze
- [ ] 2.8 Plik nadpisany przez shell z błędem lintu zostaje odesłany przez hook `Stop`
