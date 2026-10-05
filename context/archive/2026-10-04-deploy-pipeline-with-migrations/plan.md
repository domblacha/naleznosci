# Potok wdrożenia z migracjami — Implementation Plan

## Overview

Jeden workflow GitHub Actions zastępuje auto-deploy z Workers Builds. Na każdym PR i na `main` uruchamia kontrole. Po merge na `main` buduje aplikację, stosuje oczekujące migracje na produkcyjnym Supabase i dopiero po nich wdraża Workera. Pierwszy przebieg idzie „na pusto” (kod z `origin/main`, bez migracji), a zmiana S-02 z pierwszą migracją wchodzi drugim merge, już przez potok.

## Current State Analysis

- Nie ma żadnego CI: brak katalogu `.github/`. `context/foundation/infrastructure.md:111` wspomina `.github/workflows/ci.yml`, ale ten plik nigdy nie powstał.
- Wdrożenie produkcyjne robi Workers Builds: każdy push na `main` → `npm run build` + `npx wrangler deploy` (README §Deployment). Migracje stosuje się ręcznie (`supabase db push`), a README z commita `6bf4996` opisuje to w podsekcji „Migracje”.
- Lokalny `main` jest 4 commity przed `origin/main` (`a4efef2`, `304f6bd`, `2a08b40`, `6bf4996` — fazy 1–4 S-02). Wnoszą kod `/clients` zależny od `supabase/migrations/20261003120000_create_clients.sql`, a także vitest i skrypt `test`. Zwykły push wdrożyłby ten kod bez tabeli.
- `origin/main` nie ma `supabase/migrations/`, vitesta ani skryptu `test`. Ma za to `supabase/config.toml` i `supabase/.gitignore`.
- Repo `domblacha/naleznosci` jest prywatne. Na darmowym planie GitHuba nie ma reguł ochrony gałęzi ani bramek środowisk.
- `SUPABASE_URL`/`SUPABASE_KEY` są `optional` w `astro.config.mjs:19-20`, więc build przechodzi bez sekretów. Wartości runtime żyją jako sekrety Workera i przetrwają `wrangler deploy`.
- CLI `supabase` (`^2.23.4`) i `wrangler` (`^4.131.1`) są w `devDependencies`, więc w CI wystarczy `npm ci` + `npx`.

## Desired End State

- `.github/workflows/ci.yml` z dwoma jobami:
  - `checks` na `pull_request` i na `push` do `main`: lint, `astro check`, testy, build;
  - `deploy` tylko na `push` do `main`, po zielonym `checks`, serializowany: build → `supabase link` + `supabase db push` → `wrangler deploy`.
- Workers Builds jest odłączone od repo, więc jedynym wdrażającym jest GitHub Actions.
- Sekrety produkcji (Cloudflare, Supabase) są w repo secrets i używa ich wyłącznie job `deploy`.
- README opisuje przepływ „gałąź → PR → merge”, potok, wymagane sekrety i rollback. Ręczna procedura `db push` przed pushem znika.
- Migracja `create_clients` jest zastosowana na produkcji przez potok, a kod S-02 działa na produkcji.

Weryfikacja: zakładka Actions pokazuje zielony przebieg `deploy` dla merge S-02, a `npx supabase migration list` (po `link`) pokazuje `20261003120000` po stronie zdalnej.

### Key Discoveries:

- Brak CI, a odwołanie w `infrastructure.md:111` jest martwe.
- Build nie potrzebuje sekretów: `astro.config.mjs:19-20` (`optional: true`).
- `wrangler deploy` bez `--config` (README §Deployment): `astro build` generuje `dist/server/wrangler.json`, a Wrangler bierze go przez `.wrangler/deploy/config.json`.
- Rollback Workera nie cofa schematu: `infrastructure.md:86`, README §Migracje.
- Node z `.nvmrc` (`24.21.0`).

## What We're NOT Doing

- **Weryfikacja migracji na PR** (lokalny Supabase w CI, dry-run na produkcji). Decyzja: kontrole na PR to tylko lint/testy/typy/build. Błędna migracja wyjdzie dopiero w jobie `deploy` i zatrzyma wdrożenie kodu.
- **Bramka ręcznego zatwierdzenia** migracji (environment reviewers, `workflow_dispatch`). Migracje idą automatycznie po merge, więc przegląd SQL odbywa się na PR.
- **Sprawdzenie po wdrożeniu** (health check, smoke na produkcji). Potok kończy się na `wrangler deploy`.
- **Podglądy per PR**, czy to z Workers Builds, czy z Actions.
- **Reguły ochrony gałęzi / rulesety** (wymagają płatnego planu). „Tylko przez PR” to umowa opisana w README.
- **Automatyczny rollback** schematu lub kodu.
- Zmiana ładowania sekretów runtime (`astro:env`) i ryzyka #16790.

