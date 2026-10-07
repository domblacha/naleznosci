# Oznaczanie faktury jako zapłaconej i widok historii — plan implementacji

## Overview

S-06 z roadmapy (US-02, FR-004, FR-006, FR-010): użytkownik oznacza otwartą fakturę jako zapłaconą w całości, podając datę wpłaty. Faktura natychmiast znika z listy otwartych faktur i z ponagleń i pojawia się na nowej stronie `/history` z odsetkami i rekompensatą policzonymi do dnia wpłaty. W historii datę wpłaty można zmienić albo przywrócić fakturę do otwartych.

## Current State Analysis

- Tabela `invoices` nie ma pola stanu — każda faktura jest „otwarta” (`supabase/migrations/20261005120000_create_invoices.sql`). Polityka `invoices_update_authenticated` już istnieje (właściciel może aktualizować swoje wiersze), twarde usuwanie jest zablokowane.
- `listInvoices` (`src/lib/services/invoices.ts`) zwraca wszystkie faktury właściciela; `src/pages/index.astro` przekazuje je do wyspy `InvoicesManager`.
- `InvoicesManager` (`src/components/invoices/InvoicesManager.tsx`) trzyma faktury w stanie i przekazuje tę samą tablicę do `RemindersSection` → `buildClientReminders` (`src/lib/reminder.ts:32`). Usunięcie faktury ze stanu usuwa ją jednocześnie z grup i z ponagleń.
- Odsetki i rekompensata to czyste funkcje `interestGrosze(amount, days, rateBp)` / `compensationGrosze(amount, days, flag, tiers)` (`src/lib/charges.ts`) ze stałą `DEFAULT_CHARGE_SETTINGS`; dni liczy `daysOverdue(dueDate, today)` (`src/lib/escalation.ts`), dzień „dziś” to `todayInPoland(new Date())` liczone na serwerze.
- Endpointy faktur: tylko `POST /api/invoices` ze wspólnym strażnikiem `withInvoiceInput` (`src/lib/services/invoices-api.ts`). Wzorzec trasy `[id]` z walidacją `z.uuid()` parametru: `src/pages/api/clients/[id].ts`.
- Middleware chroni `/` dokładnie i prefiksy z `PROTECTED_ROUTES` (`src/middleware.ts:6`); Topbar ma linki „Faktury” i „Klienci” (`src/components/Topbar.astro:7`).
- Smoke (`scripts/smoke.mjs:126`) ma kroki faktur dla dwóch użytkowników (`jar`, `jarB`) — gotowe miejsce na kroki wpłaty i izolacji.

## Desired End State

- Każdy wiersz listy otwartych faktur ma przycisk „Zapłacona”. Otwiera dialog z datą wpłaty (domyślnie dziś) i podglądem dni opóźnienia, odsetek i rekompensaty na tę datę. Po zapisie faktura znika z grupy, a jeśli była ostatnią fakturą klienta na etapach 1–4 — także wiersz klienta w „Ponagleniach”.
- Data wpłaty nie może być późniejsza niż dziś (czas polski); wpłata przed terminem jest dozwolona i daje 0 dni, 0 zł odsetek, 0 zł rekompensaty.
- `/history` (link „Historia” w Topbarze, chroniona) pokazuje zapłacone faktury od najnowszej wpłaty: klient, numer, kwota, termin, data wpłaty, dni opóźnienia, odsetki, rekompensata. Kwoty nie zmieniają się z upływem dni.
- W historii „Zmień datę” otwiera ten sam dialog z bieżącą datą wpłaty; „Przywróć do otwartych” od razu (bez potwierdzenia) czyści datę wpłaty i usuwa wiersz z historii — faktura wraca na `/` na etap wynikający z aktualnej liczby dni po terminie.
- Cudza lub nieistniejąca faktura daje 404 w API.

### Key Discoveries:

- `src/lib/services/invoices.ts:58` — `listInvoices` to jedyne źródło listy na `/`; filtr `paid_on is null` w tym miejscu wystarcza do FR-006 dla listy i ponagleń.
- `src/lib/services/invoices-api.ts` — strażnik auth/config/JSON/zod; nowy endpoint potrzebuje analogicznego strażnika dla wejścia wpłaty (inny schemat, ten sam kształt błędów `invalid_input` + `fieldErrors`).
- `src/lib/invoice-schemas.ts` — `isValidDueDate` (format i zakres 2000–2100) do ponownego użycia dla daty wpłaty.
- `src/components/invoices/InvoicesManager.tsx` / `RemindersSection.tsx` — wzorzec dialogu bez `DialogTrigger` z ręcznym przywracaniem fokusu (`openerRef`).
- `src/components/hooks/use-invoice-form.ts` — wzorzec hooka formularza (walidacja zod po stronie klienta, mapowanie statusów 400/404 na błędy pól, `serverError`).

## What We're NOT Doing

- Częściowe wpłaty (PRD §Non-Goals).
- Zapisywanie kwot odsetek i rekompensaty w bazie („snapshot”) — liczymy je z `paid_on` funkcjami z `charges.ts`. Gdy S-10 wprowadzi ustawienia użytkownika, zdecyduje, czy historia ma zostać zamrożona na stopie z dnia wpłaty.
- Anulowanie faktur i anulowane w historii (S-07), wstrzymanie (S-08).
- Filtrowanie i sortowanie historii (poza stałą kolejnością od najnowszej wpłaty) — S-11 dotyczy listy otwartych.
- Potwierdzenie przed „Przywróć do otwartych”.
- Kolumna statusu / enum — stan wynika z `paid_on`.

## Implementation Approach

Jedna nullowalna kolumna `paid_on date` jako cały stan „zapłacona”. Jeden zasób API `/api/invoices/[id]/payment`: `PUT { paidOn }` ustawia datę (zarówno oznaczenie, jak i edycja), `DELETE` ją czyści (przywrócenie). Oba są idempotentne — powtórzenie w nieaktualnej karcie nie szkodzi. Reguła „nie później niż dziś” żyje w fabryce schematu zod `paymentInputSchema(today)`: serwer podaje `todayInPoland(new Date())`, przeglądarka `today` z propsa (serwer rozstrzyga). Wyliczenia „na dzień X” zbiera jedna czysta funkcja w `charges.ts`, używana przez dialog (X = wybrana data) i historię (X = `paidOn`). UI: jeden `PaymentDialog` dla oznaczania i edycji; lista na `/` usuwa wiersz ze stanu po sukcesie, historia jest osobną wyspą React na `/history`.

## Critical Implementation Details

- **RLS i 404**: aktualizacja cudzej faktury nie rzuca błędu — RLS po prostu nie dopasowuje wiersza. Serwis musi traktować „0 wierszy zwróconych” (`.select().maybeSingle()` → `data === null`) jako `not_found`, a nie sukces.
- **Kolejność w historii**: `paid_on desc`, potem `number` (jak `groupInvoices`: `localeCompare(..., "pl", { numeric: true })`), żeby kolejność była deterministyczna przy tej samej dacie wpłaty; po „Zmień datę” wyspa sortuje stan ponownie tym samym komparatorem.

## Phase 1: Dane i API

### Overview

Schemat, typy, serwis, walidacja i endpoint wpłaty; lista na `/` pokazuje tylko otwarte faktury. Po tej fazie całość da się sprawdzić smoke'iem bez UI.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261007120000_add_invoice_paid_on.sql`

**Intent**: Dodać datę wpłaty jako jedyny znacznik stanu „zapłacona”. Istniejące polityki RLS (update dla właściciela, brak dla anon) pokrywają nową kolumnę — nie dodajemy nowych polityk.

**Contract**: `alter table public.invoices add column paid_on date null` z checkiem zakresu `paid_on between '2000-01-01' and '2100-12-31'` (zgodnym z `isValidDueDate`); komentarz w stylu istniejących migracji. Regułę „nie w przyszłości” wymusza aplikacja (check z `current_date` nie jest stabilny).

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Faktura niesie datę wpłaty; wejście wpłaty ma własny typ.

