# Edycja i anulowanie faktury — Implementation Plan

## Overview

S-07 z roadmapy (FR-003, FR-010). Użytkownik może edytować otwartą fakturę: numer zawsze, a klienta, kwotę i termin tylko do dnia terminu włącznie. Może też anulować otwartą fakturę po potwierdzeniu. Anulowana faktura znika z listy otwartych, z eskalacji i z ponagleń, trafia do sekcji „Anulowane” w `/history`, zwalnia swój numer i da się ją przywrócić do otwartych.

## Current State Analysis

- Stan faktury to jedna kolumna `paid_on date null` (`supabase/migrations/20261007120000_add_invoice_paid_on.sql:5`). Nie ma kolumny statusu ani anulowania.
- Twarde usuwanie jest zablokowane polityką `invoices_delete_authenticated … using (false)` (`supabase/migrations/20261005120000_create_invoices.sql:38`). Anulowanie ma być aktualizacją, a nie `DELETE` wiersza.
- Unikalny indeks `invoices_user_number_key` na `(user_id, lower(number))` obejmuje wszystkie faktury (`20261005120000_create_invoices.sql:18`). Serwis rozpoznaje duplikat po nazwie tego indeksu (`src/lib/services/invoices.ts:12`).
- `listOpenInvoices` filtruje tylko `paid_on is null` (`src/lib/services/invoices.ts:57`). Lista na `/` i sekcja „Ponaglenia” korzystają z tej samej tablicy w `InvoicesManager` (`src/components/invoices/InvoicesManager.tsx:32,102`), więc filtr w jednym miejscu wyklucza fakturę z obu.
- Edycji faktur nie ma. `useInvoiceForm` robi tylko `POST /api/invoices` (`src/components/hooks/use-invoice-form.ts:77`). Widok `InvoiceFormView` jest już oddzielony od hooka i używany w kitchen sinku (`src/components/dev/KitchenSinkForms.tsx`).
- Wzorce do powtórzenia: edycja klienta `PUT /api/clients/[id]` z `updateClient` (0 wierszy → `not_found`, `src/lib/services/clients.ts:56`) oraz zasób stanu `PUT`/`DELETE /api/invoices/[id]/payment` (`src/pages/api/invoices/[id]/payment.ts`) z restore w `PaidInvoicesManager` (`src/components/invoices/PaidInvoicesManager.tsx:47`).
- „Dziś” w czasie polskim daje `todayInPoland` (`src/lib/escalation.ts:25`), a liczbę dni po terminie `daysOverdue` (`src/lib/escalation.ts:37`).
- `FormField` nie obsługuje `disabled` (`src/components/auth/FormField.tsx:6`). W `src/components/ui/` nie ma `alert-dialog`.

## Desired End State

- Każdy wiersz listy otwartych faktur ma przycisk „Edytuj” obok „Zapłacona”. Otwiera on dialog z danymi faktury.
- Do dnia terminu włącznie (`today <= due_date`) wszystkie pola są edytowalne. Od dnia po terminie (`today > due_date`) klient, kwota i termin są wyłączone, a dialog pokazuje dlaczego. Numer zawsze da się zmienić. Serwer egzekwuje tę samą regułę i odrzuca zmianę zablokowanych pól kodem `locked` (409).
- Nowy termin może być w przeszłości, tak samo jak przy dodawaniu. Faktura od razu trafia wtedy na właściwy etap i od tej chwili jest zablokowana.
- W dialogu edycji jest przycisk „Anuluj fakturę”, który otwiera potwierdzenie (przyciski „Wróć” i „Anuluj fakturę”). Po potwierdzeniu faktura znika z listy i z ponagleń bez przeładowania i nie wraca po odświeżeniu.
- `/history` ma pod sekcją „Zapłacone faktury” drugą sekcję „Anulowane faktury”: klient, numer, kwota, termin, data anulowania i przycisk „Przywróć do otwartych”, bez odsetek.
- Anulowanie zwalnia numer: można dodać nową fakturę o tym samym numerze. Przywrócenie anulowanej faktury, której numer jest znów zajęty, kończy się komunikatem zamiast przywrócenia.
- Edytować i anulować można tylko faktury otwarte. Zapłaconą trzeba najpierw przywrócić. Baza nie dopuszcza faktury zapłaconej i anulowanej naraz.

### Key Discoveries:

- Zachowanie nazwy `invoices_user_number_key` dla nowego częściowego indeksu sprawia, że mapowanie `duplicate_number` w `src/lib/services/invoices.ts:51` działa bez zmian, także przy przywracaniu.
- Zasada „jeden filtr = lista i ponaglenia” (`InvoicesManager` → `RemindersSection`) oznacza, że anulowanie nie wymaga zmian w `src/lib/reminder.ts`.
- S-08 doda wyjątek od blokady dla wstrzymanych faktur (roadmap S-08, FR-003). Dlatego warunek blokady żyje w jednej czystej funkcji używanej i przez serwer, i przez dialog.
- Słowo „Anuluj” po polsku to też typowa etykieta zamknięcia dialogu. W potwierdzeniu wyjście nazywa się „Wróć”, żeby nie było dwóch różnych przycisków „Anuluj”.

## What We're NOT Doing

- Edycja i anulowanie faktur zapłaconych (najpierw „Przywróć do otwartych”).
- Wyjątek od blokady dla wstrzymanych faktur (S-08).
- Wybór daty anulowania przez użytkownika: datę ustawia serwer na „dziś” (czas polski).
- Odsetki i rekompensata dla anulowanych w historii; filtrowanie i sortowanie historii (S-11).
- Historia zmian (audyt) edycji faktury.
- Twarde usuwanie wiersza: polityka `delete … using (false)` zostaje.
- Menu „⋯” w wierszu i trzeci przycisk w wierszu (anulowanie żyje w dialogu edycji).

## Implementation Approach

Stan faktury pozostaje „wynikającym z dat”: `cancelled_on date null` obok `paid_on`, z constraintem wykluczającym oba naraz. Indeks unikalny numeru staje się częściowy (`where cancelled_on is null`). Edycja to `PUT /api/invoices/[id]` z tym samym schematem co dodawanie. Serwis czyta bieżący wiersz otwartej faktury, sprawdza blokadę czystą funkcją i aktualizuje warunkowo, żeby północ między odczytem a zapisem nie przepuściła zmiany. Anulowanie i przywracanie to zasób `PUT`/`DELETE /api/invoices/[id]/cancellation`, wzorem `payment`. UI powtarza wzorce S-06: dialog bez `DialogTrigger` z ręcznym przywracaniem fokusu, usuwanie wiersza z lokalnego stanu wyspy.

## Critical Implementation Details

- **Warunkowa aktualizacja przy edycji**: blokadę sprawdza się na wierszu odczytanym z bazy, a nie na danych z przeglądarki. `update` filtruje dodatkowo `paid_on is null`, `cancelled_on is null`, a gdy zmieniają się pola blokowane, także `due_date >= today` (stara wartość). Dzięki temu zmiana dnia lub równoległe zamknięcie faktury między odczytem a zapisem kończy się 0 wierszami, a nie cichą zmianą zablokowanej faktury.
- **Fokus po anulowaniu**: anulowanie zamyka oba dialogi i usuwa wiersz, z którego otwarto edycję. Fokus trafia wtedy na „Dodaj fakturę”, tak jak po oznaczeniu jako zapłaconej (`InvoicesManager.tsx:173`).

## Phase 1: Dane i API

### Overview

