# Wstrzymanie i wznowienie eskalacji faktury — Implementation Plan

## Overview

S-08 z roadmapy (US-03, FR-013, wyjątek z FR-003). Użytkownik może wstrzymać eskalację dowolnej otwartej faktury i ją wznowić. Wstrzymana faktura jest w grupie „Wstrzymane” na końcu listy, nie wchodzi do ponagleń, odsetki rosną dalej, a klienta, kwotę i termin można edytować także po terminie. Po wznowieniu faktura trafia na etap wynikający z aktualnej liczby dni po terminie (może przeskoczyć kilka etapów), a po terminie znów jest zablokowana.

## Current State Analysis

- Stan faktury to daty: `paid_on` (`supabase/migrations/20261007120000_add_invoice_paid_on.sql`) i `cancelled_on` z constraintem `invoices_single_closed_state` (`supabase/migrations/20261007180000_add_invoice_cancelled_on.sql:12`). Kolumny statusu nie ma.
- Grupowanie to `groupInvoices` (`src/lib/escalation.ts:51`) z kolejnością `GROUP_ORDER` (`src/lib/escalation.ts:7`). Nie zna wstrzymania.
- Ponaglenia: `buildClientReminders` (`src/lib/reminder.ts:32`) bierze grupy z `groupInvoices` i przepuszcza tylko te z `STAGE_BY_GROUP` (`src/lib/reminder.ts:42`).
- Lista i ponaglenia korzystają z jednej tablicy `invoices` w `InvoicesManager` (`src/components/invoices/InvoicesManager.tsx:45,132`).
- Blokada edycji: `isInvoiceLocked` (`src/lib/invoice-lock.ts:5`), używana przez serwis (`src/lib/services/invoices.ts:136`) i dialog (`src/components/invoices/InvoiceFormDialog.tsx:205`). Zapis edycji jest warunkowy: przy zmianie pól blokowanych dochodzi `gte("due_date", today)` (`src/lib/services/invoices.ts:139`).
- Zamknięcie faktury: `setInvoicePayment` (`src/lib/services/invoices.ts:97`) i `cancelInvoice` (`src/lib/services/invoices.ts:148`).
- Wzorzec zasobu stanu: `PUT`/`DELETE /api/invoices/[id]/cancellation` (`src/pages/api/invoices/[id]/cancellation.ts`).
- Dialog edycji ma już przycisk akcji stanu „Anuluj fakturę” (`src/components/invoices/InvoiceFormDialog.tsx:208`). W S-07 odrzucono trzeci przycisk w wierszu.
- Wiersz listy pokazuje „—” zamiast dni, odsetek i rekompensaty dla grupy `current` (`src/components/invoices/InvoicesManager.tsx:158-174`).

## Desired End State

- Dialog „Edytuj fakturę” ma przycisk „Wstrzymaj eskalację” (dla niewstrzymanej) albo „Wznów eskalację” (dla wstrzymanej), obok „Anuluj fakturę”. Działa bez potwierdzenia. Dialog zostaje otwarty, a pola klienta, kwoty i terminu od razu się odblokowują albo blokują.
- Wstrzymana faktura jest na `/` w grupie „Wstrzymane”, ostatniej na liście. Wiersz pokazuje dni po terminie, odsetki i rekompensatę, jeśli faktura jest po terminie, a „—”, jeśli nie jest. Opis dialogu edycji podaje datę wstrzymania.
- Wstrzymanej faktury nie ma w żadnym ponagleniu. Klient, którego jedyne faktury na etapach 1–4 są wstrzymane, nie ma ponaglenia.
- Wstrzymać można każdą otwartą fakturę, także bieżącą i sprzed etapu 1.
- W czasie wstrzymania można zmienić klienta, kwotę i termin także po terminie. Serwer egzekwuje to samo. Po wznowieniu faktura po terminie jest znów zablokowana.
- Zapłata i anulowanie zdejmują wstrzymanie. Faktura przywrócona do otwartych wraca jako niewstrzymana. Baza nie dopuszcza wstrzymanej faktury zapłaconej ani anulowanej.

### Key Discoveries:

- Grupa `paused` w `groupInvoices` wyklucza wstrzymane z ponagleń bez zmiany logiki w `reminder.ts`, bo filtr `STAGE_BY_GROUP` przepuszcza tylko etapy 1–4 (`src/lib/reminder.ts:42`). Roadmapa przewidywała osobny filtr w `buildClientReminders`. Zamiast niego wystarczy jawny test, który pilnuje wykluczenia.
- `isInvoiceLocked` jest jedynym miejscem reguły blokady, więc wyjątek dla wstrzymanych dopisuje się raz, a serwis i dialog korzystają z niego od razu.
- `escalationGroup(days)` zostaje czystą funkcją dni. Wstrzymanie rozstrzyga `groupInvoices`, bo to on widzi fakturę.

