# Dezaktywacja i przywracanie klienta — Implementation Plan

## Overview

S-09 z roadmapy (FR-002). Użytkownik może „usunąć” klienta, co oznacza go jako nieaktywnego z zachowaniem historii, oraz przywrócić go. Usunięcie jest zablokowane, dopóki klient ma choć jedną otwartą fakturę. Usunięty klient znika z wyboru klienta przy fakturze. Próba dodania klienta, który jest duplikatem usuniętego, kończy się komunikatem wskazującym, że ten klient jest wśród usuniętych.

## Current State Analysis

- `public.clients` nie ma kolumny stanu (`supabase/migrations/20261003120000_create_clients.sql:3-10`). Twarde `DELETE` jest zablokowane polityką `clients_delete_authenticated … using (false)` (tamże, `:33-36`), a komentarz w migracji zapowiada dezaktywację w osobnym wycinku.
- Indeksy duplikatów `clients_user_nip_key` i `clients_user_name_key` (tamże, `:13-14`) nie mają warunku na aktywność. Duplikaty wśród przyszłych nieaktywnych klientów są więc wykrywane już teraz. Serwis rozpoznaje je po nazwie indeksu (`src/lib/services/clients.ts:10-11,35-42`).
- Stan faktury zależy od dat: otwarta to `paid_on is null and cancelled_on is null`, także wstrzymana (`src/lib/services/invoices.ts:61-70`). Faktury łączą się z klientem złożonym FK `invoices_client_owner_fkey` na `(client_id, user_id)` (mapowany na `client_not_found`, `src/lib/services/invoices.ts:14,57`).
- Z otwartą fakturą kończą się cztery ścieżki: `createInvoice` (`:92`), `updateInvoice` ze zmianą klienta (`:126`), cofnięcie wpłaty `setInvoicePayment(null)` (`:102`) i `restoreInvoice` (`:173`). Każda z nich mogłaby utworzyć otwartą fakturę u nieaktywnego klienta.
- `listClients` (`src/lib/services/clients.ts:44`) zasila zarówno `/clients` (`src/pages/clients.astro:19`), jak i wybór klienta w dialogu faktury na `/` (`src/pages/index.astro:22`).
- Wzorce do powtórzenia: zasób stanu `PUT`/`DELETE /api/invoices/[id]/cancellation` (`src/pages/api/invoices/[id]/cancellation.ts`), potwierdzenie `CancelInvoiceDialog` z widokiem `CancelInvoiceView` używanym też w `/dev/ui` (`src/components/invoices/CancelInvoiceDialog.tsx`), hook `use-cancel-invoice` oraz sekcja z przywracaniem `CancelledInvoicesSection` (`src/components/invoices/CancelledInvoicesSection.tsx`).
- W projekcie nie ma jeszcze triggerów ani funkcji plpgsql.

## Desired End State

- Każdy wiersz aktywnego klienta na `/clients` ma obok „Edytuj” przycisk „Usuń”. Otwiera on potwierdzenie („Usunąć klienta X?”, opis „historia faktur zostaje, klienta można przywrócić”, przyciski „Wróć” i „Usuń klienta”).
- Jeśli klient ma otwartą fakturę (także wstrzymaną), usunięcie kończy się komunikatem w dialogu i klient zostaje aktywny. Anulowane i zapłacone faktury nie blokują usunięcia.
- Po usunięciu klient przechodzi bez przeładowania do sekcji „Usunięci klienci” pod tabelą aktywnych: nazwa, NIP, data usunięcia i przycisk „Przywróć”. Usuniętego klienta nie da się edytować (brak przycisku, a API zwraca 404).
- Usunięty klient nie pojawia się w wyborze klienta w dialogu faktury na `/`. Jego zapłacone i anulowane faktury w `/history` nadal pokazują jego nazwę.
- Niezmiennik „nieaktywny klient nie ma otwartych faktur” egzekwuje baza. Dodanie lub edycja faktury z usuniętym klientem, cofnięcie wpłaty i przywrócenie anulowanej faktury usuniętego klienta kończą się kodem `client_inactive` (409) i komunikatem „Klient tej faktury jest usunięty. Przywróć go na stronie Klienci.”
- Dodanie lub edycja klienta z NIP-em albo nazwą (bez NIP) usuniętego klienta zwraca `duplicate_nip_inactive` lub `duplicate_name_inactive` (409) z komunikatem wskazującym sekcję „Usunięci klienci”. Kolizja z aktywnym klientem nadal zwraca dotychczasowe `duplicate_nip` lub `duplicate_name`.
- Przywrócony klient wraca do tabeli aktywnych i do wyboru w dialogu faktury.

