---
date: 2026-10-14T18:55:49+02:00
researcher: Claude (Opus 5.5) dla Dominik Blacha
git_commit: eec55b0c3c92ea0e65d625d8e7163c9b1eb513f4
branch: main
repository: 10x-kurs
topic: "Faza 2 planu testów: przejścia stanu, izolacja i walidacja przez API (ryzyka #4, #5, #6)"
tags: [research, testing, integration, supabase, rls, api, vitest]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: przejścia stanu, izolacja i walidacja przez API

**Date**: 2026-10-14T18:55:49+02:00
**Researcher**: Claude (Opus 5.5) dla Dominik Blacha
**Git Commit**: eec55b0c3c92ea0e65d625d8e7163c9b1eb513f4 (drzewo robocze: zmieniony `context/foundation/test-plan.md`, kod `src/` i `supabase/` bez zmian)
**Branch**: main
**Repository**: 10x-kurs

## Research Question

Faza 2 z `context/foundation/test-plan.md` §3: „Dowieść, że niedozwolone
przejścia, cudze id i wartości spoza zakresu są odrzucane bez zmiany w bazie;
ponaglenie i lista nie obejmują faktur zapłaconych ani anulowanych (filtr
`listOpenInvoices`)” — ryzyka #4, #5, #6. Research ugruntowuje kolumnę „Context
`/10x-research` must ground” z §2:

- #4: kontrakt endpointów (kody, ciała błędów), constrainty i triggery w
  migracjach, tłumaczenie błędów bazy na odpowiedzi.
- #5: polityki RLS per operacja, sposób ustalania właściciela w API, złożony
  klucz obcy klient–właściciel.
- #6: które schematy walidują które endpointy; czy schemat serwera = schemat
  formularza; reguły niemonotonicznych progów.

Dodatkowo: jak technicznie uruchomić testy integracyjne (Vitest 5 + lokalny
Supabase) w tym repo.

## Summary

- **Niedozwolone przejście stanu daje 404, nie 409.** Każdy serwis przejścia
  filtruje UPDATE po oczekiwanym stanie (np. `.is("paused_on", null)`), dostaje
  0 wierszy i mapuje to na `not_found` → 404
  (`src/lib/services/invoices.ts:175-183`, `:223-276`;
  `src/lib/services/invoices-api.ts:11-18`). 409 pojawia się wyłącznie dla
  kodów `locked`, `duplicate_number`, `client_inactive` (faktury) oraz
  `duplicate_*`, `has_open_invoices` (klienci; `src/lib/services/clients-api.ts:10-18`).
  Test nie odróżni więc po statusie „zły stan” od „brak lub cudze id” — musi
  sprawdzać kod błędu w ciele i niezmieniony wiersz.
- **Izolacja opiera się tylko na RLS i złożonym FK.** W inspekcji
  `src/lib/services/*.ts` i `src/pages/api/**` żadne zapytanie nie filtruje po
  `user_id`, a `user_id` nie trafia do payloadu (kolumny z `toRow`, domyślne
  `auth.uid()` w czterech migracjach tworzących tabele). Grep po
  `service_role|SUPABASE_SERVICE|serviceRole` w repo (bez `node_modules`,
  `dist`, `.astro`) nic nie znalazł. Cudze id na każdym z 10 endpointów
  mutujących z `[id]` daje 404; cudzy `clientId` przy tworzeniu faktury daje
  404 `client_not_found` przez FK `invoices_client_owner_fkey`.
- **Serwer używa tych samych schematów zod co formularze** (5 schematów, 5
  hooków formularzy — tabela niżej), a migracje powielają prawie każdą regułę
  zakresu. Luki domenowe bez reguły w żadnej warstwie: `paidOn` wcześniejsze
  niż `due_date`, kolejność trzech kwot rekompensaty. `paidOn ≤ dziś` egzekwuje
  tylko zod.
- **`listOpenInvoices` wyklucza zapłacone i anulowane SQL-em**
  (`invoices.ts:72-81`: `.is("paid_on", null).is("cancelled_on", null)`);
  wywołują ją dokładnie dwie strony: `src/pages/index.astro:29` (ponaglenia) i
  `src/pages/invoices.astro:26` (lista).