Migracja, typy, reguła blokady z testami, serwis, endpointy edycji i anulowania oraz kroki smoke. Po tej fazie całe zachowanie jest dostępne przez API i chronione po stronie serwera.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261007180000_add_invoice_cancelled_on.sql`

**Intent**: Dodać stan „anulowana” jako datę, wykluczyć stan „zapłacona i anulowana” i zwolnić numer anulowanej faktury.

**Contract**: kolumna `cancelled_on date null` z checkiem zakresu jak `paid_on` (2000–2100); constraint `invoices_single_closed_state check (paid_on is null or cancelled_on is null)`; `drop index invoices_user_number_key` i ponowne utworzenie pod **tą samą nazwą** jako `unique (user_id, lower(number)) where cancelled_on is null`. Polityki RLS bez zmian (update tylko właściciel, delete zablokowany). Komentarz w pliku po polsku, wzorem poprzednich migracji.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Faktura niesie datę anulowania.

**Contract**: `Invoice.cancelledOn: string | null` (YYYY-MM-DD; null = nieanulowana).

#### 3. Reguła blokady

**File**: `src/lib/invoice-lock.ts` (+ `src/lib/invoice-lock.test.ts`)

**Intent**: Jedno miejsce z regułą „od dnia po terminie klient, kwota i termin są zablokowane”, używane przez serwis i dialog. S-08 dopisze tu wyjątek dla wstrzymanych.

**Contract**: `isInvoiceLocked(invoice: { dueDate: string }, today: string): boolean`, prawdziwe dokładnie wtedy, gdy `daysOverdue(dueDate, today) >= 1`. `lockedFieldsChanged(current: Pick<Invoice, "clientId" | "amountGrosze" | "dueDate">, input: InvoiceInput): boolean`. Testy: `today === dueDate` → niezablokowana; `today = dueDate + 1` → zablokowana; `today < dueDate` → niezablokowana; zmiana samego numeru nie liczy się jako zmiana pól blokowanych.

#### 4. Tekst kwoty do formularza

**File**: `src/lib/format.ts` (+ `src/lib/format.test.ts`)

**Intent**: Dialog edycji wypełnia pole kwoty tekstem, który `invoiceInputSchema` przyjmuje z powrotem bez zmiany wartości.

**Contract**: `amountInputText(grosze: number): string`, np. `123456` → `"1234,56"`, `100` → `"1,00"`. Test round-trip: `parseAmountGrosze(amountInputText(x)) === x` przez `invoiceInputSchema`.

#### 5. Serwis

**File**: `src/lib/services/invoices.ts`

**Intent**: Edycja z blokadą, anulowanie, przywracanie, lista anulowanych oraz wykluczenie anulowanych z listy otwartych i z oznaczania wpłaty.

**Contract**:
- `COLUMNS` i `InvoiceRow`/`toInvoice` dostają `cancelled_on`.
- `InvoiceErrorCode` dostaje `"locked"`.
- `listOpenInvoices`: dodatkowo `.is("cancelled_on", null)`.
- `listCancelledInvoices(supabase)`: `cancelled_on is not null`, sortowane `cancelled_on desc`.
- `updateInvoice(supabase, id, input, today)`: odczyt otwartej faktury (`paid_on is null`, `cancelled_on is null`), a jej brak → `not_found`. Jeśli `isInvoiceLocked` i `lockedFieldsChanged` → `locked`. Inaczej warunkowy `update` (patrz Critical Implementation Details); 0 wierszy → `not_found`, błędy bazy przez `toErrorCode` (`duplicate_number`, `client_not_found`).
- `cancelInvoice(supabase, id, today)`: ustawia `cancelled_on = today` tylko dla otwartej faktury; 0 wierszy → `not_found`.
- `restoreInvoice(supabase, id)`: czyści `cancelled_on` tylko dla anulowanej; 0 wierszy → `not_found`; naruszenie indeksu → `duplicate_number`.
- `setInvoicePayment`: dodatkowo `.is("cancelled_on", null)`, więc anulowanej nie da się oznaczyć jako zapłaconej (404).

#### 6. API

**Files**: `src/lib/services/invoices-api.ts`, `src/pages/api/invoices/[id].ts`, `src/pages/api/invoices/[id]/cancellation.ts`, `src/lib/invoice-errors.ts`

**Intent**: Endpointy edycji i anulowania wzorem `payment.ts`, z „dziś” liczonym na serwerze.

**Contract**:
- `STATUS_BY_CODE` dostaje `locked: 409`.
- `PUT /api/invoices/[id]` (body jak `POST`, przez `withInvoiceInput`) → 200 `{ invoice }`.
- `PUT /api/invoices/[id]/cancellation` (bez body, `withInvoiceAuth`) → 200 `{ invoice }` z `cancelledOn = todayInPoland(new Date())`.
- `DELETE /api/invoices/[id]/cancellation` → 200 `{ invoice }` z `cancelledOn: null`.
- Niepoprawne `id` → 404. Wszystkie endpointy mają `export const prerender = false`.
- Komunikat `locked`: „Faktura jest po terminie: klienta, kwoty ani terminu nie można już zmienić. Odśwież stronę.”

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kroki HTTP dla edycji, blokady, anulowania, zwalniania numeru i izolacji właścicieli, dopięte po `paymentSteps()`.

**Contract**: nowe kroki (A = faktura 40 dni po terminie, otwarta po `paymentSteps`):
- edycja nowej faktury z terminem za 10 dni: zmiana kwoty i terminu → 200;
- edycja A ze zmianą kwoty → 409 `locked`;
- edycja A ze zmianą samego numeru → 200;
- B edytuje A → 404;
- anulowanie A → 200 z `cancelledOn` = dziś; B anuluje lub przywraca A → 404;
- `PUT payment` na anulowanej A → 404; edycja anulowanej A → 404;
- nowa faktura z numerem A → 201; przywrócenie A → 409 `duplicate_number`;
- anulowanie nowej, przywrócenie A → 200 z `cancelledOn: null`.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Testy jednostkowe przechodzą (w tym granica blokady i round-trip kwoty): `npm test`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual Verification:

- W Supabase Studio próba ustawienia naraz `paid_on` i `cancelled_on` na jednej fakturze jest odrzucona przez constraint
- Lista na `/` nie pokazuje faktury z ustawionym `cancelled_on`, a jej klient nie ma jej w ponagleniu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Edycja i anulowanie na liście

### Overview

Przycisk „Edytuj” w wierszu, dialog edycji z polami wyłączonymi po terminie, anulowanie z potwierdzeniem i stany w `/dev/ui`.

### Changes Required:

#### 1. Komponenty UI

**Files**: `src/components/ui/alert-dialog.tsx`, `src/components/auth/FormField.tsx`

**Intent**: Potwierdzenie destrukcyjnej akcji standardowym komponentem oraz możliwość wyłączenia pola formularza.

**Contract**: `npx shadcn@latest add alert-dialog` (styl lyra). `FormField` dostaje opcjonalne `disabled?: boolean`, przekazywane do `Input`.

#### 2. Hook formularza faktury

**File**: `src/components/hooks/use-invoice-form.ts`

**Intent**: Ten sam hook obsługuje dodawanie i edycję.

**Contract**: `useInvoiceForm({ invoice?: Invoice, onSaved })`. Przy `invoice` wartości startowe pochodzą z faktury (kwota przez `amountInputText`), a zapis to `PUT /api/invoices/${invoice.id}`. Bez `invoice` zachowanie bez zmian. 409 `locked` i 404 `not_found` → `serverError`. 409 `duplicate_number` i 404 `client_not_found` → błędy pól, jak dziś.

#### 3. Hook anulowania

**File**: `src/components/hooks/use-cancel-invoice.ts`

**Intent**: Wywołanie `PUT …/cancellation` ze stanem `pending` i komunikatem błędu dla dialogu potwierdzenia.

**Contract**: `useCancelInvoice({ onCancelled: (invoice: Invoice) => void })` → `{ cancel(id), pending, error }`; błędy przez `invoiceErrorMessage`.

#### 4. Dialog faktury i potwierdzenie

**Files**: `src/components/invoices/InvoiceFormDialog.tsx`, `src/components/invoices/CancelInvoiceDialog.tsx`

**Intent**: Dialog działa w trybie dodawania lub edycji. W edycji pokazuje blokadę i daje wejście do anulowania.

**Contract**:
- `InvoiceFormView` dostaje `locked?: boolean`, który wyłącza klienta, kwotę i termin i pokazuje pod formularzem tekst „Faktura jest po terminie — klienta, kwoty i terminu nie można zmienić.”
- `InvoiceFormDialog` dostaje `invoice?: Invoice | null`, `today: string`, `onCancelRequest?: () => void`. Tytuł to „Edytuj fakturę” / „Dodaj fakturę”, formularz ma `key` po fakturze, `locked = isInvoiceLocked(invoice, today)`, a w edycji jest przycisk „Anuluj fakturę” (`variant="destructive"`).
- `CancelInvoiceDialog` (alert-dialog): tytuł „Anulować fakturę {numer}?”, opis „Faktura zniknie z listy i z ponagleń i trafi do historii. Możesz ją stamtąd przywrócić.”, przyciski „Wróć” i „Anuluj fakturę” (z `pending`), błąd w `ServerError`.
- Bez nadpisywania kolorów komponentów `ui` przez `className`.

#### 5. Akcje w wierszu

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Wpiąć edycję i anulowanie w listę otwartych.

**Contract**: przycisk „Edytuj” (`variant="outline" size="sm"`, `aria-label="Edytuj fakturę {numer}"`) obok „Zapłacona”. Po zapisie edycji faktura jest podmieniana w stanie (grupy i ponaglenia przeliczają się same), a fokus wraca na „Edytuj”. Po anulowaniu faktura znika ze stanu, oba dialogi się zamykają, a fokus trafia na „Dodaj fakturę”. Dialog dodawania dostaje `today` i działa jak dotąd.

#### 6. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Pokazać nowe stany formularza w `/dev/ui`.

**Contract**: formularz edycji niezablokowany, formularz zablokowany (pola wyłączone z wyjaśnieniem), formularz z błędem `locked` w `serverError`, potwierdzenie anulowania (zwykłe, w trakcie i z błędem).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Faktura z terminem dziś: wszystkie pola edytowalne; zmiana kwoty zapisuje się i odświeża odsetki w wierszu
- Faktura po terminie: klient, kwota i termin wyłączone z wyjaśnieniem; zmiana numeru zapisuje się
- Zmiana terminu bieżącej faktury na datę z przeszłości przenosi ją od razu do właściwej grupy etapu
- Anulowanie: „Wróć” nic nie zmienia; „Anuluj fakturę” usuwa wiersz z listy i z ponaglenia klienta bez przeładowania, a po odświeżeniu faktura nie wraca
- Fokus wraca na „Edytuj” po zapisie i na „Dodaj fakturę” po anulowaniu; dialogi obsługują klawiaturę (Esc, Tab)
- `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Historia anulowanych