## What We're NOT Doing

- Potwierdzenie przed wstrzymaniem lub wznowieniem: akcję łatwo odwrócić.
- Przycisk w wierszu listy: obie akcje są w dialogu edycji (decyzja S-07).
- Wybór daty wstrzymania przez użytkownika: datę ustawia serwer na „dziś” (czas polski).
- Historia wstrzymań, informacja o wstrzymaniu w `/history` i „wstrzymanie do daty” (automatyczne wznowienie).
- Zatrzymanie odsetek w czasie wstrzymania (FR-007: odsetki rosną dalej).
- Filtrowanie i sortowanie (S-11) oraz konfigurowalne progi (S-10).

## Implementation Approach

Wstrzymanie to trzecia data stanu, `paused_on date null`, obok `paid_on` i `cancelled_on`. Constraint dopuszcza ją tylko na otwartej fakturze, a zamknięcie (zapłata, anulowanie) ją czyści. Reguła czysta: `groupInvoices` kieruje fakturę z `pausedOn` do grupy `paused` przed liczeniem etapu, a `isInvoiceLocked` zwraca `false` dla wstrzymanej. API to zasób `PUT`/`DELETE /api/invoices/[id]/pause`, wzorem `cancellation`. UI wpina przełącznik w dialog edycji i podmienia fakturę w stanie wyspy. Grupy i ponaglenia przeliczają się wtedy same.

## Critical Implementation Details

- **Wyścig wznowienia z edycją**: serwis czyta wiersz, widzi wstrzymanie i przepuszcza zmianę pól blokowanych. Jeśli w międzyczasie faktura zostanie wznowiona, zapis nie może przejść. Warunek zapisu przy zmianie pól blokowanych to „termin nie minął **albo** faktura wstrzymana”, czyli w PostgREST `query.or(\`due_date.gte.${today},paused_on.not.is.null\`)` zamiast samego `gte("due_date", today)`. 0 wierszy kończy się kodem `not_found`, jak dziś.
- **Reset formularza przy przełączeniu**: po wznowieniu niezapisane zmiany w polach, które właśnie się zablokowały, zostałyby wyszarzone, a zapis skończyłby się kodem `locked`. Formularz w dialogu dostaje `key` po `id` i `pausedOn`, więc przełączenie resetuje go do danych zapisanych. Fokus zostaje na przycisku przełącznika, który nie jest odmontowywany i zmienia tylko etykietę.

## Phase 1: Dane, reguła i API

### Overview