- **Najtańsza warstwa z prawdziwym sygnałem:** Vitest w Node wywołujący
  eksportowane handlery tras bezpośrednio, z `vi.mock("@/lib/supabase")`
  zwracającym klienta supabase-js zalogowanego jako użytkownik testowy na
  lokalnym Supabase. Ścieżka obejmuje zod, mapowanie statusów, serwis, RLS,
  constrainty i triggery bez uruchomionego serwera; jedynym importem `astro:*`
  w `src/pages/api` i `src/lib` (poza `import type`) są `src/lib/supabase.ts:3`
  i `src/lib/config-status.ts:1`. Stan wiersza po odrzuceniu sprawdza się
  osobnym odczytem tym samym klientem.

## Detailed Findings

### 1. Kontrakt endpointów (#4)

Wspólne strażniki, w tej kolejności (dla tras z `[id]`):

1. Niepoprawny UUID w `[id]` → 404 `{error:"not_found"}` — **przed** sprawdzeniem
   sesji, więc niezalogowany z złym id dostaje 404, nie 401
   (np. `src/pages/api/invoices/[id]/payment.ts:12-13`).
2. Brak `context.locals.user` → 401 `{error:"unauthorized"}`
   (`invoices-api.ts:30`, `clients-api.ts:30`, `src/pages/api/settings.ts:11`,
   `src/pages/api/sender-profile.ts:11`). Middleware nie chroni `/api/*`:
   `PROTECTED_ROUTES` zawiera tylko ścieżki stron (`src/middleware.ts:6,27`).
3. Brak klienta Supabase → 500 `{error:"config_missing"}` (`invoices-api.ts:33`).
4. Ciało nie-JSON → 400 `{error:"invalid_input", fieldErrors:{}}`; błąd zod →
   400 `{error:"invalid_input", fieldErrors}` (`invoices-api.ts:45-55`).

Ciało sukcesu to `{invoice}` / `{client}`; błędy to wyłącznie `{error: code}`
(`src/lib/http.ts:1-3`, `invoices-api.ts:20-23`).

| Metoda + ścieżka | Plik | Serwis | Sukces | Błędy |
|---|---|---|---|---|
| POST /api/invoices | `invoices/index.ts` | `createInvoice` (`invoices.ts:103`) | 201 | 409 duplicate_number, 404 client_not_found, 409 client_inactive, 500 |
| PUT /api/invoices/:id | `invoices/[id].ts` | `updateInvoice` (`:190`) | 200 | 404 not_found, 409 locked, 409 duplicate_number, 404 client_not_found, 409 client_inactive, 500 |
| PUT /api/invoices/:id/payment | `payment.ts:11` | `setInvoicePayment(id, paidOn)` (`:116`) | 200 | 404 not_found, 500 |
| DELETE /api/invoices/:id/payment | `payment.ts:20` | `setInvoicePayment(id, null)` | 200 | 404 not_found, 409 client_inactive, 500 |
| PUT /api/invoices/:id/cancellation | `cancellation.ts` | `cancelInvoice` (`:223`) | 200 | 404 not_found, 500 (każdy błąd bazy, `:231`) |
| DELETE /api/invoices/:id/cancellation | `cancellation.ts` | `restoreInvoice` (`:237`) | 200 | 404, 409 duplicate_number, 409 client_inactive, 500 |
| PUT /api/invoices/:id/pause | `pause.ts` | `pauseInvoice` (`:250`) | 200 | 404, 500 (`:259`) |
| DELETE /api/invoices/:id/pause | `pause.ts` | `resumeInvoice` (`:265`) | 200 | 404, 500 (`:274`) |
| POST /api/clients | `clients/index.ts` | `createClient` (`clients.ts:98`) | 201 | 409 duplicate_nip / duplicate_name / `_inactive`, 500 |
| PUT /api/clients/:id | `clients/[id].ts` | `updateClient` (`clients.ts:104`) | 200 | 404, 409 duplicate_*, 500 |
| PUT /api/clients/:id/deactivation | `deactivation.ts` | `deactivateClient` (`clients.ts:121`) | 200 | 409 has_open_invoices, 404, 500 |
| DELETE /api/clients/:id/deactivation | `deactivation.ts` | `restoreClient` (`clients.ts:137`) | 200 | 404, 500 |
| PUT /api/settings | `settings.ts` | upsert (`services/settings.ts:54-58`) | 200 | 400, 500 unknown (każdy błąd bazy, `settings.ts:30-31`) |
| PUT /api/sender-profile | `sender-profile.ts` | upsert (`services/sender-profile.ts:41-45`) | 200 | 400, 500 unknown |

