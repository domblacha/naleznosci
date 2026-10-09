<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dezaktywacja i przywracanie klienta

- **Plan**: context/changes/client-deactivate-restore/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automatyczna weryfikacja (2026-10-09): `npx astro check` 0 błędów, `npm run lint` czysto, `npm test` 103/103, `npm run build` OK, `npm run smoke` wszystkie kroki zielone (w tym `deactivationSteps`). Migracja `20261009120000` była już zastosowana lokalnie (`migration list --local`).

Poza planem: dodatkowe kroki smoke („restore client again”, „invalid id → 404”), statusy w `context/foundation/roadmap.md`, wyrównanie tabeli Auth routes w README przez prettier. Wszystko nieszkodliwe.

## Findings

### F1 — Wyszukiwanie usuniętego duplikatu traktuje `*` jako wildcard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/clients.ts:71
- **Detail**: `toDuplicateCode` escapuje `\`, `%` i `_`, ale PostgREST traktuje `*` w `ilike` jako alias `%`. Dla nazwy z `*` (np. „A*”) zapytanie może trafić w inny wiersz bez NIP, a `limit(1)` bez sortowania wybierze dowolny. Użytkownik zobaczy wtedy `duplicate_name_inactive` zamiast `duplicate_name` albo odwrotnie. Dane są bezpieczne, błędna jest tylko treść komunikatu 409.
- **Fix**: Usunąć `limit(1)`, pobierać `name, deactivated_on` i wybierać w JS wiersz z `name.toLowerCase() === input.name.toLowerCase()`. `ilike` zostaje jako filtr wstępny, a wildcardy przestają mieć wpływ na wynik.
- **Decision**: FIXED

### F2 — Funkcje triggerów bez ustalonego `search_path`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_add_client_deactivated_on.sql:16, :39
- **Detail**: `clients_guard_deactivation` i `invoices_guard_client_active` nie mają `set search_path`. Są `security invoker` i używają w pełni kwalifikowanych nazw `public.*`, więc realne ryzyko jest minimalne, ale linter Supabase oznaczy je jako `function_search_path_mutable`. Migracja nie jest jeszcze na produkcji (branch nie został zmergowany), jest zastosowana tylko lokalnie.
- **Fix A ⭐ Recommended**: Dopisać `set search_path = ''` do obu funkcji w tym samym pliku przed merge, a lokalnie odtworzyć funkcje przez `create or replace` (bez `db reset`).
  - Strength: Jedna migracja na wycinek, produkcja dostaje od razu poprawną wersję.
  - Tradeoff: Lokalna baza wymaga ręcznego `create or replace`, bo `migration up` nie zastosuje ponownie już zastosowanego pliku.
  - Confidence: HIGH — plik nie trafił jeszcze na produkcję.
  - Blind spot: Nie wiadomo, czy migracja jest zastosowana na innej bazie niż lokalna dev.
- **Fix B**: Nowa migracja `alter function … set search_path = ''`.
  - Strength: Nie rusza zastosowanego pliku, `migration up` wystarczy lokalnie.
  - Tradeoff: Dodatkowy plik migracji poprawiający coś, czego produkcja jeszcze nie ma.
  - Confidence: HIGH — standardowy wzorzec.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A; lokalnie `alter function … set search_path = ''`)

### F3 — Niezmiennik zakłada READ COMMITTED, co nie jest zapisane

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_add_client_deactivated_on.sql:20-27, :44-49
- **Detail**: W REPEATABLE READ `exists` w `clients_guard_deactivation` po odczekaniu na blokadę nie zobaczyłby właśnie zatwierdzonej faktury. PostgREST działa w READ COMMITTED, więc dziś jest to bezpieczne, ale założenie nie jest zapisane w komentarzu migracji.
- **Fix**: Dopisać jedno zdanie w komentarzu migracji (razem z F2A) albo przy `HAS_OPEN_INVOICES_MESSAGE` w serwisie.
- **Decision**: FIXED

### F4 — „Nie masz jeszcze klientów” przy samych usuniętych klientach

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/clients/ClientsManager.tsx:86-87
- **Detail**: Gdy wszyscy klienci są usunięci, pusty stan „Nie masz jeszcze klientów” wyświetla się nad sekcją „Usunięci klienci (n)” i jej przeczy.
- **Fix**: Przy `deactivated.length > 0` pokazać inny tekst, np. „Nie masz aktywnych klientów”.
- **Decision**: FIXED

### F5 — Błąd przywracania zostaje widoczny po kolejnych akcjach

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/clients/ClientsManager.tsx:63
- **Detail**: `restoreError` jest czyszczony tylko na starcie następnego przywracania, więc nieaktualny komunikat zostaje widoczny po udanym usunięciu albo edycji klienta.
- **Fix**: `setRestoreError(null)` także w `handleDeactivated`.
- **Decision**: FIXED

### F6 — Odstęp przycisków w wierszu inaczej niż w sąsiednich komponentach

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/clients/ClientsManager.tsx:138
- **Detail**: Przyciski „Edytuj” i „Usuń” rozdziela `{" "}`, a `InvoicesManager.tsx:183` i `PaidInvoicesManager.tsx:107` używają `space-x-2` na komórce.
- **Fix**: `className="space-x-2 text-right whitespace-nowrap"` na komórce i usunięcie `{" "}`.
- **Decision**: FIXED