### Key Discoveries:

- Indeksy duplikatów obejmują wszystkich klientów, więc przywrócenie klienta nigdy nie koliduje z duplikatem. Jedyna zmiana w ścieżce duplikatu to rozróżnienie komunikatu.
- Złożony FK bierze na wierszu klienta blokadę `FOR KEY SHARE`, która **nie** koliduje z `UPDATE` kolumny niebędącej kluczem. Sam FK nie chroni więc przed wyścigiem z dezaktywacją; patrz Critical Implementation Details.
- Wszystkie cztery ścieżki „faktura staje się otwarta” przechodzą przez `INSERT` albo `UPDATE` jednej z kolumn `client_id`, `paid_on` lub `cancelled_on`. Jeden trigger na `invoices` pokrywa je wszystkie, bez dopisywania warunków w każdym serwisie.
- Grupa `paused` należy do otwartych (`listOpenInvoices` nie filtruje `paused_on`), więc reguła „każda otwarta blokuje” obejmuje wstrzymane bez osobnego warunku.

## What We're NOT Doing

- Twarde usuwanie wiersza klienta: polityka `delete … using (false)` zostaje.
- Automatyczne przywracanie klienta przy przywracaniu jego faktury (zdecydowano: blokada z komunikatem).
- Wyjątek dla wstrzymanych faktur: wstrzymana faktura blokuje usunięcie jak każda otwarta.
- Edycja usuniętego klienta (najpierw „Przywróć”).
- Przycisk „Przywróć” bezpośrednio w komunikacie o duplikacie: komunikat wskazuje sekcję, a akcja zostaje w sekcji.
- Wybór daty usunięcia przez użytkownika: datę ustawia serwer na „dziś” w czasie polskim.
- Filtr lub przełącznik „pokaż nieaktywnych” zamiast osobnej sekcji.
- Zmiany w ponagleniach, eskalacji i liście faktur: niezmiennik gwarantuje, że faktury usuniętego klienta nie są otwarte.

## Implementation Approach

Stan klienta zależy od daty, tak jak stany faktury: nowa kolumna `deactivated_on date null`. Regułę egzekwują dwa triggery `BEFORE` w tej samej migracji, które zgłaszają wyjątek o stałej treści, a serwisy mapują ją na kody, tak jak dziś nazwy indeksów i FK. Dezaktywacja i przywrócenie to zasób `PUT`/`DELETE /api/clients/[id]/deactivation`, wzorem `cancellation`. Rozróżnienie duplikatu aktywnego i usuniętego odbywa się w ścieżce błędu `createClient`/`updateClient`: po naruszeniu indeksu jedno zapytanie odczytuje kolidujący wiersz. UI powtarza wzorce S-07: `AlertDialog` z widokiem wydzielonym dla `/dev/ui`, hook w `src/components/hooks/`, sekcja z przywracaniem i fokusem na nagłówku.

## Critical Implementation Details

- **Wyścig dezaktywacji z otwarciem faktury**: trigger na `invoices` musi odczytać klienta przez `select … from clients where id = new.client_id for share`, a nie zwykłym `select`. `FOR SHARE` koliduje z `UPDATE` wiersza klienta, więc równoległa dezaktywacja czeka na commit faktury (a potem jej `exists` w trybie READ COMMITTED widzi tę fakturę) albo faktura czeka na commit dezaktywacji i widzi `deactivated_on`. Funkcje triggerów są `security invoker` (domyślnie), bo RLS właściciela obejmuje oba odczyty, a `FOR SHARE` wymaga polityki `update`, którą właściciel ma.
- **Kontrakt wyjątków**: triggery zgłaszają `raise exception 'client_has_open_invoices'` oraz `raise exception 'client_inactive'` (SQLSTATE `P0001`). Serwisy rozpoznają je po `error.code === "P0001"` i treści `error.message`. Teksty są kontraktem między migracją a `src/lib/services/*`, tak jak nazwy indeksów, i trzeba to zaznaczyć komentarzem po obu stronach.
- **Fokus**: po usunięciu klienta wiersz, z którego otwarto dialog, znika, więc fokus trafia na nagłówek sekcji „Usunięci klienci” (`tabIndex={-1}`). Po przywróceniu fokus trafia na „Dodaj klienta”, wzorem `CancelledInvoicesSection`.