Nie ma twardego usuwania: brak DELETE na `/api/invoices/:id` i
`/api/clients/:id`, a RLS ma `for delete ... using (false)`
(`20261003120000_create_clients.sql:33-35`,
`20261005120000_create_invoices.sql:38-40`).

### 2. Macierz stan × akcja (#4)

Stany faktury: O = otwarta, niewstrzymana (bieżąca lub po terminie),
P = wstrzymana, Pd = zapłacona, X = anulowana. Warstwa blokująca:
F = filtr UPDATE/SELECT w serwisie (0 wierszy → 404), A = sprawdzenie w
serwisie, C = check constraint, T = trigger, U = unikalny indeks.

| Akcja | O bieżąca | O po terminie | P | Pd | X |
|---|---|---|---|---|---|
| Edycja tylko numeru | 200 | 200 (numer nie jest polem blokowanym, `invoice-lock.ts:12-21`) | 200 | 404 F (`invoices.ts:200,210`) | 404 F |
| Edycja klienta/kwoty/terminu | 200 | **409 locked** A (`:208`); przy wyścigu filtr `or(due_date.gte.today, paused_on.not.is.null)` (`:211`) daje 0 wierszy → **404** | 200 (wstrzymana nie jest blokowana, `invoice-lock.ts:9`) | 404 F | 404 F |
| Zapłata (PUT payment) | 200: migawka + `paused_on:null` (`:159-171`) | 200 | 200, czyści wstrzymanie | 200: zmiana samej daty, migawka zostaje (`:144-153`) | 404 F (`:138`); C `invoices_single_closed_state` jako druga linia |
| Cofnięcie wpłaty (DELETE payment) | 404 F (`:129`) | 404 F | 404 F (celowo bez wznowienia, `:121`) | 200: czyści `paid_on`, `paid_rate_bp`, `paid_compensation_grosze`, `paused_on` (`:126`); klient usunięty → **409 client_inactive** T | 404 F (`:128`) |
| Anulowanie | 200: `cancelled_on=today`, `paused_on=null` (`:226`) | 200 (bez blokady) | 200 | 404 F (`:228`); C | 404 F |
| Przywrócenie anulowanej | 404 F (`:242`) | 404 F | 404 F | 404 F | 200; numer zajęty → **409 duplicate_number** U; klient usunięty → **409 client_inactive** T |
| Wstrzymanie | 200 | 200 | **404** F (`:257`) | 404 F; C `invoices_paused_only_open` | 404 F; C |
| Wznowienie | 404 F (`:272`) | 404 F | 200 | 404 F | 404 F |

Tworzenie faktury: 201; duplikat numeru wśród nieanulowanych (bez względu na
wielkość liter) → 409 U; klient usunięty → 409 client_inactive T; klient cudzy
lub nieistniejący → 404 client_not_found (FK).

Klienci (A = aktywny, D = usunięty):

| Akcja | A | D |
|---|---|---|
| Edycja | 200 lub 409 duplicate_* (`clients.ts:57-83`) | 404 F (`:110`) |
| Usunięcie (deactivation PUT) | bez otwartych faktur 200; z otwartą lub wstrzymaną → **409 has_open_invoices** T; zapłacone i anulowane nie blokują | 404 F (`:126`) |
| Przywrócenie | 404 F (`:142`) | 200 |
| Nowa faktura dla klienta | dozwolona | 409 client_inactive T |

Kto blokuje (wg inspekcji serwisów i 9 migracji):

- **Tylko serwis/API:** `locked`; `paidOn ≤ dziś`; podwójne wstrzymanie;
  cofnięcie wpłaty otwartej; wznowienie niewstrzymanej; przywrócenie
  nieanulowanej; edycja zapłaconej lub anulowanej (żadna reguła w bazie nie
  zabrania zmiany kwoty zapłaconej faktury).