**Contract**: `Invoice.paidOn: string | null` (YYYY-MM-DD); `PaymentInput { paidOn: string }`.

#### 3. Wyliczenia na dzień

**File**: `src/lib/charges.ts` (+ `src/lib/charges.test.ts`)

**Intent**: Jedno miejsce liczące dni opóźnienia, odsetki i rekompensatę faktury na wskazany dzień — dla podglądu w dialogu i dla historii.

**Contract**: `chargesAsOf(invoice: { dueDate; amountGrosze; clientChargesCompensation }, asOf: string, settings = DEFAULT_CHARGE_SETTINGS): { days: number; interestGrosze: number; compensationGrosze: number }`; `days` nieujemne (`max(0, daysOverdue(dueDate, asOf))`). Testy: wpłata przed terminem i w dniu terminu → wszystko 0; wpłata dzień po terminie → 1 dzień; klient bez rekompensaty → rekompensata 0; wynik zależy tylko od `asOf`, nie od „dziś”.

#### 4. Schemat wpłaty

**File**: `src/lib/invoice-schemas.ts` (+ `src/lib/invoice-schemas.test.ts`)

**Intent**: Walidacja daty wpłaty wspólna dla przeglądarki i API.

**Contract**: `paymentInputSchema(today: string): z.ZodType<PaymentInput>` — `paidOn` przechodzi `isValidDueDate` (komunikat „Podaj poprawną datę wpłaty”) i `paidOn <= today` (komunikat „Data wpłaty nie może być późniejsza niż dziś”). Testy: dziś OK, wczoraj OK, data sprzed terminu OK, jutro → błąd, `2026-02-30` → błąd, brak pola → błąd.

#### 5. Serwis

**File**: `src/lib/services/invoices.ts`

**Intent**: Rozdzielić listę otwartych i zapłaconych oraz ustawiać/czyścić wpłatę.

**Contract**:
- `COLUMNS` i `toInvoice` obejmują `paid_on` → `paidOn`.
- `listInvoices` → zwraca tylko `paid_on is null` (nazwa może zostać lub zmienić się na `listOpenInvoices`; wywołanie w `index.astro` odpowiednio).
- `listPaidInvoices(supabase): Promise<Invoice[]>` — `paid_on is not null`, `order paid_on desc`.
- `setInvoicePayment(supabase, id, paidOn: string | null): Promise<InvoiceResult>` — `update({ paid_on }).eq("id", id).select(COLUMNS).maybeSingle()`; brak wiersza → `{ ok: false, code: "not_found" }`. `InvoiceErrorCode` dostaje `"not_found"`.

#### 6. Endpoint wpłaty

**File**: `src/pages/api/invoices/[id]/payment.ts`, `src/lib/services/invoices-api.ts`, `src/lib/invoice-errors.ts`

**Intent**: Jeden zasób do oznaczenia, edycji daty i przywrócenia.

**Contract**:
- `export const prerender = false`; `PUT` — walidacja `z.uuid()` parametru (`not_found` 404 jak w `clients/[id].ts`), auth (401), config (500), JSON, `paymentInputSchema(todayInPoland(new Date()))` → 400 `{ error: "invalid_input", fieldErrors }`; sukces 200 `{ invoice }`.
- `DELETE` — te same strażniki bez ciała; `setInvoicePayment(..., null)`; 200 `{ invoice }`.
- `STATUS_BY_CODE` dostaje `not_found: 404`. Strażnik wejścia wydzielony analogicznie do `withInvoiceInput` (wspólna część auth/config może zostać wyciągnięta, jeśli to upraszcza).
- `invoice-errors.ts`: `not_found` → „Nie znaleziono faktury. Odśwież stronę.”

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć kontrakt API na żywym serwerze, w tym izolację właścicieli.

**Contract**: po krokach faktur: anonim `PUT payment` → 401; A: data jutrzejsza → 400 z `fieldErrors.paidOn`; A: oznacz fakturę A dzisiejszą datą → 200, `paidOn` ustawione; B: `PUT`/`DELETE` na fakturze A → 404; A: zmiana daty na `daysAgo(5)` → 200; A: `DELETE` → 200, `paidOn === null`; niepoprawny id → 404. ID faktury A zapamiętane z kroku tworzenia.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual Verification:

- W Supabase Studio faktura oznaczona przez smoke ma `paid_on`, a po `DELETE` znów `null`
- Lista na `/` nie pokazuje faktury z ustawionym `paid_on` (ustawionym ręcznie lub przez API)

**Implementation Note**: Po automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Oznaczanie na liście

### Overview

Przycisk „Zapłacona” w każdym wierszu otwartych faktur i wspólny `PaymentDialog`.

### Changes Required:

#### 1. Hook formularza wpłaty

**File**: `src/components/hooks/use-payment-form.ts`

**Intent**: Stan i wysyłka formularza daty wpłaty, wzorem `use-invoice-form.ts`.

**Contract**: `usePaymentForm({ invoiceId, initialPaidOn, today, onSaved })` → `{ paidOn, setPaidOn, error, serverError, pending, submit }`; walidacja `paymentInputSchema(today)` przed wysyłką; `PUT /api/invoices/{id}/payment`; 400 → błąd pola `paidOn`; 404 → `serverError` z `invoiceErrorMessage("not_found")`; reszta → komunikat ogólny. Reset stanu przy zmianie `invoiceId`/otwarciu dialogu.

#### 2. Dialog wpłaty

**File**: `src/components/invoices/PaymentDialog.tsx`

**Intent**: Jeden dialog do oznaczenia i edycji daty, z podglądem skutku wybranej daty.

**Contract**: props `{ invoice: Invoice | null; today; open; onOpenChange; onSaved(invoice); onCloseAutoFocus; mode: "mark" | "edit" }`. Tytuł „Oznacz jako zapłaconą” / „Zmień datę wpłaty”, opis z numerem faktury i klientem. Pole `type="date"` (`max={today}`), domyślnie `today` (mark) lub `invoice.paidOn` (edit), przez istniejące `FormField`/`Input`. Podgląd z `chargesAsOf(invoice, paidOn)` dla poprawnej daty: dni opóźnienia, odsetki, rekompensata (sformatowane `formatAmount`). Przycisk zapisu przez `SubmitButton`. Tylko tokeny i warianty komponentów `ui`.

#### 3. Akcja w wierszu

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Oznaczenie dostępne dla każdej otwartej faktury (także bieżącej), a sukces natychmiast usuwa ją z listy i ponagleń.

**Contract**: nowa ostatnia kolumna z `Button variant="outline" size="sm"` „Zapłacona” i `aria-label="Oznacz fakturę {numer} jako zapłaconą"`; `openerRef` jak przy dodawaniu; `onSaved` → `setInvoices(prev => prev.filter(i => i.id !== saved.id))` i zamknięcie dialogu. Fokus po zamknięciu: opener, jeśli nadal w DOM (`isConnected`); w przeciwnym razie (wiersz zniknął) — przycisk „Dodaj fakturę” lub nagłówek strony. Pusty stan po oznaczeniu wszystkich faktur: „Nie masz otwartych faktur” (zamiast „Nie masz jeszcze faktur”), z linkiem do historii.

#### 4. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Reguła z CLAUDE.md — nowy formularz trafia do `/dev/ui`.

**Contract**: sekcje „Data wpłaty: default”, „Data wpłaty: błąd (przyszła data)”, „Podgląd kwot wpłaty” odwzorowujące pole i podgląd z `PaymentDialog`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Oznaczenie przeterminowanej faktury z datą dziś usuwa ją z grupy bez przeładowania; podgląd w dialogu pokazywał te same odsetki co wiersz listy
- Oznaczenie ostatniej faktury klienta na etapach 1–4 usuwa jego wiersz z „Ponagleń”
- Wybór daty jutrzejszej pokazuje błąd pola i nic nie zapisuje; data sprzed terminu pokazuje 0 dni i 0 zł
- Po przeładowaniu strony oznaczona faktura nadal nie wraca na listę
- Fokus wraca sensownie po zamknięciu dialogu (anulowanie → przycisk wiersza; zapis → „Dodaj fakturę”)
- `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie

**Implementation Note**: Po automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Widok historii

### Overview

Strona `/history` z zapłaconymi fakturami, edycją daty wpłaty i przywracaniem do otwartych.

### Changes Required:

#### 1. Strona i ochrona trasy

**File**: `src/pages/history.astro`, `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: Osobny, chroniony widok historii zgodny z FR-010, dostępny z Topbara.