## Phase 1: Dane i API

### Overview

Migracja z kolumną i triggerami, typy, serwis klientów (dezaktywacja, przywrócenie, rozróżnienie duplikatów, blokada edycji usuniętego), mapowanie `client_inactive` w serwisie faktur, endpoint i kroki smoke. Po tej fazie cała reguła działa i jest chroniona przez API i bazę.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261009120000_add_client_deactivated_on.sql`

**Intent**: Dodać stan „usunięty” jako datę oraz egzekwować w bazie, że usunięty klient nie ma otwartych faktur, z obu stron (dezaktywacja klienta i otwarcie faktury).

**Contract**:
- Kolumna `clients.deactivated_on date null` z checkiem zakresu 2000–2100, jak `paid_on`.
- Funkcja `clients_guard_deactivation()` i trigger `before update of deactivated_on on clients`: gdy `old.deactivated_on is null and new.deactivated_on is not null` i istnieje faktura klienta z `paid_on is null and cancelled_on is null`, zgłasza `raise exception 'client_has_open_invoices'`.
- Funkcja `invoices_guard_client_active()` i trigger `before insert or update of client_id, paid_on, cancelled_on on invoices`: gdy `new.paid_on is null and new.cancelled_on is null`, odczytuje `deactivated_on` klienta przez `for share`; jeśli nie jest null, zgłasza `raise exception 'client_inactive'`.
- Polityki RLS bez zmian (update tylko dla właściciela, delete zablokowany). Komentarz w pliku po polsku, wzorem poprzednich migracji, z uwagą, że treści wyjątków są kontraktem z `src/lib/services/`.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Klient niesie datę usunięcia.

**Contract**: `Client.deactivatedOn: string | null` (YYYY-MM-DD; null oznacza klienta aktywnego).

#### 3. Serwis klientów

**File**: `src/lib/services/clients.ts`

**Intent**: Dezaktywacja i przywrócenie, lista aktywnych do dialogu faktury, blokada edycji usuniętego i komunikat duplikatu wskazujący usuniętego klienta.

**Contract**:
- `COLUMNS`, `ClientRow` i `toClient` dostają `deactivated_on`.
- `ClientErrorCode` dostaje `"duplicate_nip_inactive" | "duplicate_name_inactive" | "has_open_invoices"`.
- `listClients(supabase)` zwraca wszystkich klientów (z `deactivatedOn`). Nowe `listActiveClients(supabase)` filtruje `deactivated_on is null`.
- `updateClient`: dodatkowo `.is("deactivated_on", null)`, więc usunięty → `not_found`.
- Po naruszeniu `clients_user_nip_key` lub `clients_user_name_key` serwis odczytuje kolidujący wiersz (NIP: `nip = input.nip`; nazwa: `nip is null` i nazwa równa bez rozróżniania wielkości liter, z pominięciem `id` edytowanego klienta). Jeśli ten wiersz ma `deactivated_on`, zwraca wariant `_inactive`. Błąd tego odczytu zwraca zwykły `duplicate_*`.
- `deactivateClient(supabase, id, today)`: ustawia `deactivated_on = today` tylko dla aktywnego klienta; wyjątek `client_has_open_invoices` → `has_open_invoices`; 0 wierszy → `not_found`.
- `restoreClient(supabase, id)`: czyści `deactivated_on` tylko dla usuniętego; 0 wierszy → `not_found`.

#### 4. Serwis faktur

**File**: `src/lib/services/invoices.ts`

**Intent**: Każda ścieżka, która odrzuca otwarcie faktury u usuniętego klienta, zwraca czytelny kod zamiast `unknown`.

**Contract**: `InvoiceErrorCode` dostaje `"client_inactive"`. `toErrorCode` mapuje `P0001` + `client_inactive`. `setInvoicePayment` przechodzi przez `toErrorCode` (dziś zwraca `unknown` dla każdego błędu), żeby cofnięcie wpłaty zwracało `client_inactive`. `createInvoice`, `updateInvoice` i `restoreInvoice` już używają `toErrorCode`.

#### 5. API

**Files**: `src/lib/services/clients-api.ts`, `src/pages/api/clients/[id]/deactivation.ts`, `src/lib/services/invoices-api.ts`

**Intent**: Endpoint dezaktywacji wzorem `cancellation.ts` oraz statusy nowych kodów.

**Contract**:
- `clients-api.ts`: `STATUS_BY_CODE` dostaje `duplicate_nip_inactive: 409`, `duplicate_name_inactive: 409`, `has_open_invoices: 409`. Dochodzi guard bez body (`withClientAuth`: auth i konfiguracja), wydzielony z `withClientInput`.
- `PUT /api/clients/[id]/deactivation` (bez body) → 200 `{ client }` z `deactivatedOn = todayInPoland(new Date())`; 409 `has_open_invoices`; 404 `not_found` (także dla cudzego klienta i niepoprawnego uuid).
- `DELETE /api/clients/[id]/deactivation` → 200 `{ client }` z `deactivatedOn: null`; 404 dla aktywnego lub cudzego.
- `export const prerender = false`.
- `invoices-api.ts`: `STATUS_BY_CODE.client_inactive = 409`.

#### 6. Komunikaty

**Files**: `src/lib/client-errors.ts`, `src/lib/invoice-errors.ts`

**Intent**: Polskie komunikaty nowych kodów.

**Contract**:
- `duplicate_nip_inactive`: „Klient z tym NIP-em jest wśród usuniętych. Przywróć go w sekcji „Usunięci klienci”.”
- `duplicate_name_inactive`: „Klient o tej nazwie (bez NIP) jest wśród usuniętych. Przywróć go w sekcji „Usunięci klienci”.”
- `has_open_invoices`: „Nie można usunąć klienta, dopóki ma otwarte faktury (także wstrzymane). Oznacz je jako zapłacone albo je anuluj.”
- `client_inactive` (faktury): „Klient tej faktury jest usunięty. Przywróć go na stronie Klienci.”

#### 7. Strona faktur

**File**: `src/pages/index.astro`

**Intent**: Dialog faktury proponuje tylko aktywnych klientów.

**Contract**: `listClients` → `listActiveClients`. Puste `clients` przy samych usuniętych klientach daje istniejący stan „Przejdź do klientów” (`InvoicesManager.tsx:100`).

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć regułę end-to-end przez HTTP i bazę, w tym triggery.

**Contract**: nowa grupa `deactivationSteps()` (dopisana do `steps` po `pauseSteps`) na **własnym** kliencie z NIP-em, żeby nie ruszać `clientIds.noNip` używanego przez inne grupy:
1. utworzenie klienta i otwartej faktury;
2. `PUT …/deactivation` → 409 `has_open_invoices`;
3. wstrzymanie faktury, potem `PUT …/deactivation` → 409 (wstrzymana też blokuje);
4. anulowanie faktury, potem `PUT …/deactivation` → 200 z `deactivatedOn`;
5. `DELETE /api/invoices/[id]/cancellation` → 409 `client_inactive`;
6. `POST /api/invoices` z tym klientem → 409 `client_inactive`;
7. `POST /api/clients` z tym samym NIP-em → 409 `duplicate_nip_inactive`;
8. `PUT /api/clients/[id]` → 404;
9. użytkownik B: `PUT …/deactivation` i `DELETE …/deactivation` na kliencie A → 404;
10. `DELETE …/deactivation` → 200 z `deactivatedOn: null`;
11. ponowne `DELETE …/deactivation` → 404;
12. przywrócenie anulowanej faktury → 200.

Ścieżka „cofnięcie wpłaty u usuniętego klienta” w kroku osobnej faktury: zapłać, dezaktywuj, `DELETE …/payment` → 409 `client_inactive`.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke przechodzi na dev serverze, łącznie z nową grupą `deactivationSteps`: `npm run smoke`

#### Manual Verification:

- W Supabase Studio klient z otwartą fakturą nie daje się zdezaktywować ręcznym `update` (błąd `client_has_open_invoices`)

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: UI

### Overview

Usuwanie z potwierdzeniem i sekcja „Usunięci klienci” na `/clients`, komunikaty duplikatów, komunikat `client_inactive` w `/history`, kitchen sink i README.

### Changes Required:

#### 1. Potwierdzenie usunięcia

**Files**: `src/components/clients/DeactivateClientDialog.tsx`, `src/components/hooks/use-deactivate-client.ts`

**Intent**: Dialog potwierdzenia wzorem `CancelInvoiceDialog`, z widokiem wydzielonym dla `/dev/ui`.

**Contract**: `DeactivateClientView({ title, description, pending, error, standalone, onConfirm })`, eksporty `deactivateTitle(name)` („Usunąć klienta {name}?”) i `DEACTIVATE_DESCRIPTION` („Klient zniknie z wyboru przy nowych fakturach. Historia jego faktur zostaje, a klienta możesz przywrócić.”). Przyciski „Wróć” i „Usuń klienta” (`variant="destructive"`), dialog otwarty do zakończenia żądania. Hook `useDeactivateClient({ onDeactivated })` robi `PUT /api/clients/[id]/deactivation` i mapuje błąd przez `clientErrorMessage`, więc `has_open_invoices` pokazuje się w dialogu.

#### 2. Lista klientów

**File**: `src/components/clients/ClientsManager.tsx`

**Intent**: Rozdzielić aktywnych i usuniętych, dodać „Usuń” w wierszu aktywnego i sekcję usuniętych z przywracaniem.

**Contract**:
- `initialClients` zawiera wszystkich. Tabela główna i pusty stan („Nie masz jeszcze klientów”) dotyczą tylko aktywnych.
- Wiersz aktywnego ma „Edytuj” i „Usuń” (`variant="outline"`, ikona `Trash2`).
- Pod tabelą jest sekcja „Usunięci klienci (n)”, renderowana tylko przy n > 0: kolumny nazwa, NIP, data usunięcia (`formatDate`) i przycisk „Przywróć” wołający `DELETE …/deactivation`, z błędem w `Alert` nad tabelą, jak w `CancelledInvoicesSection`.
- Usunięci są sortowani po dacie usunięcia malejąco, a potem po nazwie.
- Fokus zgodnie z Critical Implementation Details. Po zapisie w `ClientFormDialog` błąd `duplicate_*_inactive` pojawia się jako zwykły komunikat formularza (z `clientErrorMessage`), bez nowych zmian w dialogu.

#### 3. Historia faktur

**Files**: `src/components/invoices/CancelledInvoicesSection.tsx`, `src/components/invoices/PaidInvoicesManager.tsx`

**Intent**: Przywrócenie faktury usuniętego klienta pokazuje komunikat `client_inactive`.

**Contract**: oba komponenty już mapują błąd przez `invoiceErrorMessage`. Sprawdzić, że `client_inactive` nie wpada w specjalny przypadek `duplicate_number`; zmiany kodu tylko wtedy, gdy mapowanie go gubi.

#### 4. Kitchen sink

**File**: `src/components/dev/KitchenSinkForms.tsx`

**Intent**: Stany nowego dialogu i listy w `/dev/ui`.

**Contract**: `DeactivateClientView` w stanach domyślnym, `pending` i z błędem `has_open_invoices`. `ClientsManager` z przykładowymi danymi zawierającymi co najmniej jednego usuniętego klienta. Komunikat formularza klienta dla `duplicate_nip_inactive`.

#### 5. README

**File**: `README.md`

**Intent**: Udokumentować migrację i smoke.

**Contract**: w akapicie migracji zdanie o `add_client_deactivated_on` (nullowalna `deactivated_on`, triggery: usunięcie zablokowane przy otwartych fakturach, otwarta faktura u usuniętego klienta odrzucana). W sekcji Smoke wymóg tej migracji dla kroków usuwania i przywracania klienta.

### Success Criteria:

#### Automated Verification:

- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi (bez literałów kolorów i klas palety): `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Smoke nadal przechodzi: `npm run smoke`

