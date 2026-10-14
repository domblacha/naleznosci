<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Przejścia stanu, izolacja i walidacja przez API

- **Plan**: context/changes/testing-api-state-and-isolation/plan.md
- **Mode**: Deep (weryfikacja kodu inline)
- **Date**: 2026-10-14
- **Verdict**: REVISE → SOUND po poprawkach
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 ścieżek ✓, 8/8 symboli ✓, brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Logowanie hasłem podlega limitowi 30 / 5 min
- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots · **Location**: Phase 1 (harness)
- **Detail**: `sign_in_sign_ups` (config.toml:190) liczy też logowania; ok. 8 na przebieg, kilka przebiegów w 5 min daje 429.
- **Decision**: FIXED (Fix A — podniesienie limitu w config.toml, nowa sekcja 5 w Fazie 1)

### F2 — Brak straży na adres docelowy przy service_role
- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots · **Location**: Phase 1 (global-setup)
- **Detail**: `deleteUser` kluczem service_role bez sprawdzenia hosta; `listUsers` tylko pierwsza strona.
- **Decision**: FIXED (straż hosta localhost + paginacja)

### F3 — `it.fails` może przejść przez błąd fixture
- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Plan Completeness · **Location**: Phase 4 (db-gaps)
- **Detail**: dowolny wyjątek w ciele zalicza test.
- **Decision**: FIXED (fixtures w hookach, asercja na błąd, test kontrolny)

### F4 — Szczegóły konfiguracji Vitest/supabase-js
- **Severity**: OBSERVATION · **Impact**: 🏃 LOW · **Dimension**: Plan Completeness · **Location**: Phase 1
- **Decision**: FIXED (`test.name`, `extends: true`, `configDefaults.exclude`, opcje klienta)

### F5 — Edycja z cudzym clientId zależy od stanu faktury
- **Severity**: OBSERVATION · **Impact**: 🏃 LOW · **Dimension**: Plan Completeness · **Location**: Phase 3
- **Decision**: FIXED (faktura B w stanie `open-current`)
