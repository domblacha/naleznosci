<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ustawienia reguły eskalacji

- **Plan**: context/changes/escalation-settings/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated criteria re-run on 2026-10-10: `supabase migration up` (nothing pending), `astro check` (0 errors), `npm run lint` (clean), `npm test` (143/143), `npm run build` (OK), `npm run smoke` (all steps incl. `settingsSteps` and `snapshotSteps`), grep `DEFAULT_(THRESHOLDS|CHARGE_SETTINGS)` in `src/components/invoices` (no matches).

## Findings

### F1 — Rollback Workera sprzed S-10 psuje oznaczanie i cofanie wpłaty

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql:31; README.md:232
- **Detail**: Constraint `invoices_payment_snapshot_check` wymaga migawki razem z `paid_on`. Stary kod ustawia/czyści tylko `paid_on`, więc po migracji „Zapłacona” i „Przywróć do otwartych” kończą się 500. Plan opisuje krótkie okno między `db push` a `wrangler deploy`, ale sekcja README „Rollback” nadal każe cofnąć Workera w dashboardzie — rollback za ten commit trwale psuje płatności, czego README nie mówi.
- **Fix A ⭐ Recommended**: Dopisać w README (Rollback i/lub Migracje) ostrzeżenie: rollback Workera na wersję sprzed `add_invoice_payment_snapshot` blokuje oznaczanie i cofanie wpłat; zamiast tego revert przez PR lub migracja zdejmująca constraint.
  - Strength: Jedna zmiana w dokumentacji; plan już świadomie przyjął constraint jako niezmiennik.
  - Tradeoff: Ryzyko zostaje, tylko jest opisane.
  - Confidence: HIGH — zgodne z istniejącą notą „Rollback Workera nie cofa schematu”.
  - Blind spot: None significant.
- **Fix B**: Przenieść constraint do osobnej, późniejszej migracji (kolumny + backfill teraz, check w następnym PR).
  - Strength: Stary kod działa po migracji; rollback bezpieczny w oknie przejściowym.
  - Tradeoff: Dwa PR-y; migracja jeszcze niewdrożona, ale trzeba zmienić plik i plan; w oknie bez constraintu stary kod może zapisać płatność bez migawki (wtedy potrzebny ponowny backfill).
  - Confidence: MED — wymaga backfillu w migracji z constraintem.
  - Blind spot: Czy ktoś zdąży użyć starego kodu w oknie.
- **Decision**: SKIPPED (Fix A wybrany, edycja README odrzucona przy potwierdzeniu)

### F2 — Czyste funkcje nadal mają domyślne ustawienia ustawowe

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/charges.ts:81,92,115; src/lib/reminder.ts:35-36; src/lib/escalation.ts:42,56
- **Detail**: `interestGrosze`, `compensationGrosze`, `chargesAsOf`, `buildClientReminders`, `groupInvoices`, `escalationGroup` mają parametry domyślne `DEFAULT_*`. Wszystkie obecne wywołania w komponentach przekazują ustawienia jawnie, ale nowe wywołanie bez nich po cichu zignoruje ustawienia użytkownika — bez błędu typu. Grep z kryterium 3.6 chroni tylko `src/components/invoices`.
- **Fix**: Usunąć wartości domyślne parametrów (uczynić je wymaganymi); testy i `/dev/ui` przekazują `DEFAULT_*` jawnie.
  - Strength: Kompilator wymusza przekazanie ustawień w każdym nowym miejscu.
  - Tradeoff: Zmiany w testach (`charges.test.ts`, `escalation.test.ts`, `reminder.test.ts`) i kitchen sinku.
  - Confidence: HIGH — mechaniczna zmiana, `astro check` wskaże wszystkie miejsca.
  - Blind spot: None significant.
- **Decision**: SKIPPED

### F3 — `?? 0` maskuje brak migawki w historii

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/PaidInvoicesManager.tsx:99; src/components/invoices/PaymentDialog.tsx:93
- **Detail**: `paidRateBp ?? 0` / `paidCompensationGrosze ?? 0` pokazałyby 0 zł odsetek zamiast błędu, gdyby migawki brakowało. Constraint w bazie to dziś wyklucza; to ten sam rodzaj maskującego fallbacku, który plan usunął z `charges.ts` (F2 z S-04).
- **Fix**: Zawęzić typ (np. `PaidInvoice` z niepustymi polami migawki w `listPaidInvoices`) albo pokazać „—” przy `null`.
- **Decision**: SKIPPED

### F4 — Czysta funkcja `settingsInputText` eksportowana z pliku hooka

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/use-settings-form.ts:28
- **Detail**: Pozostałe pliki w `src/components/hooks/` eksportują tylko hooki i typy; formatery (np. `amountInputText`) żyją w `src/lib/format.ts`. `KitchenSinkForms.tsx` importuje helper z hooka.
- **Fix**: Przenieść `settingsInputText` do `src/lib/settings-schemas.ts` (obok parsera odwrotnego) lub `src/lib/format.ts`.
- **Decision**: SKIPPED

### F5 — Podgląd „Zapłacona” może różnić się od zapisanej migawki

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/PaymentDialog.tsx (tryb `mark`)
- **Detail**: Podgląd liczy się z ustawień wczytanych z stroną, a serwer wylicza migawkę z ustawień w chwili zapisu. Po zmianie ustawień w innej karcie podgląd pokaże inne kwoty niż zapisane. Przypadek brzegowy, single-user.
- **Fix**: Zaakceptować; ewentualnie po zapisie pokazać kwoty z odpowiedzi serwera.
- **Decision**: ACCEPTED — przypadek brzegowy (zmiana ustawień w innej karcie), bez zmian w kodzie
