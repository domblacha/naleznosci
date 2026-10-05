# Potok wdrożenia z migracjami — Plan Brief

> Full plan: `context/changes/deploy-pipeline-with-migrations/plan.md`

## What & Why

F-01 z roadmapy: jeden potok GitHub Actions, który na PR uruchamia kontrole, a po merge na `main` stosuje migracje na produkcyjnym Supabase i dopiero potem wdraża Workera. Dziś push na `main` wdraża tylko kod (Workers Builds), a migracje idą ręcznie. Lokalny `main` ma już kod S-02 zależny od pierwszej migracji, więc zwykły push zepsułby produkcję.

## Starting Point

Nie ma CI (`.github/` nie istnieje). Wdraża Workers Builds przy każdym pushu na `main`. Lokalny `main` jest 4 commity przed `origin/main` (S-02 z migracją `create_clients`, vitestem i skryptem `test`). Repo jest prywatne, na darmowym planie, więc bez reguł gałęzi i bramek środowisk.

## Desired End State

Praca idzie przez gałąź i PR. PR dostaje zielone lub czerwone `checks` (lint, typy, testy, build). Merge uruchamia `deploy`: build → `supabase db push` → `wrangler deploy`, serializowany i z sekretami dostępnymi tylko temu jobowi. Workers Builds jest odłączone. Migracja `create_clients` i kod S-02 są na produkcji, wdrożone przez potok.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Bramka migracji | Automatycznie po merge na `main` | Jedna ścieżka bez klikania; na darmowym planie i tak nie ma bramki środowiska | Plan |
| Weryfikacja migracji na PR | Brak, tylko lint/testy/typy/build | Najprostszy potok; zła migracja zatrzyma `deploy` przed wdrożeniem kodu | Plan |
| Workers Builds | Odłączone całkowicie, bez podglądów per PR | Zero ryzyka podwójnego wdrożenia, jedno źródło prawdy | Plan |
| Po wdrożeniu | Nic, potok kończy się na `wrangler deploy` | Bez śmieciowych kont na produkcji i bez dodatkowej logiki | Plan |
| „Tylko przez PR” | Umowa w README, bez rulesetów | Rulesety wymagają płatnego planu; kolejność baza → kod gwarantuje potok | Plan |
| Pierwsze uruchomienie | Pusty przebieg z `origin/main`, S-02 drugim merge | Łańcuch sekretów i narzędzi sprawdzony, zanim dotknie schematu | Plan |
| Kolejność w `deploy` | build → `db push` → `wrangler deploy` | Zepsuty build nie dotyka bazy, a kod nigdy nie wyprzedza schematu | Plan |

## Scope

**In scope:**
- `.github/workflows/ci.yml` (`checks` + `deploy`)
- odłączenie Workers Builds i 5 sekretów repo
- rebase i wdrożenie S-02 przez potok
- README: potok, umowa PR, sekrety, rollback

**Out of scope:**
- lokalny Supabase / dry-run migracji na PR
- ręczne zatwierdzanie wdrożeń
- health check i smoke po wdrożeniu
- podglądy per PR
- rulesety gałęzi
- automatyczny rollback

## Architecture / Approach

```
PR ──────────► checks (lint → astro check → test → build)
push main ───► checks ──► deploy [concurrency: production]
                           build → supabase link + db push → wrangler deploy
```

Sekrety `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` trafiają tylko do env jobu `deploy`. Sekrety runtime Workera zostają bez zmian.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Workflow potoku | `ci.yml` na gałęzi z `origin/main` (bez S-02) | Błąd YAML lub kroków wyjdzie dopiero na PR |
| 2. Przygotowanie produkcji i pusty przebieg | Workers Builds odłączone, sekrety, merge, zielony `deploy` bez migracji | Pominięcie odłączenia → podwójne wdrożenie; `db push` przy braku katalogu migracji |
| 3. S-02 przez potok | rebase S-02, `npm test` w kontrolach, README, migracja `create_clients` na produkcji | Częściowa porażka (schemat jest, kod nie) → „Re-run failed jobs” |

**Prerequisites:** dostęp do dashboardów Cloudflare i Supabase (produkcja), `gh` zalogowany z prawem do sekretów repo.
**Estimated effort:** ~1 sesja; fazy 2–3 to głównie operacje i czekanie na Actions.

## Open Risks & Assumptions

- Brak weryfikacji migracji przed merge: błędny SQL wychodzi dopiero w `deploy`, a `main` jest wtedy czerwony do czasu migracji naprawczej.
- Bezpośredni push na `main` jest technicznie możliwy (brak rulesetów), ale przechodzi przez te same kontrole przed migracją.
- Zakładamy, że `supabase db push` bez katalogu `supabase/migrations/` kończy się sukcesem. Jeśli nie, dodajemy `.gitkeep`.
- Brak sprawdzenia po wdrożeniu: zepsuty runtime (np. ryzyko `astro:env` #16790) trzeba zauważyć ręcznie.

## Success Criteria (Summary)

- Merge PR na `main` sam stosuje migracje i potem wdraża kod, bez kroków ręcznych.
- Merge S-02 przez potok kończy się zieloną zakładką Actions, a `/clients` działa na produkcji.
- Nie ma drugiego wdrażającego: Cloudflare pokazuje wdrożenia wyłącznie z Actions.