- **Serwis i baza:** zapłata/anulowanie faktury już zamkniętej
  (`invoices_single_closed_state`), wstrzymanie zamkniętej
  (`invoices_paused_only_open`), spójność migawki
  (`invoices_payment_snapshot_check`).
- **Tylko baza:** `client_inactive` (trigger), duplikat numeru (indeks), cudzy
  klient (FK), usunięcie klienta z otwartą fakturą (trigger).

Constrainty istotne dla spójności (cytaty z migracji):

- `invoices_single_closed_state check (paid_on is null or cancelled_on is null)` — `20261007180000_add_invoice_cancelled_on.sql:12`
- `invoices_paused_only_open check (paused_on is null or (paid_on is null and cancelled_on is null))` — `20261008120000_add_invoice_paused_on.sql:11`
- `invoices_payment_snapshot_check check ((paid_on is null) = (paid_rate_bp is null) and (paid_on is null) = (paid_compensation_grosze is null))` — `20261010130000_add_invoice_payment_snapshot.sql:32-35`
- `unique index invoices_user_number_key on public.invoices (user_id, lower(number)) where cancelled_on is null` — `20261007180000:17`
- `invoices_client_owner_fkey foreign key (client_id, user_id) references public.clients (id, user_id)` — `20261005120000_create_invoices.sql:14`, oparty na `clients_id_user_key unique (id, user_id)` (`:4`)
- Triggery (`20261009120000_add_client_deactivated_on.sql`):
  `clients_guard_deactivation` — `before update of deactivated_on`, rzuca
  `client_has_open_invoices` przy zmianie null → data, gdy istnieje faktura z
  `paid_on is null and cancelled_on is null` (`:17-36`);
  `invoices_guard_client_active` — `before insert or update of client_id,
  paid_on, cancelled_on`, rzuca `client_inactive`, gdy nowy wiersz jest otwarty
  a klient ma `deactivated_on` (`:43-66`). Obie funkcje są security invoker
  (`:13`).

### 3. Tłumaczenie błędów bazy na HTTP (#4)

- Faktury, `toErrorCode` (`invoices.ts:64-70`), dopasowanie po nazwie
  constraintu w `message + details`: 23505 + `invoices_user_number_key` →
  duplicate_number (409); 23503 + `invoices_client_owner_fkey` →
  client_not_found (404); P0001 + `message === "client_inactive"` →
  client_inactive (409); każdy inny błąd (w tym 23514 check violation) →
  unknown (500). Używane przez create (`:105`), `updateResult` (`:180`), edit
  (`:214`), restore (`:244`). Cancel, pause i resume mapują **każdy** błąd na
  unknown (`:231`, `:259`, `:274`).
- Klienci: 23505 + `clients_user_nip_key` / `clients_user_name_key` →
  duplicate_nip / duplicate_name, z wariantem `_inactive`, gdy kolidujący
  wiersz ma `deactivated_on` (`clients.ts:47-83`); P0001 + `message ===
  "client_has_open_invoices"` → has_open_invoices (`clients.ts:128-131`).
- Triggery używają zwykłego `raise exception`, więc SQLSTATE to P0001; treść
  wyjątku jest kontraktem z serwisami (komentarz w `20261009120000:11-12`).

### 4. Izolacja danych (#5)

- **Właściciel:** `user_id default auth.uid()` w `clients`
  (`20261003120000:5`), `invoices` (`20261005120000:8`), `user_settings`
  (`20261010120000:6`), `sender_profiles` (`20261010140000:7`). Serwisy budują
  wiersz z jawnej listy kolumn (`clients.ts:43-45`, `invoices.ts:55-62`,
  `settings.ts:27-40`, `sender-profile.ts:23-30`), a `z.object` odrzuca nieznane
  klucze, więc `user_id` z ciała nie dociera do bazy.
- **RLS:** te same polityki w 4 tabelach — `authenticated`: select `using
  ((select auth.uid()) = user_id)`, insert `with check` tym samym wyrażeniem,
  update `using` + `with check`, delete `using (false)`; `anon`: wszystkie
  cztery operacje `false` (`create_clients.sql:16-53`,
  `create_invoices.sql:21-58`, `create_user_settings.sql:25-62`,
  `create_sender_profiles.sql:15-52`).
