---
date: 2026-10-20T09:58:23+0200
researcher: Claude (Opus 5.5) z Dominikiem Blachą
git_commit: 28bd3af41c276560356fc80bbf8c66659f5a20db
branch: main
repository: domblacha/naleznosci
topic: "Bramki jakości — testy integracyjne w CI na PR i post-edit hook dla agenta"
tags: [research, ci, github-actions, supabase-cli, vitest, claude-code-hooks, quality-gates]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude (Opus 5.5)
---

# Research: Bramki jakości — testy integracyjne w CI na PR i post-edit hook dla agenta

**Date**: 2026-10-20T09:58:23+0200
**Researcher**: Claude (Opus 5.5) z Dominikiem Blachą
**Git Commit**: 28bd3af41c276560356fc80bbf8c66659f5a20db (drzewo robocze: niezacommitowana zmiana `context/foundation/test-plan.md` — status faz 2/3)
**Branch**: main
**Repository**: domblacha/naleznosci

## Research Question

Faza 3 z `context/foundation/test-plan.md` (§3, §5): co trzeba wiedzieć, żeby
(1) `npm run test:integration` biegło w CI na każdym PR na lokalnym Supabase i
zatrzymywało zmianę przy czerwonym teście, (2) `npm test` zostało wymaganą bramką
na PR i przed deploy, (3) agent dostawał szybki sygnał po edycji (lint + powiązane
testy) bez pełnego zestawu integracyjnego, (4) kontrakt `it.fails` z
`db-gaps.int.test.ts` nie przechodził po cichu ani nie blokował CI fałszywie
(`context/changes/testing-quality-gates/change.md:14-18`).

## Summary

- **CI dziś**: job `checks` (`.github/workflows/ci.yml:12-26`) uruchamia `npm test`
  (`:25`), ale nie uruchamia `supabase start` ani `npm run test:integration`; `deploy`
  zależy wyłącznie od `checks` (`:29`). Wymóg (2) jest więc już spełniony dla PR i
  push na `main`; wymóg (1) — nie.
- **Integracja jest gotowa do CI bez zmian w kodzie testów**: `global-setup.ts`
  bierze `API_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` z env albo z
  `npx supabase status -o env` (`src/test/integration/global-setup.ts:32-53`) i
  odmawia startu dla hosta innego niż `127.0.0.1`/`localhost` (`:56-68`). CLI 2.117.0
  nadal wypisuje te trzy nazwy (obok nowych `PUBLISHABLE_KEY`/`SECRET_KEY`) —
  sprawdzone lokalnie. Testy integracyjne nie potrzebują `.env` ani `astro sync`:
  jedyny import `astro:env/server` w ścieżce testów (`src/lib/supabase.ts:3`) jest
  zamockowany (`src/test/integration/setup.ts:4-7`).
- **`supabase start` stosuje migracje** z `supabase/migrations/` (9 plików) na świeżym
  runnerze (docs Supabase, patrz niżej), więc CI nie potrzebuje `db reset` /
  `migration up`. Konfiguracja lokalna, którą `start` przeczyta, ma
  `enable_confirmations = false` (`supabase/config.toml:210`) i
  `sign_in_sign_ups = 1000` (`:191`).
- **Zmierzone czasy (lokalnie, macOS, 2026-10-20)**: cały `npm run test:integration`
  — 7 plików, 106 testów (102 passed + 4 expected fail), 3,89 s real; `npm test` —
  12 plików, 200 testów, 0,45 s real; `eslint` jednego pliku (`src/lib/escalation.ts`,
  type-aware) — 2,33 s real; `vitest related src/lib/escalation.ts --run --project unit`
  — 4 pliki, 84 testy, 0,43 s real. Plan fazy 2 szacował „dziesiątki sekund”
  (`context/archive/2026-10-14-testing-api-state-and-isolation/plan.md:410-412`) —
  pomiar to obala; koszt CI zdominuje start Dockera z obrazami Supabase, nie testy.
- **`it.fails` jest dziś zgodny z bramką**: Vitest raportuje 4 testy jako
  „expected fail” i proces kończy się sukcesem (lokalny przebieg powyżej); gdy luka
  zostanie załatana, ciało przejdzie, a test zaczerwieni się (semantyka `test.fails`,
  vitest.dev/api). Bramka nie wymaga żadnej specjalnej obsługi — wystarczy zwykły
  kod wyjścia `vitest run`.