#### Manual Verification:

- „Usuń” klienta bez otwartych faktur przenosi go do sekcji „Usunięci klienci” bez przeładowania i zostaje tam po odświeżeniu
- „Usuń” klienta z otwartą (także wstrzymaną) fakturą pokazuje komunikat, a klient zostaje aktywny
- „Przywróć” wraca klienta do tabeli aktywnych z fokusem na „Dodaj klienta”
- Dodanie klienta z NIP-em usuniętego klienta pokazuje komunikat wskazujący sekcję „Usunięci klienci”
- Usunięty klient nie występuje w wyborze klienta w dialogu „Dodaj fakturę”
- W `/history` przywrócenie anulowanej faktury usuniętego klienta pokazuje komunikat `client_inactive`
- `/dev/ui` pokazuje nowe stany poprawnie w trybie jasnym i ciemnym

**Implementation Note**: Po tej fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Logika czysta tej zmiany jest minimalna (mapowanie kodów w serwisach wymaga Supabase). Brak nowych testów vitest; istniejące muszą przechodzić.

### Integration Tests:

- `deactivationSteps` w `scripts/smoke.mjs` (Phase 1, punkt 8) pokrywa triggery, wszystkie cztery ścieżki „faktura staje się otwarta”, izolację między użytkownikami i rozróżnienie duplikatów.