- **Odczyty** opierają się wyłącznie na RLS: `listClients`/`listActiveClients`
  (`clients.ts:86-96`), trzy `list*Invoices` (`invoices.ts:72-101`),
  `getSettings` (`settings.ts:43-47`) i `getSenderProfile`
  (`sender-profile.ts:33-37`) — dwa ostatnie przez `.maybeSingle()` bez filtra,
  poprawne tylko dlatego, że RLS zostawia jeden wiersz. Strony czytają przez te
  same serwisy (`clients.astro:19`, `history.astro:21`, `invoices.astro:25-29`,
  `index.astro:28-33`, `settings.astro:21`). Nie ma endpointów GET dla danych
  (w inspekcji `src/pages/api/**`), więc izolację odczytów testuje się na
  poziomie serwisów jako użytkownik B → pusta lista / `null`.
- **Cudze id:** każdy z 10 endpointów mutujących z `[id]` (tabela §1) zwraca
  404 `not_found` — RLS ukrywa wiersz, UPDATE/SELECT zwraca 0 wierszy. Żaden
  endpoint nie zwraca 403.
- **Cudzy klient w fakturze:** para (id klienta A, user_id B) nie istnieje →
  23503 → 404 `client_not_found` (`invoices.ts:67`, `invoices-api.ts:15`).
  Wniosek (nieuruchomiony): trigger `invoices_guard_client_active` czyta klienta
  pod RLS użytkownika B, dostaje NULL i nie rzuca `client_inactive`, więc nie
  zdradza, czy klient A jest usunięty.
- **Settings i sender-profile** nie mają id: upsert z `onConflict:"user_id"`,
  a `user_id` pochodzi z `auth.uid()`; B nie może zapisać wiersza A (insert
  `with check`, update `using`/`with check`).
- `scripts/smoke.mjs` już sprawdza izolację przez HTTP (B na cudzym kliencie,
  fakturze, płatności, anulowaniu, wstrzymaniu, dezaktywacji; settings i
  sender-profile A/B — grupy na liniach 58-118, 128-174, 176-208, 210-306,
  308-368, 370-480, 482-519, 592-641), ale nie czyta wierszy po odrzuceniu i
  nie działa w CI (`.github/workflows/ci.yml` nie uruchamia smoke).

### 5. Walidacja po stronie serwera (#6)

Serwer = formularz (ten sam schemat zod):

| Endpoint | Schemat serwera | Hook formularza |
|---|---|---|
| POST/PUT clients | `clientInputSchema` `client-schemas.ts:19-23` | `use-client-form.ts:46` |
| POST/PUT invoices | `invoiceInputSchema` `invoice-schemas.ts:45-52` | `use-invoice-form.ts:71` |
| PUT invoices/:id/payment | `paymentInputSchema(todayInPoland)` `invoice-schemas.ts:55-61` | `use-payment-form.ts:38` |
| PUT settings | `settingsInputSchema` `settings-schemas.ts:51-73` | `use-settings-form.ts:78` |
| PUT sender-profile | `senderProfileInputSchema` `sender-profile-schemas.ts:43-48` | `use-sender-profile-form.ts:63` |

Endpointy bez ciała (deactivation, cancellation, pause, DELETE payment)
walidują tylko UUID w ścieżce.

Reguły zakresu (zod vs baza):

- Faktura: kwota jako tekst `"1 234,56"`, 0 < grosze ≤ 99 999 999 999
  (`invoice-schemas.ts:10,19-22`) = baza `amount_grosze between 1 and
  99999999999` (`20261005120000:11`); numer 1–50 po trim = baza (`:10`);
  termin 2000–2100, przeszłe dozwolone; **baza nie ma checka na `due_date`**.
  Schemat nie ma daty wystawienia — reguła „termin ≥ wystawienie” nie istnieje.
- Płatność: `paidOn` 2000–2100 i ≤ dziś (czas polski). Baza sprawdza tylko
  2000–2100 (`20261007120000:7`). Brak reguły `paidOn ≥ due_date` /
  `≥ created_at` w obu warstwach.
