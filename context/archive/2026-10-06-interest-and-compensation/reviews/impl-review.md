<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Odsetki i rekompensata przy przeterminowanych fakturach

- **Plan**: context/changes/interest-and-compensation/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (2 observations) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Plan drift: wszystkie 9 planowanych zmian MATCH (`charges.ts`, `charges.test.ts`, `types.ts`, `services/invoices.ts`, `InvoicesManager.tsx`, `index.astro`, `KitchenSinkForms.tsx`, `README.md`, `roadmap.md`). Warunek `group === "current"` w wyspie jest równoważny planowanemu `daysOverdue ≥ 1` (`escalationGroup` zwraca `current` dokładnie dla `days ≤ 0`). Odświeżenie Baseline/Backlog w roadmapie weszło w commicie 4e92019 razem z artefaktami planu — księgowość `/10x-plan`, nie scope creep.
- Automated (uruchomione 2026-10-06): `npm test` 57/57 ✅; `npm run lint` ✅; `npx astro check` 0 errors ✅; `npm run build` ✅; `npm run smoke` (dev + lokalny Supabase) wszystkie kroki ✅; `gh pr checks 7` checks pass ✅; run 37490330859 na `main`: checks + deploy success ✅.
- Manual: wszystkie pozycje odhaczone; 3.1–3.3 odhaczone w epilogu (92abcc4) po zakończonym deployu, więc nie ma oznak rubber-stampingu.

## Findings

### F1 — `interestGrosze` rzuca wyjątek dla wartości niecałkowitych

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/charges.ts:44
- **Detail**: `BigInt(amountGrosze)`, `BigInt(annualRateBp)` i `BigInt(days)` rzucają `RangeError` dla liczby niecałkowitej. Dziś wejścia są całkowite (zod + `bigint` w bazie, `daysOverdue` z dat), ale wyliczenie działa podczas renderu wyspy bez error boundary, więc jeden zły wiersz wyłożyłby całą listę. Moduł jest „jednym źródłem prawdy” dla S-05/S-06/S-10, a S-10 poda stopę z formularza ustawień (np. 13,75 zamiast 1375).
- **Fix**: Udokumentować w komentarzu, że wszystkie argumenty muszą być liczbami całkowitymi, i dodać test `expect(() => interestGrosze(100.5, 1)).toThrow()`, który przypina to zachowanie; walidację wartości ustawień zostawić S-10 (zod `int()`).
- **Decision**: PENDING

### F2 — Cichy fallback na ostatni próg rekompensaty

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/charges.ts:61
- **Detail**: `?? tiers[tiers.length - 1]` jest nieosiągalne dla `DEFAULT_CHARGE_SETTINGS` (ostatni próg ma `maxAmountGrosze: null`), ale gdy S-10 przekaże progi bez otwartego ostatniego progu, kwota powyżej granicy dostanie po cichu rekompensatę z ostatniego progu zamiast błędu. Typ `[CompensationTier, CompensationTier, CompensationTier]` nie wymusza, że ostatni próg jest otwarty.
- **Fix**: Zawęzić typ do `readonly [BoundedTier, BoundedTier, { maxAmountGrosze: null; compensationGrosze: number }]` i usunąć fallback, żeby kompilator pilnował kształtu ustawień z S-10.
- **Decision**: PENDING
