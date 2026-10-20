# Bramki jakości — testy integracyjne w CI i hooki agenta — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`
> Research: `context/changes/testing-quality-gates/research.md`

## What & Why

Faza 3 test-planu utrwala ochronę ryzyk #1–#6. Testy integracyjne (niedozwolone
przejścia stanu, cudze id, walidacja serwera) mają zatrzymywać zmianę w CI, a nie
tylko biec lokalnie. Agent ma dostawać szybki sygnał w pętli edycji zamiast
dowiadywać się o regresji dopiero w lint-staged lub CI.

## Starting Point

CI ma jeden job `checks` (lint, `astro check`, `npm test`, build), od którego zależy
`deploy`; testy integracyjne biegną tylko lokalnie. Zestaw integracyjny jest gotowy
na CI bez zmian w kodzie. W projekcie nie ma żadnego hooka agenta.

## Desired End State

Każdy PR ma osobny status `integration` na świeżym lokalnym Supabase; push na
`main` wdraża tylko, gdy `checks` i `integration` są zielone. Edycja pliku przez
agenta od razu zwraca błędy lintu i powiązanych testów unit, a koniec tury sprawdza
całość (lint zmienionych, `npm test`, `astro check`). Hooki są udowodnione testem
w `npm test`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wymuszenie bramki | Integracja na PR i push do `main`; `deploy.needs: [checks, integration]` | Bez branch protection to jedyny sposób, by czerwony test nie trafił na produkcję | Plan |
| Układ workflow | Osobny job `integration` równoległy do `checks` | Nie wydłuża `checks`, czytelny osobny status, bez `astro sync`/build | Plan |
| Usługi Supabase w CI | `supabase start -x` wszystkiego poza `gotrue`, `postgrest`, `kong` | Mniej obrazów do pobrania; tylko te usługi są używane przez testy | Research |
| Brakujący seed | Pusty `supabase/seed.sql` | Usuwa wskazanie na nieistniejący plik, zero wpływu na dane | Plan |
| `it.fails` | Brak specjalnej obsługi — zwykły kod wyjścia `vitest run` | Expected fail daje exit 0; załatana luka czerwieni CI zgodnie z §6.5 | Research |
| Zakres hooków | `PostToolUse` (eslint + `vitest related --project unit`) + `Stop` (lint zmienionych, `npm test`, `astro check`) | `Stop` łapie edycje przez shell i błędy typów całego projektu; ~10 s | Plan |
| Integracja w hooku | Nie | Zależy od lokalnego stosu i współdzielonej bazy; CI to pokrywa | Plan |
| Wykonanie hooków | Faza wywołuje `/10x-configure-hook` z decyzjami planu | Skill niesie protokół sygnałów i przypadki dowodowe — plan ich nie duplikuje | Plan |
| Test dowodowy | `scripts/__tests__/agent-hooks.test.ts`, `include` projektu `unit` rozszerzony o `scripts/**/*.test.ts` | Biegnie w istniejącym `npm test`, więc też w CI, bez nowego joba | Plan |

## Scope

**In scope:**
- Job `integration`, `deploy.needs`, pusty `seed.sql`, tabela CI w README
- `.claude/settings.json` + skrypty hooków, test dowodowy, wpięcie w `npm test`
- Aktualizacja test-planu (§3, §5, §6.5)

**Out of scope:**
- Branch protection, cache obrazów Dockera, integracja w hooku agenta
- Zmiany husky/lint-staged, `[inbucket]` → `[local_smtp]`, łatanie luk `db-gaps`, smoke w CI

## Architecture / Approach

CI: `pull_request`/push → `checks` ∥ `integration` (`npm ci` → `supabase start -x …`
→ `test:integration`) → `deploy` (tylko `main`, po obu). Pętla agenta: Edit/Write →
`PostToolUse` (jeden plik) → sygnał do agenta; koniec tury → `Stop` (sweep `git diff`
+ nieśledzone, jedna szansa przez `stop_hook_active`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Integracja w CI | Osobny status `integration` na PR, `deploy` czeka | Czas pobierania obrazów; `-x` lub seed mogą wymagać korekty po pierwszym przebiegu |
| 2. Hooki agenta | `PostToolUse` + `Stop` przez `/10x-configure-hook`, test w `npm test` | Test hooków nie może dotykać drzewa dewelopera ani spowalniać `npm test` |

**Prerequisites:** Docker lokalnie (do sprawdzenia `-x`), branch `feat/testing-quality-gates` z aktualnego `main`.
**Estimated effort:** ~1–2 sesje w 2 fazach.

## Open Risks & Assumptions

- Lista `-x` zakłada, że `gotrue`/`postgrest`/`kong` wystarczą; jeśli `start` lub `status -o env` padnie, przywrócić brakującą usługę.
- Czas joba `integration` w CI jest niezmierzony; jeśli będzie uciążliwy, osobna zmiana na cache obrazów.
- `npm test` urośnie o test hooków (git + eslint stub); musi zostać w rzędzie sekund.

## Success Criteria (Summary)

- Czerwony test integracyjny daje czerwony PR i blokuje `deploy`.
- Agent widzi błąd lintu lub testu w tej samej turze, w której go wprowadził.
- Hooki mają powtarzalny dowód w `npm test`.