- Ustawienia: progi to liczby całkowite **jako tekst** 1–365, ściśle rosnące
  (superRefine); baza `1<=t1<t2<t3<t4<=365` (`20261010120000:16-22`). Stopa
  0–100,00% → 0–10000 bp; baza `0..10000` (`:11`). Rekompensaty 0–100 000,00 zł;
  baza to samo (`:12-14`); kolejność trzech kwot niewymagana w obu warstwach.
  Liczba JSON zamiast tekstu → 400 (istotne dla payloadów testów).
- Klient i profil nadawcy: sumy kontrolne NIP i IBAN tylko w zod
  (`nip.ts:7-13`, `iban.ts:10-15`); baza sprawdza tylko format cyfr.
- Błąd checka w bazie przy ustawieniach/profilu → 500 unknown
  (`settings.ts:30-31`, `sender-profile.ts:30-31`), nie 400.

Pokrycie jednostkowe schematów już istnieje (`client-schemas.test.ts`,
`invoice-schemas.test.ts`, `settings-schemas.test.ts`,
`sender-profile-schemas.test.ts`, plus `nip.test.ts`, `iban.test.ts`,
`invoice-lock.test.ts`): granice kwot, progi niemonotoniczne, stopa, przyszła
data wpłaty. Test integracyjny potrzebuje więc jednego przypadku 400 na
endpoint, sprawdzającego, że schemat jest podpięty i wiersz się nie zmienia.

### 6. Filtr `listOpenInvoices` (ponaglenie i lista)

- `invoices.ts:72-81`: `.is("paid_on", null).is("cancelled_on", null)
  .order("due_date")` — wyklucza zapłacone i anulowane, zostawia wstrzymane.
- Wywołania (jedyne dwa w `src/`): `src/pages/index.astro:29` → `RemindersManager`
  (`index.astro:47-54`), gdzie `buildClientReminders` (`src/lib/reminder.ts:33-43`)
  zostawia tylko grupy stage_1–4, więc wstrzymane nie trafiają do ponaglenia;
  `src/pages/invoices.astro:26` → lista z zakładką „Wstrzymane”
  (`InvoicesManager.tsx:136-137`). `/history` używa `listPaidInvoices` /
  `listCancelledInvoices` (`history.astro:21`).
- Test integracyjny: jako użytkownik z fakturą otwartą, wstrzymaną, zapłaconą i
  anulowaną `listOpenInvoices` zwraca dokładnie otwartą i wstrzymaną.

### 7. Infrastruktura testów integracyjnych

Wersje w `node_modules`: astro 7.3.2, vitest 5.0.3, vite 8.3.0,
@astrojs/cloudflare 14.3.1, @supabase/supabase-js 2.116.0, @supabase/ssr
0.12.7, supabase CLI 2.117.0; Node 24.21.0 (`.nvmrc`).

Opcje warstwy (od najtańszej z pełnym sygnałem):

1. **Bezpośrednie wywołanie handlera (rekomendowana).** Handler dotyka tylko
   `context.locals.user`, `context.request` (nagłówki, `.json()`),
   `context.params` i `context.cookies` (przekazywane do `createSupabase`).
   `vi.mock("@/lib/supabase", () => ({ createClient: () => userClient }))`
   omija `astro:env/server` (fabryka mocka nie ładuje oryginału). Kontekst:
   `{ request: new Request(url, { method, body, headers }), params: { id },
   locals: { user }, cookies: {} } as APIContext`, gdzie `user` pochodzi z
   `userClient.auth.getUser()`. Pokrywa: UUID, 401, zod, mapowanie statusów,
   serwis, RLS, constrainty, triggery. Pomija: middleware (`getUser` z
   ciasteczek) i `@supabase/ssr` — obie ścieżki są w zakresie smoke i §7 planu
   (auth ze startera).
2. **Wywołanie serwisów** z klientem supabase-js zalogowanym jako A/B — jak (1)
   bez zod i statusów HTTP. Właściwe dla odczytów (`list*`, `getSettings`,
   `getSenderProfile`), bo nie mają endpointów.
3. **Bezpośrednio PostgREST** (supabase-js bez serwisów) — do sprawdzenia, co
   baza blokuje sama (np. lock nie jest egzekwowany w bazie; patrz Open
   Questions).