### Overview

Sekcja „Anulowane faktury” w `/history` z przywracaniem oraz dokumentacja.

### Changes Required:

#### 1. Strona historii

**File**: `src/pages/history.astro`

**Intent**: Wczytać zapłacone i anulowane faktury równolegle.

**Contract**: `Promise.all([listPaidInvoices, listCancelledInvoices])`. Wyspa (lub dwie wyspy) dostaje obie listy; komunikat błędu wczytania jak dotąd.

#### 2. Sekcja anulowanych

**File**: `src/components/invoices/CancelledInvoicesSection.tsx` (wpięta obok `PaidInvoicesManager`)

**Intent**: Tabela anulowanych z przywracaniem, wzorem przywracania zapłaconych.

**Contract**: nagłówek „Anulowane faktury (n)”, kolumny Klient, Numer, Kwota, Termin, Data anulowania; sortowanie `cancelledOn desc`, potem numer; stan pusty „Brak anulowanych faktur”. „Przywróć do otwartych” (`aria-label="Przywróć fakturę {numer} do otwartych"`) → `DELETE …/cancellation` bez potwierdzenia; po sukcesie wiersz znika i fokus trafia na nagłówek sekcji. Przy `duplicate_number` pokazuje się komunikat „Nie można przywrócić: istnieje już faktura o tym numerze.”, a przy innych błędach `invoiceErrorMessage`.