Migracja, typy, reguła grupowania i blokady z testami, serwis, endpointy i kroki smoke. Po tej fazie całe zachowanie jest dostępne przez API i chronione po stronie serwera.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261008120000_add_invoice_paused_on.sql`

**Intent**: Dodać stan „eskalacja wstrzymana” jako datę i dopuścić go tylko na fakturze otwartej.

**Contract**: kolumna `paused_on date null` z checkiem zakresu jak `cancelled_on` (2000–2100); constraint `invoices_paused_only_open check (paused_on is null or (paid_on is null and cancelled_on is null))`. Polityki RLS bez zmian. Komentarz w pliku po polsku, wzorem poprzednich migracji.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Faktura niesie datę wstrzymania.

**Contract**: `Invoice.pausedOn: string | null` (YYYY-MM-DD; null = eskalacja niewstrzymana). Obiekty `Invoice` w testach i w `src/components/dev/KitchenSinkForms.tsx` dostają `pausedOn: null`.

#### 3. Reguła grupowania

**File**: `src/lib/escalation.ts` (+ `src/lib/escalation.test.ts`)

**Intent**: Wstrzymana faktura nie ma etapu i trafia do osobnej grupy na końcu listy.

**Contract**: `EscalationGroup` dostaje `"paused"`, a `GROUP_ORDER` kończy się na `"paused"` (po `"current"`). `groupInvoices<T extends { dueDate: string; number: string; pausedOn?: string | null }>` kieruje element z niepustym `pausedOn` do `"paused"`, nadal z `daysOverdue`. `escalationGroup(days, thresholds)` bez zmian. `GROUP_LABELS` w `src/components/invoices/InvoicesManager.tsx` dostaje wpis `paused: "Wstrzymane"` już w tej fazie, bo bez niego `Record<EscalationGroup, string>` nie przejdzie sprawdzenia typów. Testy: wstrzymana faktura 40 dni po terminie trafia do `paused`, a nie do `stage_4`; wstrzymana bieżąca trafia do `paused`; elementy bez `pausedOn` grupują się jak dotąd; kolejność grup.

#### 4. Reguła blokady

**File**: `src/lib/invoice-lock.ts` (+ `src/lib/invoice-lock.test.ts`)

**Intent**: Wstrzymanie zdejmuje całą blokadę (klient, kwota, termin).

**Contract**: `isInvoiceLocked(invoice: { dueDate: string; pausedOn: string | null }, today: string): boolean`, prawdziwe dokładnie wtedy, gdy `pausedOn === null` i `daysOverdue(dueDate, today) >= 1`. Testy: wstrzymana po terminie → niezablokowana; ta sama po wznowieniu (`pausedOn: null`) → zablokowana; dotychczasowe granice bez zmian.

#### 5. Ponaglenia (test)

**File**: `src/lib/reminder.test.ts`

**Intent**: Pilnować testem, że wstrzymane nie wchodzą do ponaglenia (FR-008), choć kod `reminder.ts` się nie zmienia.

**Contract**: testy `buildClientReminders`: klient z fakturą na etapie 4 i wstrzymaną fakturą 40 dni po terminie ma ponaglenie tylko z niewstrzymaną pozycją, a etap i sumy jej odpowiadają; klient, którego jedyna faktura po terminie jest wstrzymana, nie ma ponaglenia.

#### 6. Serwis

**File**: `src/lib/services/invoices.ts`

**Intent**: Wstrzymanie i wznowienie, czyszczenie wstrzymania przy zamknięciu oraz wyjątek od blokady przy edycji.

**Contract**:
- `COLUMNS` i `InvoiceRow`/`toInvoice` dostają `paused_on`.
- `pauseInvoice(supabase, id, today)`: ustawia `paused_on = today` tylko dla faktury otwartej i niewstrzymanej; 0 wierszy → `not_found`.
- `resumeInvoice(supabase, id)`: czyści `paused_on` tylko dla otwartej i wstrzymanej; 0 wierszy → `not_found`.
- `setInvoicePayment`: aktualizacja ustawia też `paused_on: null`.
- `cancelInvoice`: aktualizacja ustawia też `paused_on: null`.
- `updateInvoice`: blokadę sprawdza `isInvoiceLocked` na odczytanym wierszu (już z `pausedOn`). Warunek zapisu przy zmianie pól blokowanych opisuje Critical Implementation Details.

#### 7. API

**Files**: `src/pages/api/invoices/[id]/pause.ts`

**Intent**: Endpoint stanu wstrzymania wzorem `cancellation.ts`, z „dziś” liczonym na serwerze.

**Contract**:
- `PUT /api/invoices/[id]/pause` (bez body, `withInvoiceAuth`) → 200 `{ invoice }` z `pausedOn = todayInPoland(new Date())`.
- `DELETE /api/invoices/[id]/pause` → 200 `{ invoice }` z `pausedOn: null`.
- Niepoprawne `id`, cudza, zamknięta, już wstrzymana (PUT) albo niewstrzymana (DELETE) faktura → 404 `not_found`. `export const prerender = false`.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kroki HTTP dla wstrzymania, wyjątku od blokady, wznowienia, czyszczenia przy zamknięciu i izolacji właścicieli, dopięte po `editAndCancelSteps()` (A jest wtedy otwarta i 40 dni po terminie).

**Contract**: nowe `pauseSteps()`:
- wstrzymanie anonimowo → 401;
- wstrzymanie A → 200 z `pausedOn` = dziś; ponowne wstrzymanie A → 404; B wstrzymuje lub wznawia A → 404;
- edycja wstrzymanej A ze zmianą kwoty → 200;
- wznowienie A → 200 z `pausedOn: null`; ponowne wznowienie → 404; edycja A ze zmianą kwoty → 409 `locked`;
- wstrzymanie A, potem oznaczenie jako zapłaconej → 200 z `pausedOn: null`; przywrócenie wpłaty → `pausedOn: null`;
- wstrzymanie A, potem anulowanie → 200 z `pausedOn: null`; przywrócenie A;
- wstrzymanie anulowanej faktury → 404; niepoprawne id → 404.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Testy jednostkowe przechodzą (grupa `paused`, wyjątek blokady, wykluczenie z ponagleń): `npm test`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual Verification:

- W Supabase Studio próba ustawienia `paused_on` na fakturze zapłaconej lub anulowanej jest odrzucona przez constraint
- Faktura z ustawionym w Studio `paused_on` nie pojawia się w ponagleniu swojego klienta na `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wstrzymanie na liście