4. **HTTP przeciw serwerowi** (jak `scripts/smoke.mjs`, 719 linii) — wymaga
   działającego serwera na 4321, co lekcja w `context/foundation/lessons.md`
   („Dev server aplikacji…”) opisuje jako kruche.

Odrzucone jako droższe bez dodatkowego sygnału: `getViteConfig` z
`astro/config` (uruchamia hooki integracji, w tym adapter Cloudflare i
`@cloudflare/vite-plugin`; działanie pod Vitest 5 nieweryfikowane) oraz
`experimental_AstroContainer.renderToResponse` z `astro/container` (obsługuje
endpointy, ale nadal wymaga rozwiązania `astro:env/server`). Alternatywą dla
mocka jest `resolve.alias` `astro:env/server` → stub czytający `process.env`.

Lokalny Supabase (`supabase/config.toml`): API 54321, DB 54322, Postgres 17;
`enable_confirmations = false` (`:209`), więc `auth.signUp` zwraca sesję od
razu; `[auth.rate_limit] sign_in_sign_ups = 30` na 5 minut na IP (`:190`) —
zestaw tworzący wielu użytkowników może go przekroczyć. `[db.seed]` wskazuje
`./seed.sql` (`:60-65`), który nie istnieje. `npx supabase status -o env`
zwraca m.in. `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` (do
`auth.admin.createUser`, z pominięciem limitu) i wypisuje też komunikaty CLI,
które trzeba odfiltrować.

Podział unit/integration: obecny `vitest.config.ts` ma `include:
["src/**/*.test.ts"]`, a `npm test` działa w CI (`ci.yml:25`) bez bazy — plik
integracyjny pasujący do tego wzorca złamałby `checks`. Vitest 5 ma
`test.projects` (typy w `node_modules/vitest/dist/chunks/plugin.d.*.d.ts`),
`globalSetup` i `provide`; alternatywy: osobny config + skrypt npm albo
`describe.skipIf(!process.env.SUPABASE_URL)`. Wspólna baza → `fileParallelism:
false` albo unikalne dane per test.

Env: `.env` i `.dev.vars` (gitignorowane) mają `SUPABASE_URL` i
`SUPABASE_KEY`; `.env` wskazuje `http://127.0.0.1:54321`. W CI `.env` nie ma —
faza 3 musi zmapować `API_URL`/`ANON_KEY` z `supabase status -o env`.
Workflow nie ma dziś kroku `supabase start` (`ci.yml`, job `checks`).

## Code References

- `src/lib/services/invoices.ts:64-70` — `toErrorCode`, mapowanie błędów Postgres
- `src/lib/services/invoices.ts:72-81` — `listOpenInvoices`
- `src/lib/services/invoices.ts:116-183` — zapłata / zmiana daty / cofnięcie, `updateResult`
- `src/lib/services/invoices.ts:190-217` — edycja z blokadą
- `src/lib/services/invoices.ts:223-276` — anulowanie, przywrócenie, wstrzymanie, wznowienie
- `src/lib/services/invoices-api.ts:11-78` — strażniki i mapa statusów faktur
- `src/lib/services/clients-api.ts:10-54` — strażniki i mapa statusów klientów
- `src/lib/services/clients.ts:47-146` — błędy duplikatów, CRUD i dezaktywacja klienta
- `src/lib/supabase.ts:3` — jedyny (obok `config-status.ts:1`) import `astro:env/server` w `src/lib`
- `src/middleware.ts:6,27-30` — `PROTECTED_ROUTES` nie obejmuje `/api/*`
- `supabase/migrations/20261005120000_create_invoices.sql:4,14,18,21-58` — FK właściciela, indeks, RLS
- `supabase/migrations/20261009120000_add_client_deactivated_on.sql:17-66` — oba triggery
- `supabase/migrations/20261010130000_add_invoice_payment_snapshot.sql:32-35` — spójność migawki
- `supabase/config.toml:190,209` — limit rejestracji, potwierdzenia wyłączone
- `scripts/smoke.mjs:5-47,703-719` — pomocnicy HTTP i runner kroków
- `vitest.config.ts` — obecny `include`

## Architecture Insights

