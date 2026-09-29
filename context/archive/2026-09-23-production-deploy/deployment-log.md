# Deployment Log — production-deploy

> Dowody wykonania faz z `plan.md`. **Nigdy nie wpisuj tu wartości sekretów** (kluczy, haseł, tokenów). Identyfikatory (project ref, Version ID) nie są sekretami.
> Checkboxy postępu żyją w `plan.md` → `## Progress`.

## Faza 1: Repozytorium na GitHubie

| Pole | Wartość |
| --- | --- |
| Repo GitHub (URL) | https://github.com/domblacha/naleznosci (private) |
| Commit po pierwszym pushu | `7d08c00` |

## Faza 2: Produkcyjny projekt Supabase

| Pole | Wartość |
| --- | --- |
| Project ref | `womquliamvtreafdlizc` |
| Region | West EU (Ireland) — `eu-west-1` |
| Confirm email / sign-up | OFF / ON |
| Klucze | Project URL + `sb_publishable_…` w menedżerze haseł |

## Faza 3: Pierwszy ręczny deploy i sekrety

| Pole | Wartość |
| --- | --- |
| URL Workera | https://naleznosci.domblacha.workers.dev |
| Version ID po `wrangler deploy` | `516aa680-d81a-45b2-8cb1-208275571deb` |
| Version ID po `secret put` | `eb4620f6-471f-46de-bd4d-30b3e5a9d35f` (błędny sekret) → aktywna po poprawce: `e1983abd-f217-4a01-9aa9-52f3c3f605c7` |
| KV namespace `SESSION` | `naleznosci-session` (`a2af1e0d1fad42c6b65575224d605946`) |
| Sekrety | `SUPABASE_URL`, `SUPABASE_KEY` (`wrangler secret list`) |
| Site URL w Supabase | https://naleznosci.domblacha.workers.dev |
| Test w przeglądarce — wynik, data | PASS — rejestracja, logowanie, `/dashboard`, wylogowanie; konto testowe usunięte — 2026-09-24 |

## Faza 4: Auto-deploy z GitHuba

| Pole | Wartość |
| --- | --- |
| Commit wyzwalający | `9a583f3` |
| Version ID z Workers Builds | `f6fcb1a2-8c13-4350-8df1-b630952fbbb3` (aktywna ~45 s po pushu) |
| Wersja Node w logu buildu | nie odnotowano (`.nvmrc` = 24.21.0) |
| Test po auto-deployu — wynik, data | PASS — build w Workers Builds OK, logowanie działa, sekrety przetrwały deploy — 2026-09-24 |

Repo podpięte w Dashboard → `naleznosci` → Settings → Builds ręcznie (wrangler 4.131.1 nie ma komendy do podpinania Git; token OAuth wranglera nie ma dostępu do API Workers Builds).

## Incydenty / odstępstwa od planu

<!-- Data — co się stało — co zrobiono -->

- 2026-09-24 — Faza 2: projekt Supabase utworzono w regionie West EU (Ireland) zamiast Central EU (Frankfurt) z planu — zaakceptowane, region w UE, bez wpływu na dalsze fazy.
- 2026-09-24 — Faza 3: pierwszy `wrangler deploy` zakończył się błędem rejestracji subdomeny workers.dev (wrangler próbował `10x-astro-starter`, nazwa zajęta); Worker nie powstał. Subdomena konta `domblacha.workers.dev` była już ustawiona w dashboardzie — ponowny deploy przeszedł.
- 2026-09-24 — Faza 3: `supabase/config.toml` → `project_id = "naleznosci"` (prefiks lokalnych kontenerów). Odstępstwo od „bez zmian poza `wrangler.jsonc`” — zaakceptowane. Lokalny Supabase uruchomiony, `.env`/`.dev.vars` (gitignored) wskazują `127.0.0.1:54321`, `npm run smoke` lokalnie 8/8 PASS.
- 2026-09-24 — Faza 3: rejestracja/logowanie na produkcji zwracało `Unexpected token 'e', "error code: 1003" is not valid JSON` (Cloudflare 1003 — nieprawidłowy host w zapytaniu do Supabase). Przyczyna: błędna wartość sekretu Workera. Sekrety ustawione ponownie — działa.