## Implementation Approach

Jeden plik workflow, dwa joby. `deploy` zależy od `checks` i ma własny build. Build idzie przed migracją, żeby zepsuty build nie dotknął bazy. Migracja idzie przed `wrangler deploy`, więc kod nigdy nie wyprzedza schematu. `concurrency: production` bez anulowania kolejkuje kolejne merge zamiast przerywać trwającą migrację.

Pierwszy przebieg idzie „na pusto”: workflow ląduje na gałęzi utworzonej z `origin/main`, gdzie nie ma migracji ani kodu S-02. Dzięki temu cały łańcuch (sekrety, `link`, `db push`, `wrangler deploy`) sprawdzamy, zanim cokolwiek zmieni schemat. Dopiero potem rebase S-02 na nowy `main` i drugi merge, który stosuje `create_clients`.

## Critical Implementation Details

- **Kolejność operacji produkcyjnych.** Workers Builds trzeba odłączyć **przed** jakimkolwiek pushem na `main`. Inaczej merge z fazy 3 wdroży kod S-02 równolegle z Actions i być może przed migracją. W fazie 2 odłączenie i sekrety idą przed merge PR z fazy 1.
- **Częściowa porażka `deploy`.** Jeśli `db push` przejdzie, a `wrangler deploy` padnie, produkcja ma nowy schemat i stary kod. Naprawa to „Re-run failed jobs”, bo `db push` jest idempotentny (zastosowane migracje są pomijane). Jeśli padnie `db push`, kod się nie wdraża. Naprawa to nowa migracja przez PR. README ma to opisać.
- **`supabase link` bez interakcji.** Wymaga w env `SUPABASE_ACCESS_TOKEN` oraz `SUPABASE_DB_PASSWORD`. Bez hasła CLI czeka na prompt i job wisi.
- **Pusty przebieg a brak `supabase/migrations/`.** Zachowanie `db push` przy braku katalogu sprawdzamy w fazie 2. Jeśli CLI zgłasza błąd zamiast „up to date”, faza 1 dodaje pusty `supabase/migrations/.gitkeep`.

## Phase 1: Workflow potoku

### Overview

Na gałęzi utworzonej z `origin/main` (bez commitów S-02) powstaje workflow CI/CD. Ląduje tam też folder tej zmiany.

### Changes Required:

#### 1. Gałąź robocza

**File**: — (git)

**Intent**: Workflow musi trafić na `main` bez kodu S-02, żeby pierwszy przebieg był pusty.

**Contract**:
- Gałąź `ci/deploy-pipeline` z `origin/main`.
- Lokalna modyfikacja `context/foundation/roadmap.md` zostaje odłożona (`git stash`) i wraca w fazie 3.
- Na gałęzi commitujemy tylko `.github/workflows/ci.yml` i `context/changes/deploy-pipeline-with-migrations/`.

#### 2. Workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Kontrole na PR i na `main`; na `main` dodatkowo migracje, a potem wdrożenie, w ścisłej kolejności.