- Wzorzec „UPDATE z warunkiem stanu + 0 wierszy = not_found” jest jednolity w
  serwisach faktur i klientów; daje atomowość przejść i odporność na wyścigi,
  kosztem nieodróżnialności „zły stan” od „brak/cudze id” w statusie.
- Kontrakt baza ↔ serwis opiera się na nazwach constraintów i treści
  wyjątków (`invoices.ts:16-20`, `20261009120000:11-12`). Test integracyjny na
  prawdziwej bazie to jedyna warstwa, która złapie rozjazd nazw (unit z mockiem
  by go nie wykrył) — zgodne z anty-wzorcem z §2 („Mockowanie klienta Supabase”).
- Serwisy przyjmują `SupabaseClient` jako parametr i nie importują `astro:*`,
  co czyni je i handlery testowalnymi w Node bez Astro.

## Historical Context (from prior changes)

- `context/changes/testing-domain-rules/research.md:186,271` — wykluczenie
  zapłaconych i anulowanych z ponaglenia istnieje tylko w SQL, odłożone do fazy 2.
- `context/foundation/test-plan.md` §6.5 — to samo, jako notatka po fazie 1.
- `context/archive/2026-10-07-invoice-edit-and-cancel/plan.md:303-305`,
  `context/archive/2026-10-09-client-deactivate-restore/plan.md:261-265`,
  `context/archive/2026-10-10-sender-profile/plan.md:396-398` — warstwą
  „Integration Tests” był `smoke.mjs`; mapowanie błędów serwisów świadomie bez
  testów Vitest, bo wymaga Supabase.
- `context/foundation/lessons.md` — „Migracje lokalnie: zachowuj dane dev, nie
  rób db reset” (testy nie mogą resetować bazy dev bez zgody); „Tytuły testów
  po angielsku”.

## Related Research

- `context/changes/testing-domain-rules/research.md` — faza 1 (reguły domenowe).

## Open Questions

Wybory dla `/10x-plan` (nie fakty do dalszego szukania):

1. **404 dla złego stanu — akceptować czy zmienić?** Plan §2 wymaga „4xx i
   niezmieniony wiersz”, co obecny kod spełnia. Zmiana na 409 to zmiana
   kontraktu produktu, nie testu. Rekomendacja: testy asercją `status 404` +
   `error: "not_found"` + niezmieniony wiersz; ewentualna zmiana kontraktu
   osobno.
2. **Tworzenie użytkowników testowych:** `auth.signUp` (limit 30/5 min) vs
   `auth.admin.createUser` z `SERVICE_ROLE_KEY` (tylko w kodzie testów, nigdy w
   `src/`). Rekomendacja: admin + logowanie hasłem, kilku użytkowników na plik.
3. **Baza docelowa:** lokalna baza dev (dane użytkownika zostają, unikalne
   e-maile per przebieg, wiersze testowe zostają) vs osobna instancja. Lekcja
   wyklucza `db reset` na bazie dev bez zgody.
4. **Luki bez ochrony w bazie** (do udokumentowania lub osobnej zmiany, nie do
   naprawy w fazie testów): blokada edycji po terminie i zakaz edycji
   zapłaconej faktury egzekwuje tylko serwis — klient z kluczem anon i sesją
   może przez PostgREST zmienić `amount_grosze` / `due_date` zapłaconej faktury
   (RLS update pozwala; wniosek z polityk i constraintów, nieuruchomiony);
   `paid_on` w przyszłości lub przed `due_date` przechodzi przez bazę. Czy
   faza 2 ma te luki dowodzić testem na PostgREST (opcja 3 w §7), czy tylko
   odnotować?
5. **Nazwa i miejsce plików integracyjnych** (`*.int.test.ts` vs
   `tests/integration/`) oraz czy `npm test` ma je pomijać do fazy 3.

Niepewności (nieuruchomione): czy PostgREST zawsze umieszcza nazwę constraintu
w `message`/`details` dla 23505/23503 (kod na tym polega, smoke przechodzi na
`duplicate_number` i `client_not_found`); co Astro zwraca dla niewyeksportowanej
metody (np. DELETE `/api/invoices/:id`); czy lokalny GoTrue egzekwuje limit
rejestracji dla 127.0.0.1.
