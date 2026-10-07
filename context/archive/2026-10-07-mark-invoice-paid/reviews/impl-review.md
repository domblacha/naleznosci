<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Oznaczanie faktury jako zapłaconej i widok historii

- **Plan**: context/changes/mark-invoice-paid/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-07
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

Automatyczne kontrole uruchomione w trakcie przeglądu: `npm test` (87/87), `npm run lint`, `npx astro check` (0 błędów), `npm run build`, `npx supabase migration list --local` (20261007120000 zastosowana), `npm run smoke` (wszystkie kroki PASS; port 4321 ubity przed i po). Pliki spoza planu (`FormField.tsx` — prop `max`; `reminder.test.ts` — `paidOn: null`) są konieczne i uzasadnione.

## Findings

### F1 — Nieaktualne „dziś” po północy przy otwartej karcie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/PaymentDialog.tsx:81
- **Detail**: `today` jest liczone raz na serwerze przy renderze `/` i `/history`. Gdy karta zostanie otwarta na noc, „Zapłacona” następnego dnia podpowiada wczorajszą datę; serwer ją przyjmie (nie jest przyszła), więc w bazie ląduje cicho zła data wpłaty, a odsetki i rekompensata są liczone na zły dzień. Do tego `max={today}` i walidacja klienta blokują wybór faktycznego dziś bez przeładowania.
- **Fix**: W `PaymentForm` liczyć `todayInPoland(new Date())` w chwili otwarcia dialogu (np. `useState(() => todayInPoland(new Date()))`) i używać go jako domyślnej daty, `max` i dla `paymentInputSchema`; prop `today` z serwera zostaje tylko dla tabel.
  - Strength: Serwer i tak sprawdza datę per żądanie (`withPaymentInput`), więc klient tylko dogania rzeczywistość; zmiana w jednym komponencie.
  - Tradeoff: Zegar przeglądarki może się różnić od serwera — przy złym zegarze klienta serwer nadal odrzuci przyszłą datę (400), więc ryzyko ograniczone do komunikatu błędu.
  - Confidence: HIGH — `todayInPoland` jest czystą funkcją od `Date`, działa w przeglądarce.
  - Blind spot: Nie sprawdzono, czy `todayInPoland` nie importuje kodu tylko-serwerowego.
- **Decision**: SKIPPED

### F2 — Wartość arbitralna Tailwind w widoku

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/invoices/PaymentDialog.tsx:51
- **Detail**: `grid-cols-[1fr_auto]` łamie regułę CLAUDE.md „no arbitrary values in views”; ESLint go nie łapie (wzorzec obejmuje tylko px/rem i kolory).
- **Fix**: Zastąpić `grid-cols-[1fr_auto]` przez `grid-cols-2` (`dd` ma już `text-right`).
- **Decision**: FIXED — grid-cols-[1fr_auto] → grid-cols-2

### F3 — Treść dialogu znika w trakcie animacji zamykania

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/invoices/InvoicesManager.tsx:57
- **Detail**: `handlePaid` usuwa fakturę ze stanu przed końcem animacji, więc `paying` staje się `null` — opis zmienia się na „Podaj datę wpłaty.”, a formularz znika (krótkie mignięcie). Funkcjonalnie bez wpływu.
- **Fix**: Trzymać ostatnio wybraną fakturę (np. w stanie `payingInvoice` ustawianym przy otwarciu) zamiast wyszukiwać ją w `invoices` po `payingId`.
- **Decision**: SKIPPED

### F4 — Drobne odstępstwa od kontraktu planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/invoices.ts:62
- **Detail**: (a) `listPaidInvoices` sortuje tylko po `paid_on desc`, bez drugiego klucza `number` z planu — kolejność i tak jest poprawna, bo wyspa sortuje `sortPaid` przy montowaniu i po edycji (a sort w bazie nie odtworzy `localeCompare("pl", numeric)`). (b) Reset `usePaymentForm` odbywa się przez remount (`key={invoice.id}` + odmontowanie treści Radix), nie w hooku — działa, ale zależy od braku `forceMount`.
- **Fix**: Dopisać w planie notkę, że źródłem kolejności jest `sortPaid` w wyspie, a reset formularza zapewnia remount.
- **Decision**: FIXED — addendum w plan.md (Critical Implementation Details)

### F5 — Nadpisanie koloru `Alert` przez className w history.astro

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/history.astro:34
- **Detail**: `<Alert variant="destructive" className="text-destructive">` (i to samo na `AlertDescription`) łamie regułę „nie nadpisuj kolorów komponentów ui”; skopiowane z `index.astro:36` i `clients.astro:32`, a nowy `PaidInvoicesManager.tsx` używa już samego wariantu — niespójność.
- **Fix**: Usunąć `className="text-destructive"` z Alertów w `history.astro` (opcjonalnie też w `index.astro` i `clients.astro`).
- **Decision**: FIXED — usunięte nadpisanie className w history.astro, index.astro i clients.astro

### F6 — Historia bez limitu wierszy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/invoices.ts:62
- **Detail**: `listPaidInvoices` nie ma limitu ani paginacji, a historia tylko rośnie. Na skali MVP bez znaczenia.
- **Fix**: Zostawić; dodać paginację/limit, gdy historia urośnie (kandydat na wpis w roadmapie).
- **Decision**: ACCEPTED — skala MVP; paginacja, gdy historia urośnie
