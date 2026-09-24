# Deployment produkcyjny (GitHub + Cloudflare Workers + Supabase) — Implementation Plan

## Overview

Wdrażamy aplikację „Należności” na produkcję w najprostszym możliwym setupie. Projekt trafia do prywatnego repo na GitHubie. Pierwszy deploy robimy ręcznie przez `wrangler` i od razu ustawiamy sekrety Supabase. Potem podpinamy repo pod Cloudflare Workers Builds i od tej chwili każdy push do `main` wdraża aplikację. Backendem auth jest nowy projekt Supabase na darmowym tierze. **Bez GitHub Actions / CI, bez runbooków, bez automatycznych testów.**

## Current State Analysis

- **Repozytorium nie ma remote'a.** `git remote -v` jest puste. `.github/workflows/ci.yml` został usunięty w working tree (niezacommitowane `D`) i nie wraca.
- **`wrangler` nie jest zalogowany.** Wersje: `astro@7.3.2`, `@astrojs/cloudflare@14.3.1`, `wrangler@4.131.1`.
- **Worker nosi nazwę startera**: `wrangler.jsonc:3` → `"name": "10x-astro-starter"`.
- **Adapter generuje własny config deployu.** `astro build` zapisuje `dist/server/wrangler.json` i przekierowanie `.wrangler/deploy/config.json`. Wygenerowany config zawiera binding KV `SESSION`, więc pierwszy `wrangler deploy` sam utworzy namespace KV.
- **Sekrety są opcjonalne i zawodzą po cichu.** `astro.config.mjs:19-20` deklaruje `SUPABASE_URL`/`SUPABASE_KEY` jako `access: "secret", optional: true`. Gdy ich brakuje, logowanie przekierowuje z komunikatem „Supabase is not configured” (`src/pages/api/auth/signin.ts:10-12`).
- **Hostowany Supabase domyślnie wymaga potwierdzenia maila**, a aplikacja nie ma trasy potwierdzającej (lokalnie jest to wyłączone w `supabase/config.toml:209`).
- **Dokumentacja opisuje nieistniejące CI**: `README.md:183-188` (sekcja `## CI`), `CLAUDE.md:31` (referencja do `ci.yml`), a `context/foundation/tech-stack.md` podaje `deployment_target: cloudflare-pages` i „GitHub Actions auto-deploying”.

## Desired End State

- Kod jest w prywatnym repo `naleznosci` na GitHubie.
- Aplikacja działa pod `https://naleznosci.<subdomena>.workers.dev`: rejestracja, logowanie, `/dashboard` i wylogowanie działają w przeglądarce.
- Sekrety `SUPABASE_URL` i `SUPABASE_KEY` (`sb_publishable_…`) są ustawione jako sekrety Workera. Nie ma ich w repo ani w GitHubie.
- Push do `main` sam buduje i wdraża nową wersję w Workers Builds.
- README, CLAUDE.md i tech-stack opisują ten setup i nie wspominają o CI.

### Key Discoveries:

- **Workers Builds wymaga, żeby nazwa Workera w dashboardzie była identyczna z `name` w `wrangler.jsonc`**, inaczej build się wysypie ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/)). Zmienne buildu nie trafiają do runtime, więc sekrety ustawiamy wyłącznie jako sekrety Workera.
- Obraz buildów ma preinstalowany Node 24.18.0 i czyta `.nvmrc` (u nas `24.21.0`) ([build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)). Jeśli instalacja się nie powiedzie, fallbackiem jest zmienna buildu `NODE_VERSION=24.18.0`.
- **Wbudowany SMTP Supabase** wysyła maile tylko do członków zespołu organizacji ([docs](https://supabase.com/docs/guides/auth/auth-smtp)), dlatego na produkcji potwierdzanie maila jest wyłączone.
- **Klucz publishable** (`sb_publishable_…`) zastępuje legacy `anon`, który ma zostać wycofany do końca 2026 ([docs](https://supabase.com/docs/guides/api/api-keys)). Klucza `sb_secret_…` nie używamy, bo omija RLS.
- Zmienne `access: "secret"` z `astro:env` są czytane w runtime i nie trafiają do bundla; bug [withastro/astro#16790](https://github.com/withastro/astro/issues/16790) z rejestru ryzyk jest zamknięty.

## What We're NOT Doing

- **GitHub Actions / CI w jakiejkolwiek postaci**: brak workflow, brak sekretów w GitHubie, brak branch protection opartej o checki.
- **Automatyczne testy deployu**: brak testu kanarka, smoke na lokalnym preview i smoke na produkcji. Weryfikacja to ręczne kliknięcie w przeglądarce.
- **Runbook `docs/runbook.md`**: tylko krótka sekcja Deployment w README.
- Health endpoint, monitoring, keep-alive przeciw pauzie Supabase, backupy, migracje w CI.
- PR preview deploys, staging, własna domena, custom SMTP, potwierdzanie maila, reset hasła.
- Zmiany w kodzie aplikacji poza `name` w `wrangler.jsonc`.
- Usuwanie `scripts/smoke.mjs` i skryptu `npm run smoke`: zostają jako lokalne narzędzie.

## Implementation Approach

Najpierw repo na GitHubie (Faza 1), potem backend auth (Faza 2). Następnie ręczny deploy tworzy Workera pod właściwą nazwą i pozwala podpiąć sekrety przed włączeniem auto-deployu (Faza 3). Na końcu podpinamy repo w Workers Builds. Push z poprawkami dokumentacji jest pierwszym wyzwalaczem auto-deployu (Faza 4). Każda faza kończy się krótkim wpisem w `deployment-log.md` (identyfikatory i wyniki, **nigdy wartości sekretów**).

## Critical Implementation Details

- **Kolejność Faz 3 i 4 jest wiążąca.** Workers Builds podpinamy do *istniejącego* Workera `naleznosci`, który ma już sekrety. Deploy z Builds sekretów nie nadpisuje. Nie definiujemy zmiennych runtime jako plaintext „Variables” w dashboardzie, bo `wrangler deploy` usuwa zmienne, których nie ma w configu (sekretów to nie dotyczy).
- **`astro build` i `wrangler deploy` biegną w tym samym katalogu, bez `--config`.** Wrangler czyta przekierowanie `.wrangler/deploy/config.json` → `dist/server/wrangler.json`. Wskazanie `wrangler.jsonc` ręcznie pominęłoby entrypoint adaptera i bindingi.
- **Auto-deploy nie ma żadnej bramki.** Każdy push do `main` trafia na produkcję, więc przed pushem warto lokalnie uruchomić `npm run build`. Rollback: Dashboard → Workers → `naleznosci` → Deployments, a potem `git revert` + push, bo inaczej kolejny push przywróci błąd.

## Faza 1: Repozytorium na GitHubie

### Overview

Ustawiamy docelową nazwę Workera, commitujemy bieżące zmiany (w tym usunięcie CI) i wypychamy projekt do prywatnego repo.

### Changes Required:

#### 1. Nazwa Workera

**File**: `wrangler.jsonc`

**Intent**: Zmienić `name` z `10x-astro-starter` na `naleznosci`. Ta nazwa trafia do URL-a i musi być identyczna z Workerem podpiętym później w Workers Builds.

**Contract**: `"name": "naleznosci"`.

#### 2. Commit i repo

**File**: brak zmian w plikach (git)

**Intent**: Zacommitować usunięcie `.github/workflows/ci.yml`, `context/foundation/infrastructure.md`, folder `context/changes/production-deploy/` i zmianę nazwy. Utworzyć **prywatne** repo `naleznosci` i wypchnąć `main`.

**Contract**: `gh repo create naleznosci --private --source . --push`. To akcja zewnętrzna i wymaga potwierdzenia użytkownika przed wykonaniem.

### Success Criteria:

#### Automated Verification:

- `git remote get-url origin` zwraca URL repo `naleznosci`, a `gh repo view --json visibility -q .visibility` zwraca `PRIVATE`
- `git status --porcelain` jest pusty, a `git rev-parse main` = `git rev-parse origin/main`
- `test ! -e .github/workflows/ci.yml` i `grep -q '"name": "naleznosci"' wrangler.jsonc`

#### Manual Verification:

- Repo jest widoczne na GitHubie jako prywatne, bez zakładki Actions z uruchomionymi workflow

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie od człowieka.

---

## Faza 2: Produkcyjny projekt Supabase

### Overview

Tworzymy produkcyjny backend auth, który zachowuje się jak lokalny (bez potwierdzania maila).

### Changes Required:

#### 1. Projekt i auth

**File**: brak (dashboard Supabase)

**Intent**: Utworzyć projekt `naleznosci` w regionie **Central EU (Frankfurt)** i zapisać hasło bazy w menedżerze haseł. Wyłączyć potwierdzanie maila i zostawić włączoną rejestrację.

**Contract**: Authentication → Sign In / Providers → Email: *Confirm email* = OFF, *Allow new users to sign up* = ON. Site URL możemy uzupełnić po Fazie 3, gdy znamy adres Workera: `https://naleznosci.<sub>.workers.dev`.

#### 2. Klucze

**File**: brak (dashboard Supabase)

**Intent**: Pobrać Project URL i klucz **publishable** (`sb_publishable_…`) do Fazy 3. Wartości trzymamy tylko w menedżerze haseł.

**Contract**: Settings → API Keys → Publishable key.

### Success Criteria:

#### Manual Verification:

- Projekt istnieje w regionie Central EU (Frankfurt), hasło DB jest w menedżerze haseł
- *Confirm email* jest wyłączone, rejestracja włączona
- Project URL i klucz `sb_publishable_…` są w menedżerze haseł
- Sekcja „Faza 2” w `deployment-log.md` jest uzupełniona (project ref, region, bez wartości kluczy)

**Implementation Note**: Po zakończeniu fazy zatrzymaj się na ręczne potwierdzenie od człowieka.

---

## Faza 3: Pierwszy ręczny deploy i sekrety

### Overview

Tworzymy Workera na produkcji, podpinamy sekrety i ręcznie sprawdzamy, że logowanie działa.

### Changes Required:

#### 1. Logowanie i deploy

**File**: brak (CLI)

**Intent**: `npx wrangler login`, upewnić się, że konto ma subdomenę `workers.dev`. Potem z czystego `main`: `npm ci && npm run build && npx wrangler deploy`. Wrangler utworzy Workera `naleznosci` i namespace KV dla `SESSION`. Stan przejściowy jest oczekiwany: strona działa, ale logowanie zwraca „Supabase is not configured”.

**Contract**: Wynik zawiera URL `https://naleznosci.<sub>.workers.dev`.

#### 2. Sekrety

**File**: brak (CLI)

**Intent**: `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY`, wklejając wartości w interaktywny prompt (nie jako argument ani przez `echo`), żeby nie zostały w historii shella. Każde polecenie od razu wdraża nową wersję.

**Contract**: `npx wrangler secret list` pokazuje obie nazwy.

#### 3. Site URL w Supabase

**File**: brak (dashboard Supabase)

**Intent**: Ustawić Site URL na adres Workera, żeby ewentualne maile Supabase wskazywały właściwe miejsce.

**Contract**: Authentication → URL Configuration → *Site URL* = `https://naleznosci.<sub>.workers.dev`.

### Success Criteria:

#### Automated Verification:

- `npx wrangler deploy` kończy się kodem 0 i zwraca URL `naleznosci.<sub>.workers.dev`
- `npx wrangler secret list` zawiera `SUPABASE_URL` i `SUPABASE_KEY`

#### Manual Verification:

- W przeglądarce na produkcji działa rejestracja nowym adresem, logowanie, wejście na `/dashboard` i wylogowanie
- Konto testowe jest usunięte w Supabase → Authentication → Users
- Sekcja „Faza 3” w `deployment-log.md` jest uzupełniona (URL Workera, Version ID)

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie od człowieka.

---

## Faza 4: Auto-deploy z GitHuba i dokumentacja

### Overview

Podpinamy repo pod istniejącego Workera, poprawiamy dokumentację i wypychamy ją. Ten push jest pierwszym testem auto-deployu.

### Changes Required:

#### 1. Połączenie repo w Cloudflare

**File**: brak (Dashboard Cloudflare → Workers & Pages → `naleznosci` → Settings → Builds → Connect)

**Intent**: Zainstalować aplikację GitHub „Cloudflare Workers and Pages” z dostępem **tylko** do repo `naleznosci` i skonfigurować build.

**Contract**:
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy` (bez `--config`)
- Root directory: `/`
- Non-production branch builds: **wyłączone**
- Build variables: brak

#### 2. README

**File**: `README.md`

**Intent**: Przepisać `## Deployment` pod nowy setup: push do `main` = deploy przez Workers Builds, awaryjny ręczny deploy `npm run build && npx wrangler deploy`, sekrety tylko przez `wrangler secret put`, na produkcji potwierdzanie maila jest wyłączone, rollback przez Dashboard → Deployments plus `git revert`. Usunąć sekcję `## CI`. W sekcji `## Smoke test` usunąć odniesienia do CI, jeśli są.

**Contract**: sekcje `## Deployment` (przepisana) i `## CI` (usunięta).

#### 3. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Usunąć referencję do nieistniejącego `ci.yml` z sekcji References.

**Contract**: linia `- CI jobs and required secrets: @.github/workflows/ci.yml` usunięta.

#### 4. Tech-stack

**File**: `context/foundation/tech-stack.md`

**Intent**: Poprawić `deployment_target: cloudflare-pages` na `cloudflare-workers` i w „Why this stack” zamienić „Cloudflare Pages, with GitHub Actions auto-deploying” na Cloudflare Workers z Workers Builds.

**Contract**: frontmatter `hints.deployment_target` i jedno zdanie w „Why this stack”.

#### 5. Test auto-deployu

**File**: `context/changes/production-deploy/deployment-log.md`

**Intent**: Zacommitować zmiany 2–4 razem z uzupełnionym logiem i wypchnąć na `main`. Sprawdzić w dashboardzie, że build przeszedł i nowa wersja jest aktywna.

**Contract**: Nowa wersja w Deployments pochodzi z Workers Builds.

### Success Criteria:

#### Automated Verification:

- `grep -q "## CI" README.md` nie znajduje nic, a `grep -q "ci.yml" CLAUDE.md` nie znajduje nic
- `grep -q "cloudflare-workers" context/foundation/tech-stack.md`
- Formatowanie przechodzi: `npx prettier --check README.md CLAUDE.md context/foundation/tech-stack.md`
- `npx wrangler deployments list` pokazuje nową aktywną wersję, różną od wersji z Fazy 3

#### Manual Verification:

- Build w Dashboard → `naleznosci` → Builds zakończył się sukcesem (w logu widać wersję Node)
- Po auto-deployu logowanie w przeglądarce nadal działa (sekrety przetrwały deploy)
- Sekcja „Faza 4” w `deployment-log.md` jest uzupełniona

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie od człowieka.

---

## Testing Strategy

### Unit Tests:

- Nie dotyczy. Jedyna zmiana kodu to `name` w `wrangler.jsonc`.

### Integration Tests:

- Brak, zgodnie z decyzją o najprostszym setupie. `npm run smoke` zostaje jako opcjonalne narzędzie lokalne.

### Manual Testing Steps:

1. Po Fazie 3: rejestracja, logowanie, `/dashboard`, wylogowanie w przeglądarce na produkcji.
2. Po Fazie 4: ponowne zalogowanie po auto-deployu.

## Performance Considerations

Brak zmian. Aplikacja mieści się w darmowym tierze Workers (100k żądań/dzień).

## Migration Notes

Brak migracji danych. Przyszłe migracje SQL wdrażamy ręcznie (`supabase db push`) **przed** pushem kodu, który ich wymaga, bo auto-deploy nie ma bramki.

## References

- Infrastruktura: `context/foundation/infrastructure.md`
- Config: `wrangler.jsonc`, `astro.config.mjs:16-22`, `src/lib/supabase.ts:5-8`
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), [rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Log wdrożenia: `context/changes/production-deploy/deployment-log.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Repozytorium na GitHubie

#### Automated

- [x] 1.1 `origin` wskazuje prywatne repo `naleznosci` — 7d08c00
- [x] 1.2 Working tree czysty, `main` = `origin/main` — 7d08c00
- [x] 1.3 `ci.yml` usunięty, `name` = `naleznosci` w `wrangler.jsonc` — 7d08c00

#### Manual

- [x] 1.4 Repo widoczne na GitHubie jako prywatne, bez uruchomionych workflow — 7d08c00

### Phase 2: Produkcyjny projekt Supabase

#### Manual

- [x] 2.1 Projekt we Frankfurcie, hasło DB w menedżerze haseł — a93471a
- [x] 2.2 *Confirm email* wyłączone, rejestracja włączona — a93471a
- [x] 2.3 Project URL i klucz `sb_publishable_…` w menedżerze haseł — a93471a
- [x] 2.4 Sekcja „Faza 2” w `deployment-log.md` uzupełniona — a93471a

### Phase 3: Pierwszy ręczny deploy i sekrety

#### Automated

- [x] 3.1 `npx wrangler deploy` kończy się sukcesem z URL `naleznosci.<sub>.workers.dev` — 50bd756
- [x] 3.2 `npx wrangler secret list` zawiera `SUPABASE_URL` i `SUPABASE_KEY` — 50bd756

#### Manual

- [x] 3.3 Rejestracja, logowanie, `/dashboard` i wylogowanie działają w przeglądarce — 50bd756
- [x] 3.4 Konto testowe usunięte z Supabase — 50bd756
- [x] 3.5 Sekcja „Faza 3” w `deployment-log.md` uzupełniona — 50bd756

### Phase 4: Auto-deploy z GitHuba i dokumentacja

#### Automated

- [x] 4.1 README bez sekcji `## CI`, CLAUDE.md bez `ci.yml`
- [x] 4.2 tech-stack podaje `cloudflare-workers`
- [x] 4.3 Prettier check przechodzi dla README, CLAUDE.md i tech-stack
- [ ] 4.4 `wrangler deployments list` pokazuje nową wersję z auto-deployu

#### Manual

- [ ] 4.5 Build w Workers Builds zakończony sukcesem
- [ ] 4.6 Logowanie działa po auto-deployu
- [ ] 4.7 Sekcja „Faza 4” w `deployment-log.md` uzupełniona
