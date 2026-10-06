<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zbiorcze ponaglenie do schowka

- **Plan**: context/changes/collective-reminder/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 7/7 symbols ✓, brief↔plan ✓; kwoty Acme/Żabka z Desired End State przeliczone ręcznie ✓

## Findings

### F1 — Textarea lyra ignoruje rows={18}

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 §1 i §3
- **Detail**: Textarea z rejestru radix-lyra ma `field-sizing-content`, więc rośnie z treścią i ignoruje `rows`. `DialogContent` (fixed, `-translate-y-1/2`) nie ma max-height ani overflow, więc długie ponaglenie wypycha dialog poza ekran.
- **Fix**: `className="field-sizing-fixed"` na Textarea, `rows={18}` zostaje.
- **Decision**: FIXED

### F2 — Nieaktualny krok 3.4 (sender-profile już w roadmapie)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3, Progress 3.4
- **Detail**: Krok kazał dodać S-13 do roadmapy, choć plan sam stwierdza, że już tam jest.
- **Fix**: Usunąć krok 3.4 (decyzja użytkownika; praca zawsze wychodzi z aktualnego `main`).
- **Decision**: FIXED (fix differently — krok usunięty)

### F3 — Remis nazw klientów

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 §3
- **Detail**: Nazwa klienta jest unikalna tylko przy `nip IS NULL`; dwóch klientów z NIP może mieć tę samą nazwę — nieokreślona kolejność i niejednoznaczne etykiety.
- **Fix**: Tie-break po `clientId`.
- **Decision**: SKIPPED

### F4 — Podstawianie pól w szablonie

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 §3 (renderReminder)
- **Detail**: Sekwencyjne `replaceAll` podstawi ponownie pole z nazwy klienta; `\w` nie dopasuje `{termin_zapłaty}`.
- **Fix**: Jedno przejście `replace(/\{([^{}]+)\}/gu, …)` z mapą pól, nieznane pola bez zmian.
- **Decision**: FIXED
