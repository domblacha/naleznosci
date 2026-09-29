# Deployment produkcyjny (GitHub + Cloudflare Workers + Supabase) — Plan Brief

> Full plan: `context/changes/production-deploy/plan.md`
> Log wdrożenia: `context/changes/production-deploy/deployment-log.md`

## What & Why

Wrzucamy projekt „Należności” do prywatnego repo na GitHubie i podpinamy je pod Cloudflare, tak żeby push do `main` sam wdrażał aplikację. Robimy to w najprostszym możliwym setupie: bez GitHub Actions / CI, bez runbooków i bez automatycznych testów.

## Starting Point

Projekt ma już skonfigurowany adapter Cloudflare. Brakuje remote'a na GitHubie, zalogowanego `wrangler` i projektu Supabase w chmurze. Worker nadal nazywa się `10x-astro-starter`. `ci.yml` został usunięty, ale README i CLAUDE.md wciąż go opisują.

## Desired End State

Aplikacja działa pod `https://naleznosci.<sub>.workers.dev`, a rejestracja i logowanie działają. Push do `main` automatycznie buduje i wdraża nową wersję. Dokumentacja opisuje ten setup i nie wspomina o CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CI | Brak (usunięty `ci.yml`) | Najprostszy setup: tylko GitHub + Cloudflare. | Plan |
| Auto-deploy | Workers Builds z `main`, inne branche wyłączone | Deploy bez GH Actions i tokenów CF w GitHubie. | Research |
| Pierwszy deploy | Ręczny `wrangler deploy` + `secret put`, potem Connect repo | Sekrety są ustawione, zanim ruszy auto-deploy. | Plan |
| Supabase | Projekt Free we Frankfurcie, bez potwierdzania maila | Wbudowany SMTP nie wyśle maili zewnętrznym użytkownikom. | Research |
| Klucz | `sb_publishable_…` | Legacy `anon` wycofywany, `secret` omija RLS. | Research |
| Dokumentacja | Sekcja Deployment w README, usunięte wzmianki o CI | Minimum, które jest prawdziwe po zmianie. | Plan |
| Weryfikacja | Ręczne kliknięcie w przeglądarce | Bez smoke'ów i testu kanarka. | Plan |

## Scope

**In scope:**
- Nazwa Workera `naleznosci`, commit usunięcia CI, prywatne repo i push
- Projekt Supabase i jego konfiguracja auth
- Ręczny pierwszy deploy i sekrety
- Workers Builds z `main`
- README (Deployment, usunięte CI), CLAUDE.md, tech-stack

**Out of scope:** GitHub Actions, branch protection, smoke/kanarek, runbook, health check, monitoring, backupy, PR previews, staging, własna domena, custom SMTP, zmiany w kodzie auth.

## Architecture / Approach

Push do GitHub `main` → Workers Builds (`npm run build` → `npx wrangler deploy`) → Worker `naleznosci` (sekrety runtime `SUPABASE_URL`/`SUPABASE_KEY`, KV `SESSION`) → Supabase Auth (Frankfurt). Pierwszy deploy robimy ręcznie, żeby Worker istniał pod właściwą nazwą i miał sekrety przed podpięciem Builds.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Repozytorium na GitHubie | Prywatne repo, nazwa `naleznosci`, CI usunięte | — |
| 2. Projekt Supabase | Prod auth bez potwierdzania maila | Domyślnie włączone potwierdzanie |
| 3. Pierwszy deploy + sekrety | Działająca produkcja z logowaniem | Brak subdomeny workers.dev |
| 4. Auto-deploy + dokumentacja | Push do `main` = deploy, poprawione docs | Niezgodna nazwa Workera lub wersja Node w buildzie |

**Prerequisites:** konta GitHub, Cloudflare i Supabase; `gh` CLI; menedżer haseł.
**Estimated effort:** ~1 sesja.

## Open Risks & Assumptions

- Auto-deploy nie ma żadnej bramki: każdy push do `main` trafia na produkcję. Przed pushem warto lokalnie uruchomić `npm run build`.
- Supabase Free pauzuje projekt po 7 dniach bez ruchu i nie robi backupów. Świadomie bez automatyzacji.
- Node 24.21.0 z `.nvmrc` nie jest preinstalowany w obrazie buildów. Fallback: zmienna buildu `NODE_VERSION=24.18.0`.

## Success Criteria (Summary)

- Logowanie działa na produkcji po ręcznym deployu i po auto-deployu.
- Push do `main` wdraża nową wersję bez ręcznych kroków.
