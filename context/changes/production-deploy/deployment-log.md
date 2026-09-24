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
| URL Workera | |
| Version ID po `secret put` | |
| Test w przeglądarce — wynik, data | |

## Faza 4: Auto-deploy z GitHuba

| Pole | Wartość |
| --- | --- |
| Commit wyzwalający | |
| Version ID z Workers Builds | |
| Wersja Node w logu buildu | |

## Incydenty / odstępstwa od planu

<!-- Data — co się stało — co zrobiono -->

- 2026-09-24 — Faza 2: projekt Supabase utworzono w regionie West EU (Ireland) zamiast Central EU (Frankfurt) z planu — zaakceptowane, region w UE, bez wpływu na dalsze fazy.