#### 3. Dokumentacja

**File**: `README.md`

**Intent**: Opisać nowe zachowanie i migrację.

**Contract**: wiersze tras `/` (edycja, anulowanie) i `/history` (sekcja anulowanych, przywracanie); zdanie o migracji `add_invoice_cancelled_on` w §Supabase Configuration; wymaganie tej migracji w §Smoke test.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual Verification:

- `/history` pokazuje anulowaną fakturę z datą anulowania i bez odsetek; zapłacone bez zmian
- „Przywróć do otwartych” wraca fakturę na `/` do właściwej grupy i do ponagleń
- Przywrócenie, gdy numer zajęła nowa faktura, pokazuje komunikat i zostawia fakturę w anulowanych
- Puste stany obu sekcji wyglądają poprawnie w jasnym i ciemnym motywie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `isInvoiceLocked`: termin dziś (otwarta), wczoraj (zablokowana), jutro (otwarta).
- `lockedFieldsChanged`: zmiana samego numeru → false; zmiana klienta, kwoty lub terminu → true.
- `amountInputText`: round-trip przez `invoiceInputSchema` dla 1 gr, 100 gr, 123456 gr i maksimum.

### Integration Tests:

- `npm run smoke`: edycja, `locked`, izolacja (404), anulowanie, zwolnienie numeru, kolizja przy przywracaniu, wykluczenie anulowanej z oznaczania wpłaty.

### Manual Testing Steps:

1. Dodać fakturę z terminem dziś, edytować kwotę i sprawdzić wiersz.
2. Edytować fakturę po terminie: zmienić numer i sprawdzić, że pola blokowane są wyłączone.
3. Anulować fakturę klienta z ponagleniem i sprawdzić, że ponaglenie jej nie zawiera.
4. Dodać nową fakturę z numerem anulowanej, spróbować przywrócić anulowaną, a potem anulować nową i przywrócić starą.

