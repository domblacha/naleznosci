<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zbiorcze ponaglenie do schowka

- **Plan**: context/changes/collective-reminder/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Weryfikacja automatyczna (2026-10-06): `npm test` 74/74 ✅, `npm run lint` ✅, `npx astro check` 0 błędów ✅, `npm run build` ✅, PR #9 zmergowany, a przebieg CI/deploy na `main` zakończył się sukcesem ✅. `npm run smoke` nie był uruchamiany w ramach przeglądu, bo wymaga dev servera i lokalnego Supabase. Zmiana nie dotyka API ani bazy.

## Findings

### F1 — `/dev/ui` się wysypuje: `ReminderDialogView` renderuje `DialogTitle` poza `<Dialog>`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Success Criteria
- **Location**: src/components/invoices/ReminderDialog.tsx:47-54, src/components/dev/KitchenSinkForms.tsx:243-276
- **Detail**: Prezentacyjny `ReminderDialogView` zawiera `DialogHeader`, `DialogTitle` i `DialogDescription`. Radix `Dialog.Title` wymaga kontekstu Dialog i bez niego rzuca „`DialogTitle` must be used within `Dialog`” (potwierdzone przez `renderToString`). Kitchen sink renderuje widok bez `<Dialog>` w `KitchenSinkForms client:load`, więc SSR `/dev/ui` pada. Wzorzec z sąsiednich komponentów trzyma nagłówek w wrapperze (`InvoiceFormDialog.tsx:156-159`, `ClientFormDialog.tsx:114-117`), a `InvoiceFormView` i `ClientFormView` nie mają nagłówka. Punkt 2.11 („/dev/ui pokazuje stany dialogu… w trybie jasnym i ciemnym”) jest odhaczony, choć z tym kodem nie mógł przejść.
- **Fix**: Przenieść blok `DialogHeader` z `ReminderDialogView` do `ReminderContent`, czyli do wnętrza `DialogContent` nad widokiem, tak jak w `InvoiceFormDialog`. W kitchen sinku tytuł pełni nagłówek `Section`. Potem otworzyć `/dev/ui` i sprawdzić render w trybie jasnym i ciemnym.
- **Decision**: FIXED — nagłówek przeniesiony do `ReminderContent`, a z `ReminderDialogView` i kitchen sinka usunięty prop `reminder`. SSR `KitchenSinkForms` sprawdzony przez `renderToString`, lint ✅

### F2 — Nakładające się kopiowania i timer po odmontowaniu w `useCopyToClipboard`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/use-copy-to-clipboard.ts:25-40
- **Detail**: `clearTimer()` jest wywoływany przed `await`. Przy dwóch szybkich kliknięciach z oczekującymi obietnicami wcześniejsze kliknięcie zakłada timer A, a późniejsze nadpisuje `timerRef` bez czyszczenia A. A przedwcześnie przywraca `idle`, a spóźniona porażka może nadpisać `copied` stanem `error`. Gdy `writeText` rozwiąże się po odmontowaniu, timer powstaje już po cleanupie. W React 19 to nieszkodliwe, ale łamie kontrakt planu „timer czyszczony przy odmontowaniu”.
- **Fix**: Licznik żądań (`const id = ++seqRef.current`). Po `await` ignorować nieaktualne wywołania i wywołania po odmontowaniu (`mountedRef`), a `clearTimer()` wywołać po `await`, tuż przed ustawieniem statusu.
- **Decision**: SKIPPED

### F3 — Po nieudanym kopiowaniu tekst jest zaznaczony, ale pole nie ma fokusu; ponowna porażka nie zaznacza tekstu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/ReminderDialog.tsx:41-44
- **Detail**: `select()` działa, gdy fokus jest nadal na przycisku „Kopiuj do schowka”. Ctrl+C/⌘C z komunikatu błędu może więc nic nie skopiować. Efekt zależy tylko od przejścia w `error`, więc druga porażka z rzędu nie zaznacza tekstu ponownie. W `/dev/ui` przykład błędu zaznacza pole przy montowaniu, co po naprawie F1 może przewinąć stronę.
- **Fix**: Wywołać `textareaRef.current?.focus()` przed `select()` i robić to przy każdej porażce (np. z handlera kopiowania albo przez licznik porażek), a nie tylko przy zmianie statusu.
- **Decision**: SKIPPED