**Contract**: `prerender = false`; ładowanie `listPaidInvoices` i `todayInPoland` jak w `index.astro` (te same komunikaty błędów konfiguracji/wczytania, dostosowane do historii); nagłówek „Historia”; wyspa `PaidInvoicesManager client:load`. `PROTECTED_ROUTES` dostaje `"/history"`. Topbar: link `{ href: "/history", label: "Historia" }`.

#### 2. Wyspa historii

**File**: `src/components/invoices/PaidInvoicesManager.tsx`

**Intent**: Tabela zapłaconych faktur z kwotami do dnia wpłaty, edycją daty i przywracaniem.

**Contract**: props `{ initialInvoices: Invoice[]; today: string }`. Kolumny: Klient, Numer, Kwota, Termin, Data wpłaty, Dni opóźnienia, Odsetki, Rekompensata (z `chargesAsOf(invoice, invoice.paidOn)`), Akcje. Akcje: „Zmień datę” → `PaymentDialog mode="edit"`, `onSaved` podmienia wiersz i sortuje stan od nowa (`paidOn desc`, potem numer); „Przywróć do otwartych” → `DELETE /api/invoices/{id}/payment` bez potwierdzenia, sukces usuwa wiersz, błąd pokazuje `Alert` z `invoiceErrorMessage`, przycisk zablokowany w trakcie żądania. Aria-labele z numerem faktury. Pusty stan: „Brak zapłaconych faktur”. Fokus po usunięciu wiersza przenoszony na nagłówek tabeli lub stronę.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Ochrona nowej trasy sprawdzona automatycznie.

**Contract**: krok „history redirects anonymous user” — `GET /history` bez sesji → 302 na `/auth/signin` (jak istniejący krok dla `/clients`).

#### 4. Dokumentacja

**File**: `README.md`

**Intent**: Tabela tras i opis migracji uwzględniają `/history` i `paid_on`.

**Contract**: wiersz `/history` w tabeli „Auth routes”, zdanie o migracji `add_invoice_paid_on`, wzmianka w opisie smoke o krokach wpłaty.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi, w tym przekierowanie anonima z `/history` na `/auth/signin`: `npm run smoke`

#### Manual Verification:

- Faktura zapłacona 10 dni po terminie pokazuje w historii 10 dni i odsetki z tych 10 dni; następnego dnia wartości są te same
- „Zmień datę” na wcześniejszą zmniejsza odsetki w wierszu i przestawia kolejność, jeśli trzeba
- „Przywróć do otwartych” usuwa wiersz z historii, a na `/` faktura wraca na właściwy etap i (gdy etap 1–4) do „Ponagleń”
- Link „Historia” w Topbarze jest aktywny na `/history`; widok czytelny w jasnym i ciemnym motywie oraz na wąskim ekranie

**Implementation Note**: Po automatycznych kontrolach zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `chargesAsOf`: granice terminu (przed, w dniu, dzień po), klient bez rekompensaty, niezależność od „dziś”.
- `paymentInputSchema(today)`: dziś, przeszłość, data sprzed terminu, jutro, nieistniejąca data, brak pola.

### Integration Tests:

- Smoke: 401 dla anonima, 400 dla przyszłej daty, 200 oznaczenie/edycja/przywrócenie, 404 dla cudzej faktury i niepoprawnego id, przekierowanie anonima z `/history`.

### Manual Testing Steps:

1. Dodaj fakturę 40 dni po terminie dla klienta z rekompensatą; oznacz ją jako zapłaconą z datą sprzed 30 dni — w historii 10 dni opóźnienia, odsetki za 10 dni, rekompensata naliczona.
2. Oznacz ostatnią fakturę klienta na etapie 1–4 — klient znika z „Ponagleń”.
3. W historii zmień datę na późniejszą (nie przyszłą), potem przywróć fakturę — wraca na `/` na etap 4.
4. Spróbuj wybrać jutrzejszą datę — błąd pola, brak zapisu.

## Performance Considerations

Brak istotnych — jedna kolumna i filtr `paid_on is null` na małych zbiorach jednego właściciela. Indeks nie jest potrzebny na tym etapie.

## Migration Notes

Kolumna nullowalna bez wartości domyślnej — istniejące faktury pozostają otwarte. Lokalnie stosuj przez `npx supabase migration up` (lekcja: bez `db reset`). Na produkcji migrację stosuje potok po merge PR-a, przed wdrożeniem kodu; stary kod ignoruje nową kolumnę, więc kolejność baza → kod jest bezpieczna.

## References

- Roadmap: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd.md` (US-02, FR-004, FR-006, FR-007, FR-010)
- Lekcje: `context/foundation/lessons.md` (migracje bez `db reset`, dev server na 4321)
- Wzorce: `src/pages/api/clients/[id].ts`, `src/lib/services/invoices-api.ts`, `src/components/hooks/use-invoice-form.ts`, `src/components/invoices/RemindersSection.tsx`
- Poprzedni wycinek: `context/archive/2026-10-06-collective-reminder/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane i API

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- [x] 1.2 Testy jednostkowe przechodzą: `npm test`
- [x] 1.3 Lint przechodzi: `npm run lint`
- [x] 1.4 Sprawdzenie typów przechodzi: `npx astro check`
- [x] 1.5 Build przechodzi: `npm run build`
- [x] 1.6 Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual

- [ ] 1.7 W Supabase Studio faktura oznaczona przez smoke ma `paid_on`, a po `DELETE` znów `null`
- [ ] 1.8 Lista na `/` nie pokazuje faktury z ustawionym `paid_on` (ustawionym ręcznie lub przez API)

### Phase 2: Oznaczanie na liście

#### Automated

- [ ] 2.1 Testy jednostkowe przechodzą: `npm test`
- [ ] 2.2 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- [ ] 2.3 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 2.4 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.5 Oznaczenie przeterminowanej faktury z datą dziś usuwa ją z grupy bez przeładowania; podgląd w dialogu pokazywał te same odsetki co wiersz listy
- [ ] 2.6 Oznaczenie ostatniej faktury klienta na etapach 1–4 usuwa jego wiersz z „Ponagleń”
- [ ] 2.7 Wybór daty jutrzejszej pokazuje błąd pola i nic nie zapisuje; data sprzed terminu pokazuje 0 dni i 0 zł
- [ ] 2.8 Po przeładowaniu strony oznaczona faktura nadal nie wraca na listę
- [ ] 2.9 Fokus wraca sensownie po zamknięciu dialogu (anulowanie → przycisk wiersza; zapis → „Dodaj fakturę”)
- [ ] 2.10 `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie

### Phase 3: Widok historii

#### Automated

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 3.3 Testy jednostkowe przechodzą: `npm test`
- [ ] 3.4 Build przechodzi: `npm run build`
- [ ] 3.5 Smoke przechodzi, w tym przekierowanie anonima z `/history` na `/auth/signin`: `npm run smoke`

#### Manual

- [ ] 3.6 Faktura zapłacona 10 dni po terminie pokazuje w historii 10 dni i odsetki z tych 10 dni; następnego dnia wartości są te same
- [ ] 3.7 „Zmień datę” na wcześniejszą zmniejsza odsetki w wierszu i przestawia kolejność, jeśli trzeba
- [ ] 3.8 „Przywróć do otwartych” usuwa wiersz z historii, a na `/` faktura wraca na właściwy etap i (gdy etap 1–4) do „Ponagleń”
- [ ] 3.9 Link „Historia” w Topbarze jest aktywny na `/history`; widok czytelny w jasnym i ciemnym motywie oraz na wąskim ekranie