## Performance Considerations

Brak istotnych: jedna dodatkowa kolumna i jeden filtr. Częściowy indeks unikalny jest mniejszy od dotychczasowego.

## Migration Notes

Migracja jest addytywna: istniejące faktury dostają `cancelled_on = null`. Ponowne utworzenie indeksu nie narusza danych, bo nowy indeks jest luźniejszy od starego. Lokalnie stosować przez `npx supabase migration up` (bez `db reset`, patrz lessons). Na produkcję trafia przez potok po merge PR-a, przed wdrożeniem kodu. Rollback Workera nie cofa kolumny ani indeksu; stary kod ignoruje `cancelled_on`, więc anulowane faktury wróciłyby wtedy na listę otwartych.

## References

- Roadmap S-07: `context/foundation/roadmap.md`
- PRD: FR-003, FR-010, FR-013 w `context/foundation/prd.md`
- Poprzedni wycinek (wzorzec zasobu stanu i historii): `context/archive/2026-10-07-mark-invoice-paid/plan.md`
- Wzorzec edycji: `src/pages/api/clients/[id].ts`, `src/lib/services/clients.ts:56`
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane i API

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up` — d7c78fe
- [x] 1.2 Testy jednostkowe przechodzą (w tym granica blokady i round-trip kwoty): `npm test` — d7c78fe
- [x] 1.3 Lint przechodzi: `npm run lint` — d7c78fe
- [x] 1.4 Sprawdzenie typów przechodzi: `npx astro check` — d7c78fe
- [x] 1.5 Build przechodzi: `npm run build` — d7c78fe
- [x] 1.6 Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke` — d7c78fe

#### Manual

- [x] 1.7 W Supabase Studio próba ustawienia naraz `paid_on` i `cancelled_on` na jednej fakturze jest odrzucona przez constraint — d7c78fe
- [x] 1.8 Lista na `/` nie pokazuje faktury z ustawionym `cancelled_on`, a jej klient nie ma jej w ponagleniu — d7c78fe

### Phase 2: Edycja i anulowanie na liście

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — de4fe61
- [x] 2.2 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint` — de4fe61
- [x] 2.3 Sprawdzenie typów przechodzi: `npx astro check` — de4fe61
- [x] 2.4 Build przechodzi: `npm run build` — de4fe61

#### Manual

- [x] 2.5 Faktura z terminem dziś: wszystkie pola edytowalne; zmiana kwoty zapisuje się i odświeża odsetki w wierszu — de4fe61
- [x] 2.6 Faktura po terminie: klient, kwota i termin wyłączone z wyjaśnieniem; zmiana numeru zapisuje się — de4fe61
- [x] 2.7 Zmiana terminu bieżącej faktury na datę z przeszłości przenosi ją od razu do właściwej grupy etapu — de4fe61
- [x] 2.8 Anulowanie: „Wróć” nic nie zmienia; „Anuluj fakturę” usuwa wiersz z listy i z ponaglenia klienta bez przeładowania, a po odświeżeniu faktura nie wraca — de4fe61
- [x] 2.9 Fokus wraca na „Edytuj” po zapisie i na „Dodaj fakturę” po anulowaniu; dialogi obsługują klawiaturę (Esc, Tab) — de4fe61
- [x] 2.10 `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie — de4fe61

### Phase 3: Historia anulowanych

#### Automated

- [x] 3.1 Testy jednostkowe przechodzą: `npm test`
- [x] 3.2 Lint przechodzi: `npm run lint`
- [x] 3.3 Sprawdzenie typów przechodzi: `npx astro check`
- [x] 3.4 Build przechodzi: `npm run build`
- [x] 3.5 Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual

- [x] 3.6 `/history` pokazuje anulowaną fakturę z datą anulowania i bez odsetek; zapłacone bez zmian
- [x] 3.7 „Przywróć do otwartych” wraca fakturę na `/` do właściwej grupy i do ponagleń
- [x] 3.8 Przywrócenie, gdy numer zajęła nowa faktura, pokazuje komunikat i zostawia fakturę w anulowanych
- [x] 3.9 Puste stany obu sekcji wyglądają poprawnie w jasnym i ciemnym motywie