### Manual Testing Steps:

1. Klient z jedną wstrzymaną fakturą → „Usuń” → komunikat, klient aktywny.
2. Anuluj tę fakturę → „Usuń” → klient w sekcji „Usunięci klienci”.
3. `/history` → „Przywróć” tej faktury → komunikat `client_inactive`.
4. `/clients` → „Przywróć” klienta → `/history` → „Przywróć” faktury → faktura wraca na `/`.
5. Dodaj klienta o nazwie usuniętego klienta (bez NIP, inną wielkością liter) → komunikat o usuniętym.

## Performance Considerations

Trigger na `invoices` wykonuje jeden odczyt klienta po kluczu głównym. Trigger na `clients` wykonuje `exists` po `invoices.client_id`, co pokrywa indeks złożonego FK (do sprawdzenia przy implementacji; przy obecnej skali nie jest to istotne).

## Migration Notes

Migracja jest addytywna (nullowalna kolumna z wartością null dla wszystkich istniejących klientów, więc wszyscy pozostają aktywni). Triggery nie wpływają na istniejące wiersze. Lokalnie stosuj `npx supabase migration up`, nie `db reset`. Na produkcję trafia przez potok po merge PR-a.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-09)
- PRD: `context/foundation/prd.md` (FR-002)
- Wzorzec zasobu stanu: `src/pages/api/invoices/[id]/cancellation.ts`
- Wzorzec potwierdzenia: `src/components/invoices/CancelInvoiceDialog.tsx`
- Wzorzec sekcji z przywracaniem: `src/components/invoices/CancelledInvoicesSection.tsx`
- Poprzedni plan: `context/archive/2026-10-07-invoice-edit-and-cancel/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane i API

#### Automated

- [x] 1.1 Migracja stosuje się lokalnie bez utraty danych: `npx supabase migration up`
- [x] 1.2 Typy i Astro przechodzą: `npx astro check`
- [x] 1.3 Lint przechodzi: `npm run lint`
- [x] 1.4 Testy jednostkowe przechodzą: `npm test`
- [x] 1.5 Build przechodzi: `npm run build`
- [x] 1.6 Smoke przechodzi na dev serverze, łącznie z nową grupą `deactivationSteps`: `npm run smoke`

#### Manual

- [x] 1.7 W Supabase Studio klient z otwartą fakturą nie daje się zdezaktywować ręcznym `update` (błąd `client_has_open_invoices`)

### Phase 2: UI

#### Automated

- [ ] 2.1 Typy i Astro przechodzą: `npx astro check`
- [ ] 2.2 Lint przechodzi (bez literałów kolorów i klas palety): `npm run lint`
- [ ] 2.3 Testy jednostkowe przechodzą: `npm test`
- [ ] 2.4 Build przechodzi: `npm run build`
- [ ] 2.5 Smoke nadal przechodzi: `npm run smoke`

#### Manual

- [ ] 2.6 „Usuń” klienta bez otwartych faktur przenosi go do sekcji „Usunięci klienci” bez przeładowania i zostaje tam po odświeżeniu
- [ ] 2.7 „Usuń” klienta z otwartą (także wstrzymaną) fakturą pokazuje komunikat, a klient zostaje aktywny
- [ ] 2.8 „Przywróć” wraca klienta do tabeli aktywnych z fokusem na „Dodaj klienta”
- [ ] 2.9 Dodanie klienta z NIP-em usuniętego klienta pokazuje komunikat wskazujący sekcję „Usunięci klienci”
- [ ] 2.10 Usunięty klient nie występuje w wyborze klienta w dialogu „Dodaj fakturę”
- [ ] 2.11 W `/history` przywrócenie anulowanej faktury usuniętego klienta pokazuje komunikat `client_inactive`
- [ ] 2.12 `/dev/ui` pokazuje nowe stany poprawnie w trybie jasnym i ciemnym