**Contract**:
- Triggery: `pull_request` i `push` z `branches: [main]`.
- Job `checks`: checkout → `actions/setup-node` (`node-version-file: .nvmrc`, cache npm) → `npm ci` → `npm run lint` → `npx astro check` → `npm run build`. Kroku testów jeszcze nie ma, bo `origin/main` nie ma skryptu `test`; dochodzi w fazie 3.
- Job `deploy`:
  - `needs: checks`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`;
  - `concurrency: { group: production, cancel-in-progress: false }`;
  - kroki: setup jak wyżej → `npm run build` → `npx supabase link --project-ref "$SUPABASE_PROJECT_REF"` → `npx supabase db push` → `npx wrangler deploy` (bez `--config`).
- Sekrety (tylko w env jobu `deploy`): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- `permissions: contents: read`.

### Success Criteria:

#### Automated Verification:

- Na gałęzi przechodzą kontrole lokalnie: `npm run lint && npx astro check && npm run build`
- Workflow jest poprawnym YAML-em: `npx --yes yaml-lint .github/workflows/ci.yml` (albo `actionlint`, jeśli dostępny)

#### Manual Verification:

- W diffie gałęzi względem `origin/main` jest tylko workflow i folder `context/changes/deploy-pipeline-with-migrations/`

**Implementation Note**: Po fazie 1 zatrzymaj się. Faza 2 to operacje na kontach produkcyjnych wykonywane przez użytkownika.

---

## Phase 2: Przygotowanie produkcji i pusty przebieg

### Overview

Odłączamy Workers Builds, konfigurujemy sekrety i mergujemy PR z fazy 1. Pierwszy `deploy` przechodzi bez migracji i wdraża niezmieniony kod.

### Changes Required:

#### 1. Odłączenie Workers Builds

**File**: — (dashboard Cloudflare)

**Intent**: GitHub Actions ma być jedynym wdrażającym; zero ryzyka podwójnego wdrożenia.

**Contract**: Workers & Pages → `naleznosci` → Settings → Builds → Disconnect repository. Wykonuje użytkownik.

#### 2. Tokeny i sekrety repo

**File**: — (Cloudflare, Supabase, GitHub)

**Intent**: Job `deploy` potrzebuje dostępu do produkcyjnego Workera i bazy, a nic poza nim go nie dostaje.

**Contract**:
- Cloudflare: API token z szablonu „Edit Cloudflare Workers” + Account ID.
- Supabase: personal access token, hasło bazy, project ref.
- Ustawienie przez `gh secret set <NAZWA>` (prompt, wartość nie trafia do historii shella) dla pięciu nazw z fazy 1.
- Sekrety Workera (`SUPABASE_URL`, `SUPABASE_KEY`) zostają bez zmian.

#### 3. PR i merge

**File**: — (GitHub)

**Intent**: Pierwszy przebieg całego łańcucha na kodzie, który już jest na produkcji.

**Contract**: push `ci/deploy-pipeline` → PR → zielony `checks` → merge. Jeśli `db push` padnie przez brak `supabase/migrations/`, dodaj `.gitkeep` na gałęzi poprawkowej i powtórz (patrz Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- Na PR `checks` jest zielony, a `deploy` się nie uruchamia: `gh pr checks <nr>`
- Po merge przebieg na `main` jest zielony w obu jobach: `gh run list --branch main --limit 1`
- Log kroku `db push` nie zgłasza żadnych zastosowanych migracji: `gh run view <id> --log`

#### Manual Verification:

- Workers Builds w dashboardzie nie ma podłączonego repo, a merge nie wywołał buildu po stronie Cloudflare
- Produkcja działa jak przed zmianą: logowanie na `https://naleznosci.domblacha.workers.dev/auth/signin` przechodzi
- Dashboard Cloudflare → Deployments pokazuje nowe wdrożenie z GitHub Actions (wrangler), a nie z Workers Builds

**Implementation Note**: Po fazie 2 zatrzymaj się na potwierdzenie użytkownika.

---

## Phase 3: S-02 przez potok

### Overview

Kod S-02 trafia na nowy `main`, a kontrole dostają testy. README opisuje potok, a merge stosuje pierwszą migrację na produkcji przed wdrożeniem kodu.

### Changes Required:

#### 1. Rebase S-02

**File**: — (git)

**Intent**: Postawić 4 lokalne commity S-02 na `main` zawierającym potok.

**Contract**:
- `git switch main && git rebase origin/main`, potem `git stash pop` (roadmapa).
- Gałąź `feat/add-and-edit-clients-deploy` z tak przygotowanego `main`.

#### 2. Testy w kontrolach

**File**: `.github/workflows/ci.yml`

**Intent**: Vitest z S-02 ma blokować merge tak samo jak lint.

**Contract**: W jobie `checks` dochodzi krok `npm test` po `astro check`, przed buildem.

#### 3. README

**File**: `README.md`

**Intent**: Dokumentacja ma odpowiadać rzeczywistemu potokowi zamiast ręcznej procedury z `6bf4996`.

**Contract**: §Deployment:
- „Every push to `main` deploys…” / Workers Builds zastępuje opis potoku: PR → `checks`; `main` → `checks` → build → migracje → `wrangler deploy`.
- Umowa: praca na gałęzi, PR, merge; bez bezpośrednich pushy na `main`. Przegląd SQL migracji odbywa się na PR, bo merge stosuje go na produkcji.
- Tabela sekretów repo (5 nazw, skąd je wziąć) obok istniejących sekretów Workera.
- §Migracje przepisane: potok stosuje migracje; `migration list` jako diagnostyka; częściowa porażka → „Re-run failed jobs”; wycofanie schematu = nowa migracja.
- Ręczny deploy (fallback) zostaje, z dopiskiem: najpierw `supabase db push`, potem `wrangler deploy`.

#### 4. Roadmapa i PR

**File**: `context/foundation/roadmap.md`

**Intent**: Zapisać przywróconą zmianę roadmapy (F-01, zależność S-02) i wypuścić S-02.

**Contract**:
- Commit roadmapy razem z README/workflow.
- Push gałęzi → PR → zielony `checks` → merge.
- Kontrakt „Wdrożenie produkcyjne” z fazy 4 planu `add-and-edit-clients` (ręczne `db push` przed pushem) zastępuje ten potok. Pozostałe kryteria fazy 4 S-02 (4.1–4.4) weryfikuje się tam.