### Overview

Grupa „Wstrzymane” na `/`, przełącznik w dialogu edycji, stany w `/dev/ui` i dokumentacja.

### Changes Required:

#### 1. Hook wstrzymania

**File**: `src/components/hooks/use-invoice-pause.ts`

**Intent**: Wywołanie `PUT`/`DELETE …/pause` ze stanem `pending` i komunikatem błędu dla dialogu.

**Contract**: `useInvoicePause({ onChanged: (invoice: Invoice) => void })` → `{ pause(id), resume(id), pending, error }`; błędy przez `invoiceErrorMessage`.

#### 2. Dialog faktury

**File**: `src/components/invoices/InvoiceFormDialog.tsx`

**Intent**: Przełącznik wstrzymania w trybie edycji i odblokowane pola dla wstrzymanej.

**Contract**:
- Widok `PauseEscalationControl` (`paused`, `pending`, `error`, `onToggle`): przycisk `variant="outline"` z etykietą „Wstrzymaj eskalację” / „Wznów eskalację” (`pending`: „Zapisywanie...”) i błąd w `ServerError`. Wyeksportowany do kitchen sinka.
- `InvoiceFormDialog` dostaje `onPauseChanged?: (invoice: Invoice) => void`. W edycji pokazuje przełącznik nad „Anuluj fakturę”. `locked` liczy `isInvoiceLocked(invoice, today)` (uwzględnia wstrzymanie). Formularz ma `key` po `id` i `pausedOn` (patrz Critical Implementation Details).
- Opis dialogu dla wstrzymanej: „Faktura {numer} · {klient} · eskalacja wstrzymana od {data}”.
- Bez nadpisywania kolorów komponentów `ui` przez `className`.

#### 3. Lista otwartych

**File**: `src/components/invoices/InvoicesManager.tsx`

**Intent**: Grupa „Wstrzymane” i podmiana faktury po przełączeniu.

**Contract**: etykieta grupy `paused` („Wstrzymane”) pochodzi z fazy 1. Dni, odsetki i rekompensata pokazują „—”, gdy `daysOverdue <= 0`, zamiast warunku na grupę `current`, więc wstrzymana po terminie pokazuje rosnące odsetki. `onPauseChanged` podmienia fakturę w `invoices` i w `editing`. Dialog zostaje otwarty, a ponaglenia przeliczają się same.

#### 4. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Pokazać nowe stany w `/dev/ui`.

**Contract**: formularz wstrzymanej faktury po terminie (pola aktywne) oraz `PauseEscalationControl` w stanach: niewstrzymana, wstrzymana, w trakcie, z błędem.

#### 5. Dokumentacja

**File**: `README.md`

**Intent**: Opisać nowe zachowanie i migrację.

**Contract**: wiersz trasy `/` (wstrzymanie i wznowienie eskalacji, grupa „Wstrzymane”); zdanie o migracji `add_invoice_paused_on` w §Supabase Configuration; wymaganie tej migracji w §Smoke test.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual Verification:

- Wstrzymanie faktury z etapu 2 przenosi ją do „Wstrzymane” na końcu listy i usuwa z ponaglenia klienta bez przeładowania; odsetki w wierszu nadal rosną z dniami
- W dialogu wstrzymanej faktury po terminie klient, kwota i termin są aktywne; zmiana kwoty zapisuje się
- Wznowienie faktury 40 dni po terminie przenosi ją od razu na etap 4 (przeskok etapów), pola znów są wyłączone, a faktura wraca do ponaglenia
- Wstrzymanie bieżącej faktury działa; po wznowieniu wraca do „Bieżące”
- Zapłata wstrzymanej faktury i jej przywrócenie z `/history` zwraca ją na właściwy etap, a nie do „Wstrzymane”
- Fokus zostaje na przełączniku po wstrzymaniu i wznowieniu; dialog obsługuje klawiaturę (Esc, Tab)
- `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `groupInvoices`: wstrzymana po terminie → `paused`; wstrzymana bieżąca → `paused`; `paused` ostatnia w kolejności; brak `pausedOn` → dotychczasowe grupy.
- `isInvoiceLocked`: wstrzymana po terminie → false; niewstrzymana po terminie → true; granica dnia terminu bez zmian.
- `buildClientReminders`: wstrzymana faktura na etapie 4 nie trafia do ponaglenia i nie podnosi jego etapu; klient z samymi wstrzymanymi nie ma ponaglenia.

### Integration Tests:

- `npm run smoke`: wstrzymanie, 404 dla ponownego wstrzymania lub wznowienia i cudzej faktury, edycja wstrzymanej po terminie, `locked` po wznowieniu, czyszczenie `pausedOn` przy zapłacie i anulowaniu.

### Manual Testing Steps:

1. Dodać dwie faktury jednego klienta: 10 i 40 dni po terminie. Wstrzymać tę 40-dniową i sprawdzić, że ponaglenie klienta ma etap 2 i jedną pozycję.
2. W wstrzymanej zmienić termin i kwotę, potem wznowić i sprawdzić etap oraz blokadę.
3. Wstrzymać, oznaczyć jako zapłaconą, przywrócić z historii i sprawdzić, że faktura nie jest wstrzymana.

## Performance Considerations

Brak istotnych: jedna dodatkowa kolumna i jeden warunek w grupowaniu.

## Migration Notes

Migracja jest addytywna: istniejące faktury dostają `paused_on = null`, więc constraint jest spełniony. Lokalnie stosować przez `npx supabase migration up` (bez `db reset`, patrz lessons). Na produkcję trafia przez potok po merge PR-a, przed wdrożeniem kodu. Rollback Workera nie cofa kolumny. Stary kod ignoruje `paused_on`, więc wstrzymane faktury wróciłyby wtedy na etapy i do ponagleń, a constraint zablokowałby zapłatę i anulowanie wstrzymanej faktury (stary kod nie czyści `paused_on`).

## References

- Roadmap S-08: `context/foundation/roadmap.md`
- PRD: US-03, FR-003, FR-005, FR-007, FR-008, FR-013 w `context/foundation/prd.md`
- Poprzedni wycinek (blokada edycji, zasób `cancellation`): `context/archive/2026-10-07-invoice-edit-and-cancel/plan.md`
- Wzorzec zasobu stanu: `src/pages/api/invoices/[id]/cancellation.ts`
- Lekcje: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane, reguła i API

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up` — 4f50ae0
- [x] 1.2 Testy jednostkowe przechodzą (grupa `paused`, wyjątek blokady, wykluczenie z ponagleń): `npm test` — 4f50ae0
- [x] 1.3 Lint przechodzi: `npm run lint` — 4f50ae0
- [x] 1.4 Sprawdzenie typów przechodzi: `npx astro check` — 4f50ae0
- [x] 1.5 Build przechodzi: `npm run build` — 4f50ae0
- [x] 1.6 Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke` — 4f50ae0

#### Manual

- [x] 1.7 W Supabase Studio próba ustawienia `paused_on` na fakturze zapłaconej lub anulowanej jest odrzucona przez constraint — 4f50ae0
- [x] 1.8 Faktura z ustawionym w Studio `paused_on` nie pojawia się w ponagleniu swojego klienta na `/` — 4f50ae0

### Phase 2: Wstrzymanie na liście

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test`
- [x] 2.2 Lint przechodzi (w tym zakaz literałów kolorów): `npm run lint`
- [x] 2.3 Sprawdzenie typów przechodzi: `npx astro check`
- [x] 2.4 Build przechodzi: `npm run build`
- [x] 2.5 Smoke przechodzi na lokalnym dev serwerze (port 4321 ubity przed i po): `npm run smoke`

#### Manual

- [x] 2.6 Wstrzymanie faktury z etapu 2 przenosi ją do „Wstrzymane” na końcu listy i usuwa z ponaglenia klienta bez przeładowania; odsetki w wierszu nadal rosną z dniami
- [x] 2.7 W dialogu wstrzymanej faktury po terminie klient, kwota i termin są aktywne; zmiana kwoty zapisuje się
- [x] 2.8 Wznowienie faktury 40 dni po terminie przenosi ją od razu na etap 4 (przeskok etapów), pola znów są wyłączone, a faktura wraca do ponaglenia
- [x] 2.9 Wstrzymanie bieżącej faktury działa; po wznowieniu wraca do „Bieżące”
- [x] 2.10 Zapłata wstrzymanej faktury i jej przywrócenie z `/history` zwraca ją na właściwy etap, a nie do „Wstrzymane”
- [x] 2.11 Fokus zostaje na przełączniku po wstrzymaniu i wznowieniu; dialog obsługuje klawiaturę (Esc, Tab)
- [x] 2.12 `/dev/ui` pokazuje nowe stany w jasnym i ciemnym motywie