- **„Blokuje merge” nie da się wymusić technicznie**: README mówi, że branch
  protection nie jest dostępne na darmowym planie dla prywatnego repo
  (`README.md:180`). Wymuszalne jest tylko: czerwony status na PR + `deploy` zależny
  od joba integracyjnego (`needs`). To decyzja produktowa dla planu.
- **Hook agenta**: `.claude/hooks/` istnieje, ale jest pusty; nie ma
  `.claude/settings.json` ani `settings.local.json`; globalne `~/.claude/settings.json`
  nie ma sekcji `hooks`. Lokalną bramką commita jest tylko husky → `npx lint-staged`
  (`.husky/pre-commit`) → `eslint --fix` na `*.{ts,tsx,astro}` (`package.json:62-64`).

## Detailed Findings

### 1. Obecny workflow CI

- `checks` (`.github/workflows/ci.yml:12-26`): checkout → setup-node
  (`.nvmrc` = 24.21.0, cache npm) → `npm ci` → `npx astro sync` (`:22`) → lint →
  `astro check` → `npm test` (`:25`) → build. Biegnie na `pull_request` i push na
  `main` (`:3-6`).
- `deploy` (`:28-54`): `needs: checks` (`:29`), tylko push na `main`; build →
  `supabase link` → `supabase db push --yes` → `wrangler deploy`. `concurrency:
  production` bez anulowania.
- Supabase CLI jest w `devDependencies` (`package.json`, `"supabase": "^2.23.4"`;
  zainstalowana 2.117.0), więc po `npm ci` dostępne jest `npx supabase` bez
  osobnej akcji (tak już działa `deploy`).
- Historycznie: `deploy-pipeline-with-migrations` świadomie odrzuciło lokalny
  Supabase w CI na PR („kontrole na PR to tylko lint/testy/typy/build” —
  `context/archive/2026-10-04-deploy-pipeline-with-migrations/plan.md:39`). Faza 3
  odwraca tę decyzję w zakresie testów integracyjnych; efekt uboczny: każdy PR
  zastosuje wszystkie migracje na świeżej bazie, czyli błędna migracja wyjdzie na
  PR, a nie dopiero w `deploy` (wniosek, nie cel fazy).

### 2. Uruchamianie lokalnego Supabase w GitHub Actions