### Success Criteria:

#### Automated Verification:

- Lokalnie po rebase: `npm run lint && npx astro check && npm test && npm run build`
- Na PR `checks` (z krokiem `npm test`) jest zielony: `gh pr checks <nr>`
- Po merge oba joby są zielone, a log `db push` pokazuje zastosowanie `20261003120000_create_clients.sql`: `gh run view <id> --log`
- `npx supabase migration list` pokazuje `20261003120000` lokalnie i zdalnie

#### Manual Verification:

- Na produkcji `/clients` ładuje się po zalogowaniu (dalsze kontrole: faza 4 `add-and-edit-clients`)
- README czytany od zera wystarcza do zrozumienia, jak wdrożyć zmianę z migracją

---

## Testing Strategy

### Unit Tests:

- Brak nowych. Potok uruchamia istniejące testy vitest od fazy 3.

### Integration Tests:

- Sam potok jest testem integracyjnym. Faza 2 sprawdza łańcuch bez migracji, faza 3 z jedną migracją.

### Manual Testing Steps:

1. Po fazie 2: zalogować się na produkcji i sprawdzić w dashboardzie Cloudflare źródło wdrożenia.
2. Po fazie 3: wejść na `/clients` na produkcji i dodać klienta (dalej wg fazy 4 S-02).

## Migration Notes

Ta zmiana nie dodaje migracji. Uruchamia pierwszą (`create_clients`) na produkcji przez potok. Wycofanie potoku = przywrócenie Workers Builds w dashboardzie i usunięcie workflow; schematu to nie dotyczy.

## References

- Roadmapa: `context/foundation/roadmap.md` (F-01, Open Roadmap Question #2)
- Rejestr ryzyk platformy: `context/foundation/infrastructure.md:71,86,111`
- Plan S-02, faza 4: `context/changes/add-and-edit-clients/plan.md:311-351`
- Konfiguracja env: `astro.config.mjs:17-22`
- Worker: `wrangler.jsonc`
- Migracja: `supabase/migrations/20261003120000_create_clients.sql` (lokalny `main`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Workflow potoku

#### Automated

- [x] 1.1 Na gałęzi przechodzą kontrole lokalnie: `npm run lint && npx astro check && npm run build` — d00277c
- [x] 1.2 Workflow jest poprawnym YAML-em: `npx --yes yaml-lint .github/workflows/ci.yml` (albo `actionlint`, jeśli dostępny) — d00277c

#### Manual

- [x] 1.3 W diffie gałęzi względem `origin/main` jest tylko workflow i folder `context/changes/deploy-pipeline-with-migrations/` — d00277c

### Phase 2: Przygotowanie produkcji i pusty przebieg

#### Automated

- [x] 2.1 Na PR `checks` jest zielony, a `deploy` się nie uruchamia: `gh pr checks <nr>` — 78f550b
- [x] 2.2 Po merge przebieg na `main` jest zielony w obu jobach: `gh run list --branch main --limit 1` — 78f550b
- [x] 2.3 Log kroku `db push` nie zgłasza żadnych zastosowanych migracji: `gh run view <id> --log` — 78f550b

#### Manual

- [x] 2.4 Workers Builds w dashboardzie nie ma podłączonego repo, a merge nie wywołał buildu po stronie Cloudflare — 78f550b
- [x] 2.5 Produkcja działa jak przed zmianą: logowanie na `https://naleznosci.domblacha.workers.dev/auth/signin` przechodzi — 78f550b
- [x] 2.6 Dashboard Cloudflare → Deployments pokazuje nowe wdrożenie z GitHub Actions (wrangler), a nie z Workers Builds — 78f550b

### Phase 3: S-02 przez potok

#### Automated

- [x] 3.1 Lokalnie po rebase: `npm run lint && npx astro check && npm test && npm run build` — f8a03dc
- [x] 3.2 Na PR `checks` (z krokiem `npm test`) jest zielony: `gh pr checks <nr>` — f8a03dc
- [x] 3.3 Po merge oba joby są zielone, a log `db push` pokazuje zastosowanie `20261003120000_create_clients.sql`: `gh run view <id> --log` — f8a03dc
- [x] 3.4 `npx supabase migration list` pokazuje `20261003120000` lokalnie i zdalnie — f8a03dc

#### Manual

- [x] 3.5 Na produkcji `/clients` ładuje się po zalogowaniu (dalsze kontrole: faza 4 `add-and-edit-clients`) — f8a03dc
- [x] 3.6 README czytany od zera wystarcza do zrozumienia, jak wdrożyć zmianę z migracją — f8a03dc