- Akcja `supabase/setup-cli@v3` (https://github.com/supabase/setup-cli): bez
  `version` czyta wersję z `package-lock.json`. W tym repo równoważne jest
  `npx supabase` po `npm ci` — ta sama wersja z lockfile.
- `supabase start` wymaga Dockera (jest na `ubuntu-latest`) i stosuje migracje oraz
  seed (https://supabase.com/docs/guides/local-development/cli-workflows,
  https://supabase.com/docs/reference/cli/supabase-start).
- `-x/--exclude` (lista z `npx supabase start --help`, CLI 2.117.0):
  `gotrue, realtime, storage-api, imgproxy, kong, mailpit, postgrest, postgres-meta,
  studio, edge-runtime, logflare, vector, supavisor`. Testy używają auth (`gotrue`),
  PostgREST i bramy `kong` (`harness.ts:43-55`, `:98-108`), więc tych trzech nie
  wolno wykluczać. Wykluczenie pozostałych skraca pobieranie obrazów — to wniosek,
  nie zalecenie z dokumentacji.
- `supabase status -o env` w 2.117.0 zwraca m.in. `API_URL`, `ANON_KEY`,
  `SERVICE_ROLE_KEY`, `PUBLISHABLE_KEY`, `SECRET_KEY` (lokalny przebieg; opublikowane
  docs wymieniają tylko starsze nazwy). Parser `global-setup.ts:23-30` bierze
  wyłącznie linie `KEY="value"`, więc ostrzeżenia CLI (np. o `[inbucket]`) mu nie
  przeszkadzają.
- `[db.seed]` wskazuje na `./seed.sql` (`supabase/config.toml:60-65`), którego nie
  ma w repo. Lokalny stos działa z tą konfiguracją; czy `start` na świeżym runnerze
  tylko ostrzega — niezweryfikowane (patrz Open Questions).
- `config.toml:99` zawiera przestarzałą sekcję `[inbucket]` (CLI ostrzega, by użyć
  `[local_smtp]`); obecnie tylko ostrzeżenie.

### 3. Gotowość zestawu integracyjnego do CI

- Projekt `integration` (`vitest.config.ts:17-30`): `*.int.test.ts`,
  `fileParallelism: false`, `globalSetup`, `setupFiles`, timeouty 30 s.
  Projekt `unit` wyklucza `*.int.test.ts` (`:14`), więc `npm test` nie dotyka bazy.
- `globalSetup` (`global-setup.ts:91-96`): czyta env → straż lokalności → usuwa
  pozostałe konta `int-*@example.com` (`:70-89`) → `provide("supabaseEnv")`.
  Przy braku stosu rzuca błąd z podpowiedzią `npx supabase start` (`:41-42`).
- Konta tworzy admin (`harness.ts:42-56`, `email_confirm: true`), więc testy nie
  zależą od SMTP/mailpit.
- 7 plików integracyjnych: `src/test/integration/harness.int.test.ts` oraz 6 w
  `src/lib/services/` (`client-transitions`, `db-gaps`, `invoice-transitions`,
  `isolation`, `open-invoices`, `validation`).
- `astro:env/server` importują `src/lib/supabase.ts:3` i `src/lib/config-status.ts:1`;
  pierwszy jest zamockowany w `setup.ts:4-7`, a żaden import w plikach `*.int.test.ts`
  nie prowadzi do `config-status.ts` (inspekcja importów). Lokalny przebieg z
  `.env` to potwierdza tylko pośrednio — przebieg w CI bez `.env` będzie pierwszym
  twardym dowodem.

### 4. Kontrakt `it.fails` (`db-gaps.int.test.ts`)

- 4 testy `it.fails` (`src/lib/services/db-gaps.int.test.ts:52, 57, 67, 84`) i 3
  testy kontrolne (`:47, 62, 75`); fixture'y w `beforeAll` (`:27-38`), więc błąd
  fixture'a czerwieni zestaw, zamiast „zaliczać” `it.fails` (decyzja z
  `context/archive/2026-10-14-testing-api-state-and-isolation/reviews/plan-review.md:35-38`).
- Lokalny przebieg: „102 passed | 4 expected fail (106)”, kod wyjścia 0.
- Po załataniu luki ciało `it.fails` przejdzie → test jest czerwony → CI czerwone.
  To zamierzony sygnał z §6.5 test-planu („zdejmij `.fails`”), nie fałszywa blokada.
  Fałszywa blokada mogłaby wyniknąć tylko z błędu środowiska (np. brak stosu), który
  `globalSetup` zgłasza czytelnym komunikatem.

### 5. Pętla agenta (post-edit hook)

- Stan: brak jakiegokolwiek hooka Claude Code w projekcie (`.claude/` zawiera pusty
  `hooks/` i `scheduled_tasks.lock`) i w ustawieniach globalnych.
- Protokół Claude Code (https://code.claude.com/docs/en/hooks): `PostToolUse` z
  `matcher: "Edit|Write"` w `.claude/settings.json`; stdin JSON z
  `tool_input.file_path` (ścieżka absolutna); feedback do modelu przez exit 2 +
  stderr albo exit 0 + JSON (`decision: "block"` / `additionalContext`); `timeout`
  w sekundach (domyślnie 600); `$CLAUDE_PROJECT_DIR` = katalog projektu. `MultiEdit`
  nie jest już wbudowanym narzędziem. `Stop` hook ma `stop_hook_active` (ochrona
  przed pętlą).
- Koszt sygnału: `eslint <plik>` ~2,3 s (type-aware, `eslint.config.js:17-22`),
  `vitest related <plik> --run --project unit` ~0,4 s. `vitest related` dla pliku
  bez testów kończy się kodem 0 nawet bez `--passWithNoTests` (sprawdzone przez
  agenta na `src/lib/auth-config.ts`), więc hook nie zgłosi fałszywego błędu.
  `related` śledzi tylko statyczne importy.
- `vitest related src/lib/services/invoices.ts --run --project integration` uruchomiło
  4 pliki / 83 testy w 2,62 s — tani, ale wymaga działającego stosu; change.md
  wyklucza pełny zestaw integracyjny z hooka per edycja (`change.md:17`).
- Istniejący `skill 10x-configure-hook` jest przeznaczony dokładnie do zamiany
  bramek z test-planu na hooki i ich weryfikacji (lista skilli sesji) — kandydat na
  wykonanie części hookowej zamiast ręcznego planu.

## Code References

- `.github/workflows/ci.yml:12-26` — job `checks`, brak Supabase i integracji
- `.github/workflows/ci.yml:29` — `deploy` zależy tylko od `checks`
- `src/test/integration/global-setup.ts:32-53` — źródła env (process.env → `status -o env`)
- `src/test/integration/global-setup.ts:56-68` — straż: tylko localhost
- `src/test/integration/global-setup.ts:70-89` — sprzątanie kont `int-*`
- `src/test/integration/setup.ts:4-7` — mock `@/lib/supabase` (omija `astro:env`)
- `src/test/integration/harness.ts:42-56` — konta przez admin API, `email_confirm: true`
- `vitest.config.ts:8-30` — projekty `unit` i `integration`
- `src/lib/services/db-gaps.int.test.ts:12-14, 52-91` — kontrakt `it.fails`
- `supabase/config.toml:60-65` — seed wskazujący na brakujący `seed.sql`
- `supabase/config.toml:191, 210` — limit rejestracji i brak potwierdzeń e-mail
- `package.json:62-64`, `.husky/pre-commit` — lint-staged jako jedyna lokalna bramka
- `README.md:180` — brak branch protection (konwencja, nie wymuszenie)

## Architecture Insights

- Projekty Vitest rozdzielają bazę od reszty, więc integrację da się dopiąć jako
  osobny job równoległy do `checks` (bez `astro sync`, lint, build), co nie
  wydłuża krytycznej ścieżki `checks` — wniosek z konfiguracji, nie zmierzone w CI.
- Wymuszenie bramki w tym repo opiera się na `needs` w `deploy`, nie na regułach
  GitHuba (`README.md:180`).
- Straż lokalności w `globalSetup` sprawia, że w CI nie wolno przekazywać sekretów
  produkcyjnych do joba integracyjnego — i nie są potrzebne.

## Historical Context (from prior changes)

- `context/archive/2026-10-14-testing-api-state-and-isolation/plan.md:16, 85` — CI
  dla integracji, `supabase start` w workflow i post-edit hook odłożone do fazy 3
  (supported).
- `.../research.md:345-347` — „W CI `.env` nie ma — faza 3 musi zmapować
  `API_URL`/`ANON_KEY` z `supabase status -o env`” — partial: mapowanie robi już
  sam `global-setup.ts:37-47`, więc workflow nie musi nic mapować.
- `.../plan.md:410-412` — „Oczekiwany czas zestawu: dziesiątki sekund” —
  contradicted lokalnym pomiarem (3,89 s); propozycja współbieżności plików
  przestaje być potrzebna.
- `.../plan.md:354-356` i `reviews/plan-review.md:35-38` — projekt `it.fails`
  (fixture'y w hookach, test kontrolny) — supported przez obecny kod.
- `context/archive/2026-10-04-deploy-pipeline-with-migrations/plan.md:39` — decyzja
  „bez lokalnego Supabase w CI na PR” — zastępowana przez tę zmianę.
- Brak impl-review dla obu archiwalnych faz testów (w `reviews/` fazy 2 jest tylko
  `plan-review.md`).

## Related Research

- `context/archive/2026-10-14-testing-api-state-and-isolation/research.md`
- `context/archive/2026-10-14-testing-domain-rules/` (faza 1)

## Open Questions

1. **Czy `deploy` ma zależeć od joba integracyjnego** (`needs: [checks, integration]`)
   i czy integracja ma też biec na push do `main`? To jedyne techniczne wymuszenie
   (decyzja produktowa).
2. **`seed.sql` brakuje** — czy `supabase start` na świeżym runnerze tylko ostrzega,
   czy przerywa? Rozstrzygnie pierwszy przebieg CI; tanie zabezpieczenie: pusty
   `supabase/seed.sql` albo `[db.seed] enabled = false`.
3. **Czas startu Supabase w CI** (pobranie obrazów) — niezmierzony; zdecyduje o
   sensowności `-x` i ewentualnego cache obrazów Dockera.
4. **Zakres hooka**: tylko `PostToolUse` (lint + `vitest related --project unit`)
   czy także `Stop` z pełnym `npm test`; i czy hook ma uruchamiać
   `vitest related --project integration`, gdy stos działa (change.md tego nie
   wymaga).
5. **`[inbucket]` → `[local_smtp]`** w `config.toml` — tylko ostrzeżenie; poza
   zakresem, chyba że CLI zacznie odrzucać sekcję.
